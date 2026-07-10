const overviewLinks = Array.from(
  document.querySelectorAll(".overview-link[data-target]")
);
const intro = document.querySelector(".intro");
const introStage = document.querySelector(".intro-stage");

function ensureFirstInitiativeImpact() {
  const firstInitiative = document.querySelector(".initiative");
  if (!firstInitiative || firstInitiative.querySelector(".initiative-impact")) {
    return;
  }

  const whyHeading = firstInitiative.querySelector(".initiative-why");
  if (!whyHeading) return;

  const impactSection = document.createElement("section");
  impactSection.className = "initiative-impact";
  impactSection.setAttribute(
    "aria-label",
    "Impact of the icon treatment changes"
  );
  impactSection.innerHTML = `
    <p class="initiative-impact__lead">
      Even though it is a hard metric to track, the team could see
      a significant improvement in how quickly users opened Pulsa
      &amp; Data after the icon update.
    </p>
    <h4 class="initiative-impact__title">
      Median time to reach the Pulsa landing page
    </h4>
    <div class="initiative-impact__stats">
      <p class="initiative-impact__row">
        <span class="initiative-impact__label">Old icon style (Sept 20)</span>
        <strong class="initiative-impact__value">20 sec</strong>
      </p>
      <p class="initiative-impact__row">
        <span class="initiative-impact__label">New icon style (March 21)</span>
        <strong class="initiative-impact__value initiative-impact__value--positive">7 sec</strong>
      </p>
    </div>
  `;

  const whyCopy = whyHeading.nextElementSibling;
  if (whyCopy) {
    whyCopy.insertAdjacentElement("afterend", impactSection);
  } else {
    firstInitiative.appendChild(impactSection);
  }
}

ensureFirstInitiativeImpact();

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

/* ---------- SCROLL PARALLAX: hero depth cue ----------
   The hero backdrop trails the scroll well behind the phone in front
   of it, the classic depth cue: things further back appear to move
   less. Scoped to the hero only.

   A shared IntersectionObserver decides whether the rAF loop runs at
   all, so scrolling past the hero costs nothing once it's out of
   frame (mirrors the cassette-tilt loop on the homepage). */
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = window.matchMedia("(max-width: 980px)").matches;
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
