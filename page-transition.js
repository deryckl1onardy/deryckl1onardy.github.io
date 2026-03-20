(function initPageTransition() {
  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (!prefersReducedMotion) {
    root.classList.add("page-transition");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.add("page-ready");
      });
    });
  } else {
    root.classList.add("page-transition", "page-ready");
  }

  function isTransitionLink(anchor) {
    if (!anchor || !anchor.href) return false;
    if (anchor.target && anchor.target.toLowerCase() !== "_self") return false;
    if (anchor.hasAttribute("download")) return false;

    const href = anchor.getAttribute("href") || "";
    if (
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    ) {
      return false;
    }

    const destination = new URL(anchor.href, window.location.href);
    const current = new URL(window.location.href);
    if (destination.origin !== current.origin) return false;

    const sameDocument =
      destination.pathname === current.pathname &&
      destination.search === current.search;
    return !sameDocument;
  }

  document.addEventListener("click", (event) => {
    if (prefersReducedMotion) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = event.target.closest("a[href]");
    if (!isTransitionLink(anchor)) return;

    event.preventDefault();
    root.classList.add("page-exit");

    window.setTimeout(() => {
      window.location.href = anchor.href;
    }, 170);
  });

  window.addEventListener("pageshow", () => {
    root.classList.remove("page-exit");
    root.classList.add("page-ready");
  });
})();
