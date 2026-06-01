(function () {
  'use strict';

  // Selector: every image inside case-study content + the intro hero image.
  // We exclude tiny decorative icons via [aria-hidden="true"] and any [data-no-zoom].
  var SELECTOR = '.study-main img, .intro-stage img, .zoomable';

  function shouldZoom(img) {
    if (img.hasAttribute('data-no-zoom')) return false;
    if (img.getAttribute('aria-hidden') === 'true') return false;
    // Skip very small images (icons, etc.)
    var rect = img.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return false;
    return true;
  }

  // Build overlay once.
  var overlay = document.createElement('div');
  overlay.className = 'img-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image viewer');
  overlay.innerHTML =
    '<div class="img-lightbox__stage">' +
      '<img class="img-lightbox__img" alt="" />' +
    '</div>' +
    '<button type="button" class="img-lightbox__close" aria-label="Close">✕</button>';
  document.body.appendChild(overlay);

  var stage = overlay.querySelector('.img-lightbox__stage');
  var lbImg = overlay.querySelector('.img-lightbox__img');
  var closeBtn = overlay.querySelector('.img-lightbox__close');

  var scale = 1;
  var tx = 0, ty = 0;
  var ZOOM_IN = 2.2;

  function applyTransform(animate) {
    lbImg.style.transition = animate ? '' : 'none';
    lbImg.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
  }

  function reset() {
    scale = 1; tx = 0; ty = 0;
    overlay.classList.remove('is-zoomed');
    applyTransform(true);
  }

  function open(src, alt) {
    lbImg.src = src;
    lbImg.alt = alt || '';
    reset();
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { lbImg.src = ''; }, 200);
  }

  function clampPan() {
    var sRect = stage.getBoundingClientRect();
    var w = lbImg.clientWidth * scale;
    var h = lbImg.clientHeight * scale;
    var maxX = Math.max(0, (w - sRect.width) / 2);
    var maxY = Math.max(0, (h - sRect.height) / 2);
    if (tx > maxX) tx = maxX;
    if (tx < -maxX) tx = -maxX;
    if (ty > maxY) ty = maxY;
    if (ty < -maxY) ty = -maxY;
  }

  function toggleZoomAt(clientX, clientY) {
    if (scale > 1) {
      reset();
      return;
    }
    var rect = lbImg.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    scale = ZOOM_IN;
    tx = (cx - clientX) * (ZOOM_IN - 1);
    ty = (cy - clientY) * (ZOOM_IN - 1);
    clampPan();
    overlay.classList.add('is-zoomed');
    applyTransform(true);
  }

  // Bind clicks (event delegation so dynamically added imgs work too).
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest(SELECTOR);
    if (!img) return;
    if (!shouldZoom(img)) return;
    // Don't hijack clicks inside anchors that wrap images.
    if (img.closest('a[href]')) return;
    e.preventDefault();
    open(img.currentSrc || img.src, img.alt);
  });

  closeBtn.addEventListener('click', close);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target === stage) close();
  });

  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
  });

  // Click / double-tap on the image to toggle zoom.
  lbImg.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleZoomAt(e.clientX, e.clientY);
  });

  // Mouse wheel zoom.
  overlay.addEventListener('wheel', function (e) {
    if (!overlay.classList.contains('is-open')) return;
    e.preventDefault();
    var prev = scale;
    var delta = -e.deltaY * 0.0015;
    scale = Math.min(5, Math.max(1, scale + delta * scale));
    if (scale === prev) return;
    if (scale <= 1.01) { reset(); return; }
    // Zoom toward cursor.
    var rect = lbImg.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var ratio = scale / prev;
    tx = (tx + (cx - e.clientX)) * ratio - (cx - e.clientX);
    ty = (ty + (cy - e.clientY)) * ratio - (cy - e.clientY);
    clampPan();
    overlay.classList.add('is-zoomed');
    applyTransform(false);
  }, { passive: false });

  // Drag to pan (mouse + single touch).
  var dragging = false;
  var startX = 0, startY = 0, startTx = 0, startTy = 0;

  function onPointerDown(e) {
    if (scale <= 1) return;
    dragging = true;
    overlay.classList.add('is-panning');
    var p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
    startTx = tx; startTy = ty;
  }
  function onPointerMove(e) {
    if (!dragging) return;
    var p = e.touches ? e.touches[0] : e;
    tx = startTx + (p.clientX - startX);
    ty = startTy + (p.clientY - startY);
    clampPan();
    applyTransform(false);
    if (e.cancelable) e.preventDefault();
  }
  function onPointerUp() {
    dragging = false;
    overlay.classList.remove('is-panning');
  }
  lbImg.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  lbImg.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  // Pinch-to-zoom (two-finger).
  var pinchStartDist = 0;
  var pinchStartScale = 1;
  function dist(t) {
    var dx = t[0].clientX - t[1].clientX;
    var dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }
  overlay.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      pinchStartDist = dist(e.touches);
      pinchStartScale = scale;
    }
  }, { passive: true });
  overlay.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinchStartDist > 0) {
      var d = dist(e.touches);
      scale = Math.min(5, Math.max(1, pinchStartScale * (d / pinchStartDist)));
      if (scale > 1.01) overlay.classList.add('is-zoomed');
      clampPan();
      applyTransform(false);
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });
  overlay.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) pinchStartDist = 0;
    if (scale <= 1.01) reset();
  });
})();
