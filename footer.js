(function () {
  const DRAG_THRESHOLD = 8;
  const STORAGE_PREFIX = "footer-order:";
  const MOTION_MS = 320;
  const MOTION_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  document.querySelectorAll(".site-footer").forEach((footer, footerIndex) => {
    const list = footer.querySelector(".site-footer__links");
    if (!list) return;

    Array.from(list.children).forEach((item, itemIndex) => {
      if (!item.classList.contains("site-footer__pill")) return;
      if (!item.dataset.footerId) {
        const label = (item.textContent || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        item.dataset.footerId = label || `footer-pill-${footerIndex}-${itemIndex}`;
      }
    });

    restoreOrder(list, footerIndex);
    makeSortable(list, footerIndex);
  });

  function makeSortable(list, footerIndex) {
    let dragState = null;

    list.addEventListener("pointerdown", (event) => {
      const item = event.target.closest(".site-footer__pill");
      if (!item || item.parentElement !== list) return;
      if (event.button !== 0) return;

      dragState = {
        footerIndex,
        item,
        list,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
        suppressClick: false,
      };

      item.setPointerCapture?.(event.pointerId);
      list.addEventListener("pointermove", onPointerMove);
      list.addEventListener("pointerup", onPointerUp);
      list.addEventListener("pointercancel", onPointerUp);
    });

    function onPointerMove(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;

      if (!dragState.started) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        beginDrag(event, dragState);
      }

      event.preventDefault();
      dragState.currentX = event.clientX;
      dragState.currentY = event.clientY;
      dragState.item.style.left = `${event.clientX - dragState.offsetX}px`;
      dragState.item.style.top = `${event.clientY - dragState.offsetY}px`;
      dragState.item.style.transform = "scale(1.02)";
      movePlaceholder(dragState, event.clientX, event.clientY);
    }

    function onPointerUp(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      list.removeEventListener("pointermove", onPointerMove);
      list.removeEventListener("pointerup", onPointerUp);
      list.removeEventListener("pointercancel", onPointerUp);

      if (!dragState.started) {
        dragState = null;
        return;
      }

      finishDrag(dragState);
      dragState = null;
    }
  }

  function beginDrag(event, dragState) {
    const itemRect = dragState.item.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "site-footer__placeholder";
    placeholder.style.width = `${itemRect.width}px`;
    placeholder.style.height = `${itemRect.height}px`;
    placeholder.style.flex = getComputedStyle(dragState.item).flex;

    dragState.placeholder = placeholder;
    dragState.offsetX = event.clientX - itemRect.left;
    dragState.offsetY = event.clientY - itemRect.top;
    dragState.itemRect = itemRect;
    dragState.started = true;
    dragState.suppressClick = true;

    dragState.item.after(placeholder);
    dragState.item.classList.add("is-dragging");
    dragState.item.style.width = `${itemRect.width}px`;
    dragState.item.style.height = `${itemRect.height}px`;
    dragState.item.style.left = `${itemRect.left}px`;
    dragState.item.style.top = `${itemRect.top}px`;
    dragState.item.style.transform = "scale(1.02)";
    document.body.classList.add("is-footer-dragging");

    suppressNextClick(dragState.item);
  }

  function movePlaceholder(dragState, pointerX, pointerY) {
    const siblings = Array.from(dragState.list.children).filter(
      (child) => child !== dragState.item && child !== dragState.placeholder
    );

    let target = null;
    let targetDistance = Number.POSITIVE_INFINITY;

    siblings.forEach((sibling) => {
      const rect = sibling.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(pointerX - centerX, (pointerY - centerY) * 1.15);

      if (distance < targetDistance) {
        targetDistance = distance;
        target = sibling;
      }
    });

    if (!target) return;

    const beforeRects = snapshotRects(dragState.list, dragState.item);
    const targetRect = target.getBoundingClientRect();
    const placeAfter =
      pointerY > targetRect.top + targetRect.height / 2 ||
      (Math.abs(pointerY - (targetRect.top + targetRect.height / 2)) < targetRect.height * 0.35 &&
        pointerX > targetRect.left + targetRect.width / 2);

    if (placeAfter) {
      if (dragState.placeholder.previousElementSibling !== target) {
        target.after(dragState.placeholder);
        animateLayoutShift(dragState.list, beforeRects, dragState.item);
      }
      return;
    }

    if (dragState.placeholder.nextElementSibling !== target) {
      dragState.list.insertBefore(dragState.placeholder, target);
      animateLayoutShift(dragState.list, beforeRects, dragState.item);
    }
  }

  function finishDrag(dragState) {
    const placeholderRect = dragState.placeholder.getBoundingClientRect();

    dragState.item.style.transition = `left ${MOTION_MS}ms ${MOTION_EASE}, top ${MOTION_MS}ms ${MOTION_EASE}, transform ${MOTION_MS}ms ${MOTION_EASE}`;
    dragState.item.style.left = `${placeholderRect.left}px`;
    dragState.item.style.top = `${placeholderRect.top}px`;
    dragState.item.style.transform = "scale(1)";

    const cleanup = () => {
      dragState.item.removeEventListener("transitionend", cleanup);
      dragState.list.insertBefore(dragState.item, dragState.placeholder);
      dragState.placeholder.remove();
      dragState.item.classList.remove("is-dragging");
      dragState.item.style.removeProperty("width");
      dragState.item.style.removeProperty("height");
      dragState.item.style.removeProperty("left");
      dragState.item.style.removeProperty("top");
      dragState.item.style.removeProperty("transform");
      dragState.item.style.removeProperty("transition");
      document.body.classList.remove("is-footer-dragging");
      saveOrder(dragState.list, dragState.footerIndex);
    };

    dragState.item.addEventListener("transitionend", cleanup, { once: true });
  }

  function suppressNextClick(item) {
    const stopClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      item.removeEventListener("click", stopClick, true);
    };

    item.addEventListener("click", stopClick, true);
  }

  function snapshotRects(list, draggedItem) {
    const rects = new Map();
    Array.from(list.children).forEach((child) => {
      if (child === draggedItem) return;
      rects.set(child, child.getBoundingClientRect());
    });
    return rects;
  }

  function animateLayoutShift(list, beforeRects, draggedItem) {
    Array.from(list.children).forEach((child) => {
      if (child === draggedItem) return;
      const before = beforeRects.get(child);
      if (!before) return;

      const after = child.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;

      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      child.style.transition = "none";
      child.style.transform = `translate(${dx}px, ${dy}px)`;
      child.getBoundingClientRect();
      child.style.transition = `transform ${MOTION_MS}ms ${MOTION_EASE}`;
      child.style.transform = "";
      child.addEventListener(
        "transitionend",
        () => {
          child.style.removeProperty("transition");
          child.style.removeProperty("transform");
        },
        { once: true }
      );
    });
  }

  function saveOrder(list, footerIndex) {
    try {
      const order = Array.from(list.children)
        .filter((item) => item.classList.contains("site-footer__pill"))
        .map((item) => item.dataset.footerId);
      localStorage.setItem(`${STORAGE_PREFIX}${location.pathname}:${footerIndex}`, JSON.stringify(order));
    } catch (_error) {
      return;
    }
  }

  function restoreOrder(list, footerIndex) {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${location.pathname}:${footerIndex}`);
      if (!stored) return;
      const order = JSON.parse(stored);
      if (!Array.isArray(order) || !order.length) return;

      const itemMap = new Map();
      Array.from(list.children).forEach((item) => {
        if (item.classList.contains("site-footer__pill")) {
          itemMap.set(item.dataset.footerId, item);
        }
      });

      order.forEach((id) => {
        const item = itemMap.get(id);
        if (item) list.appendChild(item);
      });
    } catch (_error) {
      return;
    }
  }
})();
