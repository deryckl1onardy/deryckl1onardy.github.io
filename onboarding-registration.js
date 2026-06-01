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
