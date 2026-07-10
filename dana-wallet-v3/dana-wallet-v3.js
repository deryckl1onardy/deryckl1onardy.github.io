const overviewLinks = Array.from(
  document.querySelectorAll(".overview-link[data-target]")
);
const intro = document.querySelector(".intro");
const introStage = document.querySelector(".intro-stage");
const prototypeTrigger = document.querySelector("[data-prototype-trigger]");
const prototypeModal = document.querySelector("[data-prototype-modal]");
const prototypeVideo = document.querySelector("[data-prototype-video]");
const prototypeCloseControls = Array.from(
  document.querySelectorAll("[data-prototype-close]")
);

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
    const targetId = link.dataset.target;
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${targetId}`);
    setActiveLink(targetId);
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    const id = visible.target.id;
    if (linkById.has(id)) setActiveLink(id);
  },
  {
    rootMargin: "-15% 0px -65% 0px",
    threshold: [0.15, 0.35, 0.6]
  }
);

sections.forEach((section) => observer.observe(section));

const initialHash = window.location.hash.replace("#", "");
if (initialHash && linkById.has(initialHash)) {
  setActiveLink(initialHash);
}

function updateIntroScale() {
  if (!intro || !introStage) return;

  if (window.matchMedia("(max-width: 960px)").matches) {
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

function openPrototypeModal() {
  if (!prototypeModal) return;

  prototypeModal.classList.add("is-open");
  prototypeModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("prototype-modal-open");

  if (prototypeVideo) {
    prototypeVideo.currentTime = 0;
    const playPromise = prototypeVideo.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }
}

function closePrototypeModal() {
  if (!prototypeModal) return;

  prototypeModal.classList.remove("is-open");
  prototypeModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("prototype-modal-open");

  if (prototypeVideo) {
    prototypeVideo.pause();
  }
}

if (prototypeTrigger && prototypeModal) {
  prototypeTrigger.addEventListener("click", (event) => {
    event.preventDefault();
    openPrototypeModal();
  });

  prototypeCloseControls.forEach((control) => {
    control.addEventListener("click", closePrototypeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && prototypeModal.classList.contains("is-open")) {
      closePrototypeModal();
    }
  });
}

/* ---------- SCROLL PARALLAX: hero depth cue ----------
   The hero backdrop trails the scroll well behind the phone in front
   of it, the classic depth cue: things further back appear to move
   less. Scoped to the hero only.

   A shared IntersectionObserver decides whether the rAF loop runs at
   all, so scrolling past the hero costs nothing once it's out of
   frame (mirrors the cassette-tilt loop on the homepage). */
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = window.matchMedia("(max-width: 960px)").matches;
  if (reduce || narrow) return;

  const backdrop = document.querySelector(".intro-backdrop");
  const phone = document.querySelector(".intro-phone");
  const heroTargets = [backdrop, phone].filter(Boolean);
  if (!heroTargets.length) return;

  const active = new Set();
  let running = false;

  function frame() {
    if (!active.size) {
      running = false;
      return;
    }

    if (intro) {
      const rect = intro.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / (rect.height * 0.6)));
      if (backdrop) backdrop.style.setProperty("--px-backdrop", (progress * 260).toFixed(1) + "px");
      if (phone) phone.style.setProperty("--px-phone", (progress * 40).toFixed(1) + "px");
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
      entries.forEach((entry) => {
        if (entry.isIntersecting) active.add(entry.target);
        else active.delete(entry.target);
      });
      kick();
    },
    { rootMargin: "20% 0px 20% 0px", threshold: 0 }
  );

  heroTargets.forEach((el) => observer.observe(el));
})();
