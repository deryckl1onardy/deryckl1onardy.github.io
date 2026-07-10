const overviewLinks = Array.from(
  document.querySelectorAll(".overview-link[data-target]")
);
const intro = document.querySelector(".intro");
const introStage = document.querySelector(".intro-stage");

const linkById = new Map(
  overviewLinks.map((link) => [link.dataset.target, link])
);

const sections = overviewLinks
  .map((link) => document.getElementById(link.dataset.target))
  .filter(Boolean);

function setActiveLink(id) {
  overviewLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.target === id);
  });
}

overviewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.getElementById(link.dataset.target);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${link.dataset.target}`);
    setActiveLink(link.dataset.target);
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const id = visible.target.id;
    if (linkById.has(id)) setActiveLink(id);
  },
  { rootMargin: "-15% 0px -65% 0px", threshold: [0.15, 0.35, 0.6] }
);

sections.forEach((s) => observer.observe(s));

const initialHash = window.location.hash.replace("#", "");
if (initialHash && linkById.has(initialHash)) setActiveLink(initialHash);

function updateIntroScale() {
  if (!intro || !introStage) return;
  if (window.matchMedia("(max-width: 980px)").matches) {
    introStage.style.transform = "";
    intro.style.height = "";
    return;
  }
  const scale = Math.min(1, intro.clientWidth / 1440);
  const offsetX = (intro.clientWidth - 1440 * scale) / 2;
  introStage.style.transform = `translateX(${offsetX}px) scale(${scale})`;
  intro.style.height = `${442 * scale}px`;
}

window.addEventListener("resize", updateIntroScale);
updateIntroScale();

/* ---------- SCROLL PARALLAX: hero drift ----------
   The hero composite is a single flattened image (no separate
   backdrop/phone layers like the other case studies), so it gets a
   single, more moderate drift as it scrolls rather than a two-layer
   depth cue. Scoped to the hero only.

   A shared IntersectionObserver decides whether the rAF loop runs at
   all, so scrolling past the hero costs nothing once it's out of
   frame (mirrors the cassette-tilt loop on the homepage). */
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = window.matchMedia("(max-width: 980px)").matches;
  if (reduce || narrow) return;

  const hero = document.querySelector(".ob-intro-bg");
  if (!hero) return;

  let active = false;
  let running = false;

  function frame() {
    if (!active) {
      running = false;
      return;
    }

    if (intro) {
      const rect = intro.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / (rect.height * 0.6)));
      hero.style.setProperty("--px-hero", (progress * 100).toFixed(1) + "px");
    }

    requestAnimationFrame(frame);
  }

  function kick() {
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      active = entries[0].isIntersecting;
      kick();
    },
    { rootMargin: "20% 0px 20% 0px", threshold: 0 }
  );

  observer.observe(hero);
})();
