(function () {
  'use strict';

  // Selector: every image inside case-study content + the intro hero image.
  // We exclude tiny decorative icons via [aria-hidden="true"] and any [data-no-zoom].
  var SELECTOR = '.study-main img, .intro-stage img, .zoomable';

  var prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

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
  var closeCleanupTimer = null;

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
    clearTimeout(closeCleanupTimer);
    overlay.classList.remove('is-closing');
    lbImg.src = src;
    lbImg.alt = alt || '';
    reset();
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    cancelSettle();
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    document.body.style.overflow = '';
    // The exit pop (mirroring the entrance) plays via the .is-closing
    // animation; clear the source once it's had time to finish so the
    // image doesn't just vanish mid-flight. A timeout (not transitionend)
    // keeps this reliable even under reduced motion, where the animation
    // is disabled entirely.
    var cleanupDelay = prefersReducedMotion ? 0 : 210;
    closeCleanupTimer = setTimeout(function () {
      overlay.classList.remove('is-closing');
      lbImg.src = '';
    }, cleanupDelay);
  }

  function getBounds() {
    var sRect = stage.getBoundingClientRect();
    var w = lbImg.clientWidth * scale;
    var h = lbImg.clientHeight * scale;
    return {
      maxX: Math.max(0, (w - sRect.width) / 2),
      maxY: Math.max(0, (h - sRect.height) / 2),
      stageWidth: sRect.width,
      stageHeight: sRect.height,
    };
  }

  function clampPan() {
    var b = getBounds();
    if (tx > b.maxX) tx = b.maxX;
    if (tx < -b.maxX) tx = -b.maxX;
    if (ty > b.maxY) ty = b.maxY;
    if (ty < -b.maxY) ty = -b.maxY;
  }

  // Soft boundary resistance — the further past the edge, the less the
  // image follows the pointer, instead of a hard, "frozen" stop.
  function rubberband(overshoot, dimension, constant) {
    constant = constant || 0.55;
    if (dimension <= 0) return 0;
    return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
  }

  function withRubberband(raw, max, dimension) {
    if (raw > max) return max + rubberband(raw - max, dimension, 0.55);
    if (raw < -max) return -max + rubberband(raw + max, dimension, 0.55);
    return raw;
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

  // Click / double-tap on the image to toggle zoom. A real drag-to-pan
  // gesture also ends on the image and fires a native 'click' on release —
  // hasDragged suppresses that so panning never accidentally re-toggles zoom.
  var hasDragged = false;
  lbImg.addEventListener('click', function (e) {
    e.stopPropagation();
    if (hasDragged) {
      hasDragged = false;
      return;
    }
    toggleZoomAt(e.clientX, e.clientY);
  });

  // Mouse wheel zoom.
  overlay.addEventListener('wheel', function (e) {
    if (!overlay.classList.contains('is-open')) return;
    e.preventDefault();
    cancelSettle();
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

  // ── Drag to pan (mouse + single touch) ──────────────────────────────
  // 1:1 pointer tracking with soft rubber-band resistance at the edges,
  // velocity-projected momentum on release, and a critically-damped
  // spring settle that can be re-grabbed (interrupted) at any instant.
  var dragging = false;
  var startX = 0, startY = 0, startTx = 0, startTy = 0;
  var DRAG_THRESHOLD = 6;
  var velocitySamples = [];
  var settleRAF = null;

  function pushVelocitySample(x, y, t) {
    velocitySamples.push({ x: x, y: y, t: t });
    if (velocitySamples.length > 5) velocitySamples.shift();
  }

  function getReleaseVelocity() {
    if (velocitySamples.length < 2) return { vx: 0, vy: 0 };
    var first = velocitySamples[0];
    var last = velocitySamples[velocitySamples.length - 1];
    var dt = (last.t - first.t) / 1000;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt }; // px/s
  }

  // Apple's exponential-decay projection: where would this velocity coast
  // to a stop, not just "how far did the finger move".
  function project(velocity, decelerationRate) {
    decelerationRate = decelerationRate || 0.998;
    return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
  }

  function cancelSettle() {
    if (settleRAF) {
      cancelAnimationFrame(settleRAF);
      settleRAF = null;
    }
  }

  // Critically-damped spring (no overshoot) driving tx/ty toward a target,
  // starting from whatever the live on-screen position/velocity already is
  // — so grabbing the image mid-settle redirects it instantly, no jump.
  function springTo(targetX, targetY, initialVX, initialVY) {
    cancelSettle();
    if (prefersReducedMotion) {
      tx = targetX;
      ty = targetY;
      applyTransform(false);
      return;
    }
    var velX = initialVX;
    var velY = initialVY;
    var lastT = null;
    var stiffness = 210;
    var damping = 28;

    function frame(now) {
      if (lastT === null) lastT = now;
      var dt = Math.min((now - lastT) / 1000, 0.032);
      lastT = now;

      var ax = -stiffness * (tx - targetX) - damping * velX;
      var ay = -stiffness * (ty - targetY) - damping * velY;
      velX += ax * dt;
      velY += ay * dt;
      tx += velX * dt;
      ty += velY * dt;
      applyTransform(false);

      var settled =
        Math.abs(tx - targetX) < 0.4 &&
        Math.abs(ty - targetY) < 0.4 &&
        Math.abs(velX) < 4 &&
        Math.abs(velY) < 4;

      if (settled) {
        tx = targetX;
        ty = targetY;
        applyTransform(false);
        settleRAF = null;
      } else {
        settleRAF = requestAnimationFrame(frame);
      }
    }

    settleRAF = requestAnimationFrame(frame);
  }

  function onPointerDown(e) {
    if (scale <= 1) return;
    cancelSettle();
    dragging = true;
    hasDragged = false;
    overlay.classList.add('is-panning');
    var p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
    startTx = tx; startTy = ty;
    velocitySamples = [];
    pushVelocitySample(p.clientX, p.clientY, performance.now());
  }

  function onPointerMove(e) {
    if (!dragging) return;
    var p = e.touches ? e.touches[0] : e;
    var now = performance.now();
    var rawTx = startTx + (p.clientX - startX);
    var rawTy = startTy + (p.clientY - startY);
    var b = getBounds();

    if (prefersReducedMotion) {
      tx = Math.max(-b.maxX, Math.min(b.maxX, rawTx));
      ty = Math.max(-b.maxY, Math.min(b.maxY, rawTy));
    } else {
      tx = withRubberband(rawTx, b.maxX, b.stageWidth);
      ty = withRubberband(rawTy, b.maxY, b.stageHeight);
    }

    if (Math.hypot(p.clientX - startX, p.clientY - startY) > DRAG_THRESHOLD) {
      hasDragged = true;
    }
    pushVelocitySample(p.clientX, p.clientY, now);
    applyTransform(false);
    if (e.cancelable) e.preventDefault();
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove('is-panning');

    var b = getBounds();
    var vel = getReleaseVelocity();
    velocitySamples = [];

    // Project momentum forward, then land inside the true (non-rubber-
    // banded) bounds — a flick throws the image, an edge always springs
    // back rather than snapping.
    var projectedX = tx + project(vel.vx);
    var projectedY = ty + project(vel.vy);
    var targetX = Math.max(-b.maxX, Math.min(b.maxX, projectedX));
    var targetY = Math.max(-b.maxY, Math.min(b.maxY, projectedY));

    var alreadySettled =
      targetX === tx && targetY === ty &&
      Math.abs(vel.vx) < 30 && Math.abs(vel.vy) < 30;

    if (alreadySettled) return;
    springTo(targetX, targetY, vel.vx, vel.vy);
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
      cancelSettle();
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
