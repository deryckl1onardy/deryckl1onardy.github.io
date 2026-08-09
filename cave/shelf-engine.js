/* ============================================================
   THE CAVE — SHELF ENGINE
   Three shelves stacked in one cabinet. The item in the middle of
   the screen is always showcased — front cover or screen facing
   you — and the panel on the left reads out from it. Stepping to
   the next one swaps which item is showcased; the camera itself
   never moves except when the window resizes.

   Object hierarchy
     scene
       └ rig                 ← travels on X and Y (this is what "browsing" moves)
           └ shelf[0..2]     ← carcass + its own row of items

   Every pickable item carries two absolute poses, home and show,
   as position + quaternion pairs. Each frame it eases toward
   whichever one is current. There is no separate "pulled out /
   orbiting" mode — showcase IS the resting state of the current
   item, which is what makes the default view already read as
   "inspecting" rather than a bare row of spines.

   The Steam Deck, Switch Lite and Game Boy Advance SP are all real
   scanned models (CC-BY, credited on the page). The primitive-built
   device renderer (buildDevice) only runs now as an emergency
   fallback if one of those scans fails to load.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CAT = window.CAVE_CATALOG || { books: [], toys: [] };
const canvas = document.getElementById("shelf");
const stage = document.getElementById("stage");
const fallbackEl = document.querySelector("[data-fallback]");
const panel = {
  num: document.querySelector("[data-num]"),
  title: document.querySelector("[data-title]"),
  sub: document.querySelector("[data-sub]"),
  note: document.querySelector("[data-note]"),
  credit: document.querySelector("[data-credit]"),
  openBtn: document.querySelector("[data-open-case]")
};

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* ── The art viewer ──────────────────────────────────────────────
   Clicking the booklet page inside an open case opens the game's full
   plate image — a real screenshot when there is one, marketing key art
   otherwise. The <img> is pointed at the same URL the booklet canvas
   already drew from, so it comes straight out of cache rather than
   re-downloading. Everything here is guarded on the markup existing —
   the shelf still works on a page that doesn't ship the viewer. */
const artView = {
  root: document.querySelector("[data-artview]"),
  img: document.querySelector("[data-artview-img]"),
  name: document.querySelector("[data-artview-name]"),
  meta: document.querySelector("[data-artview-meta]"),
  closeBtn: document.querySelector("[data-artview-close]")
};
let artViewLastFocus = null;

function openArtViewer(art) {
  if (!artView.root || !art) return;
  artView.img.src = art.url;
  artView.img.alt = art.name + (art.isShot ? " — screenshot" : " — key art");
  if (artView.name) artView.name.textContent = art.name;
  // the account's own most-recently-unlocked achievement beats hours
  // played when Steam actually reports one; see caseInnerLidTexture for
  // why this never stacks both or invents an achievement to fill a gap
  if (artView.meta) {
    artView.meta.textContent = art.achievement
      ? "🏆 " + art.achievement.name
      : Math.round(art.hours) + " hrs played";
  }
  artViewLastFocus = document.activeElement;
  artView.root.classList.remove("is-closing");
  // Unhiding is the ONLY thing that reveals this — the fade-in is a
  // pure CSS @starting-style enhancement on an already-visible resting
  // state, so there is no frame in which the overlay exists but can't
  // be seen. (It covers the viewport; invisible-but-present would eat
  // every click on the page.)
  artView.root.hidden = false;
  if (artView.closeBtn) artView.closeBtn.focus();
}

function closeArtViewer() {
  if (!artView.root || artView.root.hidden) return;
  artView.root.classList.add("is-closing");
  const done = () => {
    artView.root.hidden = true;
    artView.root.classList.remove("is-closing");
    // drop the decoded image so a long browse doesn't hold every
    // wallpaper it ever opened in memory
    artView.img.removeAttribute("src");
  };
  // the timeout runs regardless of whether the exit transition played,
  // so a skipped animation can never strand the overlay on screen
  if (reduceMotion.matches) done();
  else setTimeout(done, 180);
  if (artViewLastFocus && artViewLastFocus.focus) artViewLastFocus.focus();
  artViewLastFocus = null;
}

if (artView.root) {
  artView.root.addEventListener("click", (e) => {
    // the scrim and the close button both carry the attribute; clicking
    // the artwork itself deliberately does nothing
    if (e.target.closest("[data-artview-close]")) closeArtViewer();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !artView.root.hidden) closeArtViewer();
  });
}

/* the page's own background — the room is painted the same colour so
   the canvas never shows as a dark rectangle cut into the page */
const ROOM = 0xd9d6d0;

function bail(msg) {
  stage.classList.add("stage--down");
  if (fallbackEl) { fallbackEl.hidden = false; fallbackEl.textContent = msg; }
  document.querySelector(".ledger__box")?.setAttribute("open", "");
}

/* Quality tiers for the adaptive system below (see "PERFORMANCE
   GOVERNOR"). Tier 0 is where every device starts; the governor steps
   down to 1 then 2, one-way, only if real measured frame pacing on
   THIS device can't hold 60fps. MSAA is skipped outright once the
   pixel ratio is already ≥1.5 — supersampling from that many physical
   pixels per CSS pixel already smooths edges, so paying for both is
   wasted fill-rate for no visible gain. */
const PIXEL_RATIO_CAP = 1.5; // was 2 — the jump from 1.5→2 is ~1.8x the
                              // fragment cost for a sharpness gain most
                              // displays and viewing distances don't
                              // actually resolve
const basePR = Math.min(devicePixelRatio, PIXEL_RATIO_CAP);
const TIERS = [
  { pr: basePR,               shadows: true,  type: THREE.PCFShadowMap, map: 1536 },
  { pr: Math.min(basePR, 1),  shadows: true,  type: THREE.PCFShadowMap, map: 1024 },
  { pr: 1,                    shadows: false, type: THREE.PCFShadowMap, map: 1024 }
];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: basePR < 1.5, alpha: true });
} catch (err) {
  bail("This browser can't render the 3D shelf. The full list is below.");
  throw err;
}
renderer.setPixelRatio(basePR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = TIERS[0].type;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

/* A backgrounded tab is a completely routine thing for a user to do —
   switch to check email, come back a minute later — and browsers
   routinely reclaim the WebGL context to free GPU memory when that
   happens. Without these two listeners that reclaim is permanent:
   the canvas goes blank (or frozen on its last frame) forever, while
   every DOM-driven part of the page — the tick bar, the record panel,
   the "is-active" state — keeps working perfectly, because none of it
   touches WebGL. That exact split (state correct, visual dead) is
   what "the shelf hangs" looks like from the outside, and it can
   happen on literally any visit that gets backgrounded and resumed.
   preventDefault() on the loss event is what tells the browser a
   restore should even be attempted; without it there is no recovery
   to receive. */
let contextLost = false;
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  contextLost = true;
}, false);
canvas.addEventListener("webglcontextrestored", () => {
  // the geometry/texture data was never freed — it lives in JS/CPU
  // memory the whole time — so three.js re-uploads it to the GPU
  // lazily the next time each object is drawn. We only need to make
  // sure rendering actually resumes and the sizing is still correct.
  contextLost = false;
  resize();
}, false);

// Coming back to a tab that had been sitting elsewhere should show a
// correct frame immediately rather than waiting on whatever stale RAF
// callback the browser gets around to firing — resize() forces one.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") resize();
});

/* ============================================================
   1. ROOM  (units are centimetres)
   ============================================================ */

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(ROOM, 150, 420);
// this used to be left unset, relying entirely on the page's own CSS
// background bleeding through the renderer's alpha-transparent canvas
// wherever no geometry occludes it. That's fragile — it makes the
// "room" a property of the page's stylesheet rather than of the scene,
// and it broke outright the moment a post-processing composer was
// briefly in the render path (its final blit isn't alpha-aware, so
// every empty region came out opaque black). Setting a real
// scene.background — the same colour the page already paints behind
// the canvas, so it's a visual no-op — makes the WebGL output correct
// on its own regardless of what's downstream of it.
scene.background = new THREE.Color(ROOM);

const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 900);
const CAM_Y = 14;
const LOOK = new THREE.Vector3(0, 12, 0);

/* Daylight room, but with real contrast: a strong key casting a soft
   shadow, a much dimmer ambient so the key actually models form, and
   a low rim from the other side so the shadow face doesn't go dead.
   The earlier balance (ambient close to the key's own strength) was
   why objects read flat — with everything lit almost evenly there is
   no falloff for the eye to read as "round", so a lit box and a lit
   book look the same: a lit box. */
scene.add(new THREE.HemisphereLight(0xfff4e2, 0xb8ae9e, 0.68));

const key = new THREE.DirectionalLight(0xfff0dc, 2.35);
key.position.set(-56, 84, 92);
key.castShadow = true;
key.shadow.mapSize.set(TIERS[0].map, TIERS[0].map);
key.shadow.camera.near = 20;
key.shadow.camera.far = 260;
/* The shadow camera used to cover ±150 on both axes — the entire
   cabinet, all three shelves, every book at once — because it was
   sized to be safe for "wherever the rig might be." But the rig-follow
   design means that's never actually necessary: the whole point of
   moving the shelf instead of the camera is that whatever's current
   always lands in the same small patch of world space near LOOK, no
   matter which of the 27 items across 3 shelves it is. The other two
   shelves and the rest of each row are never in the main camera's
   frustum, so shadow-rendering them every frame was pure waste — the
   single biggest cost in the whole scene, since it repeats for every
   frame of every drag and every transition. This box is sized with
   real margin around what the camera can actually see, not the whole
   cabinet. */
key.shadow.camera.left = -90;
key.shadow.camera.right = 90;
key.shadow.camera.top = 100;
key.shadow.camera.bottom = -30;
key.shadow.bias = -0.0009;
key.shadow.normalBias = 0.4;
key.shadow.radius = 3.2;
scene.add(key);

// a bigger share of the fill, tinted warm rather than the old cool
// blue — this is what actually reads as "bounced light off a warm
// room" instead of a second, competing key
const fill = new THREE.DirectionalLight(0xf3e6d6, 0.58);
fill.position.set(80, 20, 70);
scene.add(fill);

// a low COOL rim from behind-left — the one deliberately cold light in
// the rig, so it separates a case's spine edge from the dark recess of
// the cabinet with a hint of temperature contrast against the warm key,
// the way a real product shoot's rim light usually reads
const rim = new THREE.DirectionalLight(0xd9e6f2, 0.55);
rim.position.set(-40, 10, -60);
scene.add(rim);

const rig = new THREE.Group();
scene.add(rig);

/* NO BLOOM / NO COMPOSER — deliberately, and this is load-bearing:
   don't re-add it without re-measuring first.

   There used to be an EffectComposer here running UnrealBloomPass
   (threshold 0.72, strength 0.55). It was tuned by eye between two
   failure modes ("0.92 was indistinguishable from off", "0.4 was
   obviously overblown") and split the difference. Splitting the
   difference was the mistake — the real problem is that neither end
   of that range works in THIS scene, which measuring shows plainly.

   UnrealBloomPass sits BEFORE OutputPass, and OutputPass is what
   applies ACES tone mapping — so bloom thresholds against raw LINEAR
   HDR values, not the final display image. Measured off an actual
   float render target of this exact scene:

     room background ..................... 0.674 linear luminance
     a plain white book spine ............ 0.784
     brightest pixel in the whole frame .. 1.065
     pixels above the old 0.72 threshold .. 1.70% of the frame
     pixels above 1.0 ..................... 0.23% of the frame

   The background alone sits at 0.674, so a 0.72 threshold left just
   0.046 of headroom above the ROOM ITSELF. Every light-coloured
   surface cleared it — which is exactly the reported bug: white text
   and white spines glowing, the "Black Star" spine washing out to an
   illegible bar.

   Raising the threshold doesn't rescue it either. There is no real
   HDR content here to bloom: nothing is emissive, no light source is
   in frame, and the brightest pixel anywhere is 1.065 — barely past
   white. At threshold 1.0 the few pixels that qualify are a broad
   diffuse patch on the lower cover, not a tight specular, so raising
   strength to make it visible just washes the cover out again.

   So bloom had only two available states here: an artifact, or a
   no-op with a full extra render pipeline attached. Removed, and with
   it the composer (its RenderPass/OutputPass pair only existed to
   host the bloom; renderer.render() applies the same ACES tone
   mapping natively, with one less full-screen blit per frame).

   scene.background stays set — it was originally added to fix a
   composer-specific bug, but it's correct on its own merits: without
   it the "room" is just page CSS showing through a transparent
   canvas, which is fragile regardless of what's in the render path.

   If this scene ever gains genuinely over-range content (an emissive
   screen on a handheld, a real light source in frame), bloom becomes
   worth revisiting — but gate it on a threshold ABOVE the diffuse
   white point (~1.0 here), never below the background. */

/* ============================================================
   2. TEXTURES
   ============================================================ */

// 4x is visually indistinguishable from 8x at the size and distance
// these textures are actually viewed at, for half the sampling cost
const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

function canvas2d(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}
function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/* a bright room to reflect: without this every metal renders black */
(function environment() {
  const [c, x] = canvas2d(512, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, "#ffffff");
  g.addColorStop(0.42, "#efe9df");
  g.addColorStop(0.52, "#c9c2b6");
  g.addColorStop(1.0, "#8d867b");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 256);
  const lamp = x.createRadialGradient(150, 44, 4, 150, 44, 130);
  lamp.addColorStop(0, "#ffffff");
  lamp.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = lamp;
  x.fillRect(0, 0, 512, 190);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.7;
  pm.dispose(); t.dispose();
})();

function woodTexture() {
  const [c, x] = canvas2d(512, 512);
  x.fillStyle = "#b08e6a";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 300; i++) {
    const y = Math.random() * 512;
    x.strokeStyle = `rgba(96,64,36,${0.02 + Math.random() * 0.07})`;
    x.lineWidth = 0.5 + Math.random() * 2.2;
    x.beginPath(); x.moveTo(0, y);
    for (let px = 0; px <= 512; px += 32) {
      x.lineTo(px, y + Math.sin((px + i * 40) * 0.012) * 3 + (Math.random() - 0.5) * 1.5);
    }
    x.stroke();
  }
  return toTexture(c);
}
const woodMap = woodTexture();
woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;

const woodMat = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.62, color: 0xdcc9b4 });
const woodEdge = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.68, color: 0xc0a98f });

/* ---------- book spine + cover art ---------- */

function luminance(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (sh) => { const v = ((n >> sh) & 255) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(16) + 0.7152 * f(8) + 0.0722 * f(0);
}
function inkOn(hex, foil) {
  const L = luminance(hex);
  if (foil) return L > 0.22 ? "#3a2907" : "#f0d6a0";
  // This was briefly dimmed to #c9bfae to stop spine titles blooming
  // into an illegible white bar. That was treating the symptom: the
  // cause was the bloom pass thresholding below the room's own
  // brightness (see the long note where the composer used to be
  // built). With bloom gone there's nothing to blow out, so the ink
  // goes back to a real paper-white — the contrast these dark spines
  // (#2b2b28 and friends, L≈0.02) actually need to be readable.
  return L > 0.34 ? "#17110a" : "#fff6e9";
}
function fitText(x, text, maxW, start, min, weight, family) {
  let px = start;
  do { x.font = `${weight} ${px}px ${family}`; if (x.measureText(text).width <= maxW) break; px -= 1; } while (px > min);
  return px;
}

/* Flat fill, blocked rules, title. No gradient or noise is painted
   into the pixels — that was fighting the real scene lighting and is
   exactly why a lit spine still read flat ("a box with texture"). The
   colour alone plus the actual key light, rim light and the beveled
   edge rods (see bevelRod, below) are what read as a bound object;
   the texture's only job is the flat colour and the type. */
function drawSpineFace(x, W, H, color, ink, book, foil) {
  x.fillStyle = color; x.fillRect(0, 0, W, H);
  x.fillStyle = ink; x.globalAlpha = foil ? 0.85 : 0.4;
  x.fillRect(W * 0.22, H * 0.2, W * 0.56, 2.5);
  x.fillRect(W * 0.22, H * 0.79, W * 0.56, 2.5);
  x.globalAlpha = 1;

  /* Title and author each get their OWN reserved zone along the run,
     sized as a fixed share of it, rather than a title fit to the full
     run with the author pinned at a fixed offset regardless of how
     much of that run the title actually used. That earlier version
     only worked by coincidence for short titles — a long one (like
     "Marvel Year by Year") fills most of the run, and its own edge
     lands right on top of the author, which is the exact collision in
     both screenshots. Fixed zones mean neither element can ever reach
     into the other's space, for any title/author length. */
  x.save();
  x.translate(W / 2, H / 2);
  x.rotate(-Math.PI / 2);
  x.fillStyle = ink; x.textAlign = "center"; x.textBaseline = "middle";

  const run = H * 0.54;
  const gap = run * 0.05;
  const titleZone = run * 0.66;
  const authorZone = run - titleZone - gap;
  const titleCenter = run / 2 - titleZone / 2;
  const authorCenter = -run / 2 + authorZone / 2;

  const size = fitText(x, book.title, titleZone, 60, 20, 700, '"Plus Jakarta Sans", system-ui, sans-serif');
  x.fillText(book.title, titleCenter, 0);

  x.globalAlpha = 0.68;
  // fitText leaves x.font set to whatever size it settled on
  fitText(x, book.author, authorZone, Math.max(13, size * 0.5), 9, 600, '"Inter", system-ui, sans-serif');
  x.fillText(book.author, authorCenter, 0);
  x.globalAlpha = 1;
  x.restore();
}

/* No cover art for this one: the catalog's assigned colour. */
function spineTexture(book, color, foil) {
  const W = 256, H = 1024;
  const [c, x] = canvas2d(W, H);
  drawSpineFace(x, W, H, color, inkOn(color, foil), book, foil);
  return toTexture(c);
}

/* Cover art exists: fill the spine with the cover's own dominant
   colour — the real cloth or foil a book is actually bound in almost
   always matches the palette of its own jacket, so this reads as
   THIS book, not a coincidentally similar one. Sampled by quantising
   the whole cover into a small histogram and taking the most common
   bucket, rather than any single edge pixel (which can land on a
   stray highlight or a sliver of background). */
function dominantColor(img) {
  const S = 40;
  const [c, x] = canvas2d(S, S);
  x.drawImage(img, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S).data;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // skip near-white / near-black — almost always margin or a shadow,
    // never the colour a binder would actually dye the cloth
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L > 235 || L < 18) continue;
    const key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
    const cur = buckets.get(key);
    if (cur) { cur.n++; cur.r += r; cur.g += g; cur.b += b; }
    else buckets.set(key, { n: 1, r, g, b });
  }
  let best = null;
  buckets.forEach((v) => { if (!best || v.n > best.n) best = v; });
  if (!best) return "#6b4a3f";
  const r = Math.round(best.r / best.n), g = Math.round(best.g / best.n), b = Math.round(best.b / best.n);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function spineFromCover(book, img, foil) {
  const W = 256, H = 1024;
  const tone = dominantColor(img);
  const [c, x] = canvas2d(W, H);
  drawSpineFace(x, W, H, tone, inkOn(tone, foil), book, foil);
  return { tex: toTexture(c), tone };
}

function coverTexture(book, color, foil) {
  const W = 512, H = 768;
  const [c, x] = canvas2d(W, H);
  x.fillStyle = color; x.fillRect(0, 0, W, H);

  const ink = inkOn(color, foil);
  x.strokeStyle = ink; x.globalAlpha = foil ? 0.85 : 0.45; x.lineWidth = 3;
  x.strokeRect(38, 38, W - 76, H - 76);
  x.globalAlpha = 1;

  x.fillStyle = ink; x.textAlign = "center"; x.textBaseline = "middle";
  const words = book.title.split(" ");
  const lines = []; let line = "";
  x.font = `700 54px "Plus Jakarta Sans", system-ui, sans-serif`;
  words.forEach((w) => {
    const t = line ? line + " " + w : w;
    if (x.measureText(t).width > W - 150 && line) { lines.push(line); line = w; } else line = t;
  });
  if (line) lines.push(line);
  const size = lines.length > 3 ? 40 : 54;
  x.font = `700 ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
  lines.forEach((l, i) => x.fillText(l, W / 2, H * 0.42 + (i - (lines.length - 1) / 2) * size * 1.22));
  x.font = `600 26px "Inter", system-ui, sans-serif`;
  x.globalAlpha = 0.7; x.fillText(book.author, W / 2, H * 0.78); x.globalAlpha = 1;
  return toTexture(c);
}

const pagesMat = new THREE.MeshStandardMaterial({
  map: (() => {
    const [c, x] = canvas2d(256, 256);
    x.fillStyle = "#efe6d2"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 2) {
      x.fillStyle = `rgba(130,106,70,${0.05 + Math.random() * 0.14})`;
      x.fillRect(i, 0, 1, 256);
    }
    return toTexture(c);
  })(),
  roughness: 0.95
});

/* ---------- game case: the printed wrap ----------
   A physical keep case is a black plastic shell with a printed sleeve
   under a clear film, and — on a PS5 or an Xbox case — a platform band
   running across the TOP of that wrap, over the art, carrying on
   around the spine and the back. These functions draw that band and
   the two printed faces that aren't the cover art itself. */

/* Steam's own mark, the real path (Simple Icons, CC0) rather than a
   redrawn approximation. Its artwork fills the full 24×24 box, so
   centring by that box is exact. */
const STEAM_MARK_PATH = "M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z";
let _steamPath = null;
function steamMark(x, cx, cy, size, color) {
  if (!_steamPath) _steamPath = new Path2D(STEAM_MARK_PATH);
  x.save();
  x.translate(cx - size / 2, cy - size / 2);
  x.scale(size / 24, size / 24);
  x.fillStyle = color;
  x.fill(_steamPath);          // nonzero, same as the source SVG's default
  x.restore();
}

/* Letter by letter, because canvas's own letterSpacing still isn't
   everywhere — and because laying the run out by hand is what makes
   its exact ink width knowable, which is what lets the lockup be
   genuinely centred instead of eyeballed. Requires textAlign "left". */
function trackedWidth(x, text, tr) {
  let w = 0;
  for (const ch of text) w += x.measureText(ch).width + tr;
  return w - tr;                // no trailing gap after the last letter
}
function drawTracked(x, text, left, baseline, tr) {
  let px = left;
  for (const ch of text) { x.fillText(ch, px, baseline); px += x.measureText(ch).width + tr; }
}

/* One band, shared by every case on the shelf — it is the same printed
   strip on all of them, so it is drawn once and the material reused. */
const BAND_TOP = "#1c2a3a", BAND_BOT = "#141a21";  // Steam's own dark blues
let _band = null;
function steamBandTexture() {
  if (_band) return _band;
  const W = 1024, H = 104;
  const [c, x] = canvas2d(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, BAND_TOP); g.addColorStop(1, BAND_BOT);
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  const mark = 58, gap = 20, tr = 9;
  x.font = '700 42px "Plus Jakarta Sans", system-ui, sans-serif';
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  const runW = trackedWidth(x, "STEAM", tr);
  const left = (W - (mark + gap + runW)) / 2;
  steamMark(x, left + mark / 2, H / 2, mark, "#ffffff");
  // caps have no descender, so "middle" would sit them low: measuring
  // the real cap height and halving it puts the word dead centre
  const cap = x.measureText("STEAM").actualBoundingBoxAscent;
  x.fillStyle = "#ffffff";
  drawTracked(x, "STEAM", left + mark + gap, H / 2 + cap / 2, tr);
  _band = toTexture(c);
  return _band;
}

/* Spine: the band wraps around the top of it, then the title runs
   down — top-to-bottom, the way a game case reads, not bottom-to-top
   the way the books on the shelf above do. */
/* `recent` is the one badge this spine ever shows, and it's derived,
   never invented: true only for the 3 most-recently-played titles in
   the actual synced library (see the ranking in addGames). Everything
   the brief asked for beyond that — platinum/favourite/wishlist/
   installed marks — has no real data behind it on this shelf, so it
   stays off rather than becoming a decorative lie. */
function caseSpineTexture(game, aspect, bandFrac, recent) {
  const W = 72, H = Math.round(W / aspect);
  const [c, x] = canvas2d(W, H);
  x.fillStyle = "#15181c"; x.fillRect(0, 0, W, H);

  const bandH = Math.round(H * bandFrac);
  const g = x.createLinearGradient(0, 0, 0, bandH);
  g.addColorStop(0, BAND_TOP); g.addColorStop(1, BAND_BOT);
  x.fillStyle = g; x.fillRect(0, 0, W, bandH);
  steamMark(x, W / 2, bandH / 2, Math.min(W, bandH) * 0.58, "#ffffff");

  // the run below the band is split: most of it for the title, a thin
  // strip at the very bottom for one small fact — the way a real disc
  // spine reserves a sliver for a rating or edition mark
  const runH = H - bandH;
  const metaH = runH * 0.1;
  const titleH = runH - metaH;

  x.save();
  x.translate(W / 2, bandH + titleH / 2);
  x.rotate(Math.PI / 2);       // +90°: the run reads downward
  x.fillStyle = "#f2efe9"; x.textAlign = "center"; x.textBaseline = "middle";
  fitText(x, game.name, titleH * 0.84, 40, 13, 700, '"Plus Jakarta Sans", system-ui, sans-serif');
  x.fillText(game.name, 0, 0);
  x.restore();

  x.save();
  x.translate(W / 2, bandH + titleH + metaH / 2);
  x.rotate(Math.PI / 2);
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillStyle = recent ? "#e7c07a" : "#6b7178";
  x.font = `700 ${Math.max(9, Math.round(metaH * 0.52))}px "Inter", system-ui, sans-serif`;
  x.fillText((recent ? "RECENT · " : "") + Math.round(game.hours) + "H", 0, 0);
  x.restore();

  paperGrain(x, W, H);
  paperEdgeShadow(x, W, H);
  return toTexture(c);
}

/* A paper sleeve reads as something INSERTED, not printed straight
   onto the plastic, mostly because of what happens right at its own
   edge: a hair darker than the middle, the way real stock catches a
   shadow where it's tucked against the case's own lip. Grain is the
   smaller, second cue — printed ink on paper stock is never a
   perfectly flat fill. Both run once, over whatever's already on the
   canvas, so every printed panel on this case — front, back, spine —
   finishes with the same two calls. */
function paperEdgeShadow(x, W, H) {
  const e = "rgba(0,0,0,0.34)", m = "rgba(0,0,0,0)";
  const gv = x.createLinearGradient(0, 0, 0, H);
  gv.addColorStop(0, e); gv.addColorStop(0.05, m); gv.addColorStop(0.95, m); gv.addColorStop(1, e);
  x.fillStyle = gv; x.fillRect(0, 0, W, H);
  const gh = x.createLinearGradient(0, 0, W, 0);
  gh.addColorStop(0, e); gh.addColorStop(0.04, m); gh.addColorStop(0.96, m); gh.addColorStop(1, e);
  x.fillStyle = gh; x.fillRect(0, 0, W, H);
}
function paperGrain(x, W, H) {
  const n = Math.round(W * H * 0.018);
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
    x.fillRect(Math.random() * W, Math.random() * H, 1, 1);
  }
}

/* Back: no invented blurb, no fake barcode, no fake rating block —
   the only things printed here are the two facts this shelf actually
   knows about the game, taken straight from the synced library. */
function caseBackTexture(game, aspect) {
  const W = 540, H = Math.round(W / aspect);
  const [c, x] = canvas2d(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#191d22"); g.addColorStop(1, "#101317");
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  const pad = 52;
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.fillStyle = "#f2efe9";
  x.font = '700 40px "Plus Jakarta Sans", system-ui, sans-serif';
  const words = game.name.split(" ");
  const lines = []; let line = "";
  words.forEach((w) => {
    const t = line ? line + " " + w : w;
    if (x.measureText(t).width > W - pad * 2 && line) { lines.push(line); line = w; } else line = t;
  });
  if (line) lines.push(line);
  lines.slice(0, 4).forEach((l, i) => x.fillText(l, pad, pad + 40 + i * 48));

  const y = pad + 40 + Math.min(lines.length, 4) * 48 + 46;
  x.fillStyle = "#c9d3dd";
  x.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
  x.fillText(game.hours + " hours", pad, y);
  x.fillStyle = "#78838f";
  x.font = '600 22px "Inter", system-ui, sans-serif';
  x.fillText("last opened " + game.lastPlayed, pad, y + 36);

  steamMark(x, W - pad - 14, H - pad - 14, 28, "#3d4954");
  paperGrain(x, W, H);
  paperEdgeShadow(x, W, H);
  return toTexture(c);
}

/* The cover art hasn't arrived yet (or never will): the case still has
   to be a case, so its front carries the title on the same dark stock
   the spine and back are printed on. */
function caseFrontFallback(game, aspect) {
  const W = 540, H = Math.round(W / aspect);
  const [c, x] = canvas2d(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#212730"); g.addColorStop(1, "#0f1216");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = "#f2efe9"; x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.font = '800 54px "Plus Jakarta Sans", system-ui, sans-serif';
  const words = game.name.split(" ");
  const lines = []; let line = "";
  words.forEach((w) => {
    const t = line ? line + " " + w : w;
    if (x.measureText(t).width > W - 96 && line) { lines.push(line); line = w; } else line = t;
  });
  if (line) lines.push(line);
  lines.slice(0, 5).forEach((l, i) => x.fillText(l, 48, H - 84 - (Math.min(lines.length, 5) - 1 - i) * 60));
  paperGrain(x, W, H);
  paperEdgeShadow(x, W, H);
  return toTexture(c);
}

/* ============================================================
   3. CARCASS
   ============================================================ */

const SHELF_D = 30, BOARD_T = 3;
const SHELF_GAP = 46;

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* Open floating boards, not a boxed-in cabinet: no back panel, no crown,
   no plinth, no side walls closing it in — just the three shelf boards
   themselves (each with its own thin front lip), the way a wall-mounted
   open shelf actually looks. The room's own background already reads as
   the wall behind them, so nothing needs to fill that gap. */
function buildCabinet(width) {
  const g = new THREE.Group();

  shelves.forEach((s) => {
    const board = box(width, BOARD_T, SHELF_D, woodMat);
    board.position.set(0, s.y - BOARD_T / 2, 0);
    g.add(board);
    const lip = box(width, 1.0, 1.2, woodEdge);
    lip.position.set(0, s.y - BOARD_T + 0.35, SHELF_D / 2 - 0.5);
    g.add(lip);
  });

  return g;
}

/* ============================================================
   4. LAYOUT
   ============================================================ */

const shelves = [
  { id: "books", label: "Books", items: [], y: 0, mid: 13 },
  { id: "games", label: "Last played", items: [], y: -SHELF_GAP, mid: 12 },
  { id: "toys", label: "Handhelds", items: [], y: -SHELF_GAP * 2, mid: 7 }
];
const pickable = [];
let covers = {};

const LEAD_IN = 9;

function addBooks(shelf) {
  let x = LEAD_IN;
  const flat = [];
  CAT.books.forEach((b) => {
    if (b.flat) { flat.push(b); return; }
    x = placeBook(shelf, b, x);
  });
  flat.forEach((b) => { x = placeBook(shelf, b, x, true); });
  return x;
}

function placeBook(shelf, b, x, isFlat) {
  const color = b.spine || "#6b4a3f";
  const foil = b.finish === "foil";
  const thickness = (b.thickness || 30) / 10;
  const height = (b.height || 0.9) * 26;
  // The cover face is height × depth, and a cover image — the actual
  // fetched art, or the 2:3 canvas the procedural one is drawn at —
  // gets UV-stretched to fill whatever that face's proportions are.
  // Depth used to be one fixed number shared by every book regardless
  // of its own height, which meant no single book's cover face was
  // actually shaped like a book cover, and each one was distorted by
  // a different amount depending on how tall it happened to be. Tying
  // depth to height at a real trade-book ratio keeps every cover in
  // its own true proportion, whatever height that particular book is.
  const depth = height / 1.45;
  const rough = b.finish === "matte" ? 0.95 : 0.68;

  /* What actually reads as "a real, photographed book" instead of a
     texture pasted on a box is mostly a specular highlight that moves
     with the light — a laminated dust jacket or printed board has a
     thin glossy coat over the print, which is exactly what a
     clearcoat layer simulates. A plain roughness value can only ever
     look like painted cardboard, however low you set it, because
     there's no separate reflective layer for a highlight to sit on
     top of the print. Uncoated paperbacks (finish: "matte") stay flat
     — real matte stock doesn't get this treatment either. */
  const glossy = b.finish !== "matte";
  const coverRough = glossy ? 0.4 : rough;
  const clearcoat = glossy ? 0.7 : 0.05;
  const clearcoatRoughness = glossy ? 0.22 : 0.6;
  const physicalOpts = { clearcoat, clearcoatRoughness, envMapIntensity: 1.15 };

  const spineMat = new THREE.MeshPhysicalMaterial({ map: spineTexture(b, color, foil), roughness: coverRough, ...physicalOpts });
  const coverMat = new THREE.MeshPhysicalMaterial({ map: coverTexture(b, color, foil), roughness: coverRough, ...physicalOpts });
  const backMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: coverRough, ...physicalOpts });

  // A real book shows its page block on THREE sides — head, tail and
  // fore-edge — not just the one edge opposite the spine. Mapping the
  // top and bottom to a flat cloth colour (the earlier version) is a
  // large part of why it read as a coloured box instead of a book.
  // +X front cover, -X back, +Y top(pages), -Y bottom(pages), +Z spine, -Z fore-edge(pages)
  const mats = [coverMat, backMat, pagesMat, pagesMat, spineMat, pagesMat];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, depth), mats);
  mesh.castShadow = true; mesh.receiveShadow = true;

  // Thin rods along all FOUR vertical edges catch a highlight from the
  // key light and read as the softly rounded corner real binding
  // actually has — a sharp 90° box edge never happens on a physical
  // object. World units here are centimetres (matches the handheld
  // dimensions elsewhere, which are real device widths in cm), and a
  // real book board's edge is only rounded by a millimetre or so. The
  // first pass used a 3mm radius — a 6mm-thick rod glued down the edge
  // of a book is exactly the "unnatural bump" it looked like, not a
  // bevel. This is a tenth of that: present enough to catch a sliver
  // of light, nowhere near thick enough to read as its own object.
  const rodMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color), roughness: coverRough * 0.9, clearcoat, clearcoatRoughness, envMapIntensity: 1.15
  });
  const rodR = 0.07;
  // These rods are a millimetre-scale highlight catcher, not a real
  // occluder — at this thickness they can never cast a shadow anyone
  // would notice, but castShadow=true still puts all 4×14 of them
  // through a full shadow-pass draw call every animating frame. That
  // was pure cost for zero visible return, so it's off here.
  [1, -1].forEach((side) => {
    // CapsuleGeometry's long axis runs along Y by default — exactly
    // the book's height axis, so no rotation is needed here
    const spineRod = new THREE.Mesh(new THREE.CapsuleGeometry(rodR, height - 0.7, 4, 8), rodMat);
    spineRod.position.set(side * thickness / 2, 0, depth / 2 - 0.02);
    mesh.add(spineRod);

    const foreRod = new THREE.Mesh(new THREE.CapsuleGeometry(rodR, height - 0.7, 4, 8), rodMat);
    foreRod.position.set(side * thickness / 2, 0, -depth / 2 + 0.02);
    mesh.add(foreRod);
  });

  // swap in the real cover once it decodes, and re-derive the spine
  // from the cover's own dominant colour
  const file = covers[slugify(b.title)];
  if (file) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropy;
      t.needsUpdate = true;
      coverMat.map = t;
      coverMat.needsUpdate = true;
      try {
        const { tex, tone } = spineFromCover(b, img, foil);
        spineMat.map = tex; spineMat.needsUpdate = true;
        backMat.color.set(tone); rodMat.color.set(tone);
      } catch (_) { /* tainted canvas: keep the procedural spine */ }
      // the render loop stops once everything's settled, which by now
      // it usually already has — without this, a cover that finishes
      // decoding after that point would update the material and never
      // actually appear until something else happened to wake the loop
      wake();
    };
    img.src = "/assets/cave/books/" + file;
  }

  if (isFlat) {
    mesh.rotation.z = -Math.PI / 2;
    x += height / 2 + 1.4;
    mesh.position.set(x, thickness / 2 + 0.1, -2);
    x += height / 2;
  } else {
    // a leaning book rotates around its own centre, which swings one
    // top/bottom corner out past its own thickness/2 boundary — on the
    // INCOMING side that reaches straight into whatever was already
    // placed right before it, since that neighbour was only given the
    // standard upright gap. Clearing space before the lean (not just
    // after) is what the screenshot's collision was missing.
    if (b.lean) x += 1.6;
    x += thickness / 2;
    mesh.position.set(x, height / 2, -2);
    x += thickness / 2 + 0.16;
    if (b.lean) { mesh.rotation.z = 0.075; mesh.position.y -= 0.5; x += 1.6; }
  }

  // the showcase pose is absolute — a book that rests leaning or lying
  // flat still swings to a plain upright, cover-to-camera pose when it
  // becomes current, independent of however it sits at rest
  registerShow(mesh, {
    pos: new THREE.Vector3(mesh.position.x, shelf.mid, mesh.position.z + 20),
    rot: new THREE.Euler(0.04, -Math.PI * 0.44, 0)
  });

  mesh.userData = Object.assign(mesh.userData || {}, {
    kind: "book", title: b.title, sub: b.author, note: b.note || ""
  });
  register(shelf, mesh);
  return x;
}

/* A real DVD-style keep case, in centimetres: 135 × 190 × 14 mm, split
   into the two halves it's actually moulded from — a slightly deeper
   BACK half (carries the spine and the disc hub) and a thinner FRONT
   cover that hinges open along the spine edge, the way the "open case"
   control below needs it to. The earlier single-solid block with a
   uniform inset read as a picture in a frame; a real printed sleeve
   bleeds flush to the true edge on the left and top — where it wraps
   around the spine — and only leaves the bare shell showing as a
   sliver on the right and bottom, the printer's own registration
   margin. `bandFrac` is the share of the print's height the platform
   band across the top takes. */
const CASE = {
  w: 13.5, h: 19.0,
  backT: 0.86, frontT: 0.54,
  inset: { left: 0.04, right: 0.22, top: 0.04, bottom: 0.22 },
  bandFrac: 0.072
};
// short of a full 180° so an opened lid can never sweep back through
// the shelf backer, however the case ends up angled at showcase
const OPEN_ANGLE = Math.PI * 0.82;
// the closed cover's own material starts out only ~0.75cm from the
// hinge on the side nearest the disc, so for roughly the first third
// of the swing the cover is still physically sweeping through the
// disc's own space, not yet clear of it — the disc assembly stays
// hidden until openT crosses this, which is also well past the point
// this fixed camera can see any crack to show it through anyway
const DISC_REVEAL_T = 0.35;
// the real, physical air-gap a clear plastic window sits above its
// printed sleeve by — small enough to never read as a visible slot,
// just enough that the two are unambiguously separate surfaces
const WINDOW_GAP = 0.02;

/* The tray isn't a plain rectangle: a real case has a thumb notch bitten
   out of the disc tray's edge so a finger can get under the disc to lever
   it off the hub. `cx` is the disc's own X position relative to this
   shape's centre (the print sheet — and this tray with it — isn't
   centred the same way the case itself is, see the asymmetric inset
   above), so the notch lands directly under the hub rather than just
   the geometric middle of the tray. */
function buildTrayShape(w, h, cx, notchR) {
  const hw = w / 2, hh = h / 2, nx = -cx;
  const s = new THREE.Shape();
  s.moveTo(-hw, hh);
  s.lineTo(hw, hh);
  s.lineTo(hw, -hh);
  s.lineTo(nx + notchR, -hh);
  s.absarc(nx, -hh, notchR, 0, Math.PI, false); // bites upward into the tray
  s.lineTo(-hw, -hh);
  s.closePath();
  return new THREE.ShapeGeometry(s, 32);
}

let _caseGeo = null;
function caseGeometry() {
  if (_caseGeo) return _caseGeo;
  const { left, right, top, bottom } = CASE.inset;
  const printW = CASE.w - left - right;
  const printH = CASE.h - top - bottom;
  const bandH = printH * CASE.bandFrac;
  const artH = printH - bandH;
  // the print sheet isn't centred on the case the way a symmetric
  // inset would be — its own centre shifts with it, left/up toward
  // the flush edges and away from the margin
  const cx = (left - right) / 2;
  const artCy = (bottom - top) / 2 - bandH / 2;
  const bandCy = artCy + artH / 2 + bandH / 2;

  // the spine is attached to the BACK half only (real cases hinge at
  // the spine, they don't split it), so its own thickness is backT,
  // not the case's full depth
  const spineW = CASE.backT - 0.16, spineH = CASE.h - 0.36;
  const spineBandFrac = (bandH - 0.18) / spineH;

  _caseGeo = {
    printW, artH, bandH, cx, artCy, bandCy, spineW, spineH, spineBandFrac,
    /* 1mm bevel on a 1.4mm-thin profile radius: a keep case's corners
       are nearly square, nothing like the 3.4mm break the handhelds
       use. Passing depth = T-0.2 with a 0.1 bevel on both faces lands
       the finished solid's own extent back on exactly T. */
    backShell: roundedSlabGeometry(CASE.w - 0.2, CASE.h - 0.2, CASE.backT - 0.2, 0.14, 0.1),
    frontShell: roundedSlabGeometry(CASE.w - 0.2, CASE.h - 0.2, CASE.frontT - 0.2, 0.14, 0.1),
    // art and band are coplanar and butt-jointed rather than stacked,
    // so there is no z-fight to dodge and no sliver of gap at a
    // grazing angle — exactly how the two are printed on one sheet
    art: new THREE.PlaneGeometry(printW, artH),
    band: new THREE.PlaneGeometry(printW, bandH),
    spine: new THREE.PlaneGeometry(spineW, spineH),
    // notch radius picked to read as a real thumb notch (about the
    // size of the pad of a finger) without eating into the printed
    // area above it
    innerTray: buildTrayShape(printW, artH + bandH, cx, 0.85)
  };
  return _caseGeo;
}

/* The black plastic shell itself — shared, because every case on the
   shelf really is moulded from the same stuff. */
const caseShellMat = new THREE.MeshPhysicalMaterial({
  color: 0x101317, roughness: 0.52, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.9
});

/* ---------- three real layers, not one texture on a box ----------
   1. the plastic shell (above)
   2. a printed paper sleeve — matte, no gloss of its own
   3. a separate sheet of clear plastic sitting an air-gap in front
   Splitting the old single "art + baked clearcoat" mesh into two
   actual meshes is what makes this read as an inserted sleeve under
   glass rather than a picture painted on the case: the reflection now
   genuinely sits on a different surface, in front of the ink, instead
   of being faked by giving the ink itself a glossy coat. */
const PAPER = { roughness: 0.82, envMapIntensity: 0.35 };

/* A handful of long, faint diagonal scratches plus fine per-pixel
   noise, baked once into a normal map and shared by every clear window
   on the shelf — the "tiny imperfections" a real injection-moulded
   part picks up in the factory and in a customer's hands. Living in
   normal-map space (a flat mid-blue base) means it only reads as a
   texture at a grazing angle, the way a real scratch does, never as a
   printed mark seen straight on. */
let _plasticNormal = null;
function plasticNormalTexture() {
  if (_plasticNormal) return _plasticNormal;
  const W = 512, H = 512;
  const [c, x] = canvas2d(W, H);
  x.fillStyle = "#8080ff"; x.fillRect(0, 0, W, H); // flat normal (0,0,1)
  const img = x.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n; img.data[i + 1] += n;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 14; i++) {
    const sx = Math.random() * W, sy = Math.random() * H;
    const len = 40 + Math.random() * 160, ang = Math.random() * Math.PI;
    x.strokeStyle = `rgba(${140 + Math.random() * 20},${140 + Math.random() * 20},255,0.5)`;
    x.lineWidth = 0.6 + Math.random() * 0.8;
    x.beginPath(); x.moveTo(sx, sy);
    x.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
    x.stroke();
  }
  return (_plasticNormal = new THREE.CanvasTexture(c));
}
/* Semi-gloss, not mirror: a real, low clearcoatRoughness reflection —
   soft edge highlights, a Fresnel sheen that strengthens toward the
   rim — plus the faint scratch pass above. Deliberately NOT true
   transmission/glass: tried it (transmission:1, thickness:0.08,
   ior:1.5) and it made things WORSE, not just more expensive — with
   the paper sitting only WINDOW_GAP behind it, three's transmission
   pre-pass doesn't sample it correctly at that distance, and the whole
   cover art disappeared behind flat dark "smoked glass" instead of
   reading through it. It also nearly doubled draw calls (62 → 114 in
   a measured test) from the extra full-scene background pass
   transmission needs. A transparent, high-clearcoat surface reads as
   clear plastic at this scale for a fraction of the cost, and — this
   is the part that actually settles it — it looks correct. */
let _windowMat = null;
function plasticWindowMat() {
  if (_windowMat) return _windowMat;
  return (_windowMat = new THREE.MeshPhysicalMaterial({
    // alpha blending on a transparent PBR material blends its WHOLE
    // shaded output — diffuse AND specular AND clearcoat — by opacity,
    // not just the diffuse layer. A near-black base colour keeps the
    // lit-diffuse contribution close to zero regardless of how bright
    // the room is, so raising opacity doesn't wash the paper underneath
    // out to white; it only ever adds the specular/clearcoat sheen.
    color: 0x0a0a0c, transparent: true, opacity: 0.24, roughness: 0.16,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3,
    normalMap: plasticNormalTexture(), normalScale: new THREE.Vector2(0.22, 0.22)
  }));
}
/* Just the paper — the clear window over it is added separately by
   whoever calls this. Games on the shelf can have up to a couple dozen
   cases at once, and the BACK window of every one of them (art, band,
   spine) sits in an identical position relative to its own case every
   time, only the case's own position/rotation ever changes — exactly
   the shape of problem THREE.InstancedMesh exists for. The FRONT
   window can't take the same shortcut: it also has to track the lid's
   own open/close rotation every frame, which is a per-case value, not
   a shared one, so it stays an individual mesh (added inline in
   addGames instead of through this helper). */
function addPrintPanel(parent, geo, paperMat, x, y, z, rotY = 0) {
  const paper = new THREE.Mesh(geo, paperMat);
  paper.position.set(x, y, z);
  paper.rotation.y = rotY;
  parent.add(paper);
  return paper;
}
let _bandPaperMat = null;
function bandPaperMat() {
  return _bandPaperMat || (_bandPaperMat = new THREE.MeshStandardMaterial({ map: steamBandTexture(), ...PAPER }));
}

/* The three BACK windows (art, band, spine) instanced across every
   game case at once — 3 draw calls covering up to `maxCount` cases
   instead of 3 per case. Each slot's offset from its own case is a
   fixed local matrix (identical for every game, since the geometry is
   shared and none of these panels move relative to their own case);
   only the case's own matrix — built fresh from its live position and
   rotation every frame in tick() — changes per instance, per frame. */
let _gameWinInst = null;
function gameWindowInstances(G, maxCount, backZFace, hingeX) {
  if (_gameWinInst) return _gameWinInst;
  const mat = plasticWindowMat();
  const backArt = new THREE.InstancedMesh(G.art, mat, maxCount);
  const backBand = new THREE.InstancedMesh(G.band, mat, maxCount);
  const spine = new THREE.InstancedMesh(G.spine, mat, maxCount);
  [backArt, backBand, spine].forEach((m) => {
    m.castShadow = false; m.receiveShadow = false;
    // frustum culling on an InstancedMesh checks ONE bounding volume
    // for the whole batch, computed from the untransformed geometry —
    // meaningless once each instance has its own wildly different
    // world position across the shelf, so it's off rather than
    // wrongly culling instances that are actually on screen
    m.frustumCulled = false;
    m.count = maxCount;
  });
  const ONE = new THREE.Vector3(1, 1, 1);
  const offset = (x, y, z, rotY) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), ONE
  );
  return (_gameWinInst = {
    backArt, backBand, spine,
    backArtOffset: offset(G.cx, G.artCy, backZFace - WINDOW_GAP, Math.PI),
    backBandOffset: offset(G.cx, G.bandCy, backZFace - WINDOW_GAP, Math.PI),
    spineOffset: offset(hingeX - 0.012 - WINDOW_GAP, 0, 0, -Math.PI / 2)
  });
}

/* ---------- the interior ---------- */
/* Neither side pretends to hold content this shelf doesn't actually
   have (no invented booklet pages, no fake reversible art, no
   collectible card) — just the moulded plastic detail a real case
   shows even with nothing printed on it: retention clips, a faint
   embossed mark, and the tray's own contact shadow under the disc.
   The one real fact this shelf can print — hours played — lives here
   now, stamped low on the left panel like a real case's inner sleeve
   detail, not floating disconnected in the middle of the disc where
   it used to compete with the hub for space. Per-game (not cached
   like the rest of this panel used to be), since the hours are. */
/* The inner lid, as the art booklet a real case actually holds.
   `plate` is a real image — a developer screenshot from the game's own
   store page when steam.json has one, Steam's wide marketing key art
   (library_hero) otherwise — once it has decoded; until then, or if
   that game has neither, this falls back to the plain retention-clip
   panel it used to be, so a failed image can never leave a blank page
   or, worse, a click target that opens nothing. `isShot` is just which
   of those two `plate` actually is, so the caption prints the truth.
   See the loader in addGames(). */
function caseInnerLidTexture(game, plate, isShot) {
  const W = 384, H = 512;
  const [c, x] = canvas2d(W, H);
  x.fillStyle = "#1b1e22"; x.fillRect(0, 0, W, H);

  if (!plate) {
    // ── plain panel: retention clips + the one real stat ──
    [0.1, 0.86].forEach((fy) => {
      const y = H * fy, h = H * 0.05;
      const g = x.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, "rgba(255,255,255,0.10)");
      g.addColorStop(0.5, "rgba(255,255,255,0.02)");
      g.addColorStop(1, "rgba(0,0,0,0.28)");
      x.fillStyle = g;
      x.fillRect(W * 0.18, y - h / 2, W * 0.64, h);
    });
    steamMark(x, W / 2, H * 0.4, 60, "rgba(255,255,255,0.05)");
    steamMark(x, W / 2 - 1, H * 0.4 - 1, 60, "rgba(0,0,0,0.12)");

    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = "rgba(255,255,255,0.5)";
    x.font = '800 30px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText(Math.round(game.hours) + " HRS", W / 2, H * 0.58);
    x.fillStyle = "rgba(255,255,255,0.22)";
    x.font = '700 12px "Inter", system-ui, sans-serif';
    x.fillText("PLAYED", W / 2, H * 0.58 + 24);
    return toTexture(c);
  }

  // ── booklet page ──
  // a touch lighter than the shell it sits against, so the page reads
  // as a separate sheet of stock rather than more moulded plastic
  x.fillStyle = "#20242a"; x.fillRect(0, 0, W, H);
  // gutter shading down the hinge edge — a bound page is never evenly
  // lit right where it turns into the spine
  const gut = x.createLinearGradient(0, 0, W * 0.14, 0);
  gut.addColorStop(0, "rgba(0,0,0,0.45)");
  gut.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = gut; x.fillRect(0, 0, W * 0.14, H);

  const M = 26;                                   // page margin
  const pw = W - M * 2, ph = 204, py = 54;
  // centre-crop the source image into the plate instead of squashing it
  const pa = pw / ph, ha = plate.width / plate.height;
  let sw, sh, sx, sy;
  if (ha > pa) { sh = plate.height; sw = sh * pa; sx = (plate.width - sw) / 2; sy = 0; }
  else { sw = plate.width; sh = sw / pa; sx = 0; sy = (plate.height - sh) / 2; }
  x.save();
  x.beginPath(); x.rect(M, py, pw, ph); x.clip();
  x.drawImage(plate, sx, sy, sw, sh, M, py, pw, ph);
  x.restore();
  // printed-plate edge: a dark seat under a light top lip
  x.lineWidth = 1;
  x.strokeStyle = "rgba(0,0,0,0.55)";
  x.strokeRect(M + 0.5, py + 0.5, pw - 1, ph - 1);
  x.strokeStyle = "rgba(255,255,255,0.10)";
  x.beginPath(); x.moveTo(M, py + 0.5); x.lineTo(M + pw, py + 0.5); x.stroke();

  // plate caption, the way a real art book sets one — "SCREENSHOT" only
  // when the plate really is a captured-in-game shot; the marketing key
  // art fallback still says what it actually is
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.fillStyle = "rgba(255,255,255,0.32)";
  x.font = '700 9px "Inter", system-ui, sans-serif';
  drawTracked(x, isShot ? "SCREENSHOT" : "KEY ART", M, py + ph + 22, 1.6);

  x.fillStyle = "rgba(255,255,255,0.88)";
  fitText(x, game.name, pw, 25, 13, 800, '"Plus Jakarta Sans", system-ui, sans-serif');
  x.fillText(game.name, M, py + ph + 52);

  // The page's stat line. A real unlocked achievement — this account's
  // own, with its real name and description straight from the game's
  // schema — beats hours played when Steam actually reports one; hours
  // played is the fallback for the (common) case where it doesn't,
  // never both stacked, never an invented achievement to fill the gap.
  if (game.achievement) {
    x.fillStyle = "rgba(255,255,255,0.26)";
    x.font = '700 10px "Inter", system-ui, sans-serif';
    drawTracked(x, "LATEST UNLOCK", M, py + ph + 78, 1.6);

    x.fillStyle = "rgba(255,255,255,0.82)";
    fitText(x, game.achievement.name, pw, 20, 12, 800, '"Plus Jakarta Sans", system-ui, sans-serif');
    x.fillText(game.achievement.name, M, py + ph + 100);

    if (game.achievement.description) {
      x.fillStyle = "rgba(255,255,255,0.36)";
      x.font = '600 11px "Inter", system-ui, sans-serif';
      let desc = game.achievement.description;
      while (x.measureText(desc).width > pw && desc.length > 1) desc = desc.slice(0, -1);
      if (desc !== game.achievement.description) desc = desc.slice(0, -1) + "…";
      x.fillText(desc, M, py + ph + 118);
    }
  } else {
    x.fillStyle = "rgba(255,255,255,0.55)";
    x.font = '800 34px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText(Math.round(game.hours) + " HRS", M, py + ph + 100);
    x.fillStyle = "rgba(255,255,255,0.26)";
    x.font = '700 10px "Inter", system-ui, sans-serif';
    drawTracked(x, "PLAYED", M, py + ph + 118, 1.6);
  }

  // The affordance. Only ever drawn on this branch — i.e. only when a
  // plate image really decoded and openArtViewer() therefore has
  // something to show — so the page never advertises an action that
  // would do nothing.
  x.fillStyle = "rgba(255,255,255,0.30)";
  x.font = '700 9px "Inter", system-ui, sans-serif';
  drawTracked(x, "CLICK TO ENLARGE", M, H - 30, 1.4);

  return toTexture(c);
}
let _innerTray = null;
function caseInnerTrayTexture() {
  if (_innerTray) return _innerTray;
  const W = 512, H = 512;
  const [c, x] = canvas2d(W, H);
  x.fillStyle = "#17191c"; x.fillRect(0, 0, W, H);
  // the disc's own contact shadow, baked rather than real-time shadow
  // mapped — at this physical scale (a fraction of a millimetre of
  // real gap) a shadow map can't reliably resolve the contact line,
  // so this is the honest, always-correct version of it
  const g = x.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.42);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.75, "rgba(0,0,0,0.24)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.beginPath(); x.arc(W / 2, H / 2, W * 0.44, 0, Math.PI * 2); x.fill();

  // a shallow recessed step, right at the disc's own edge — a dark
  // hairline where the step actually drops away, a faint lighter one
  // a hair further out where it catches the key light climbing back
  // to the tray's own level. Together they read as a sunken ring the
  // disc sits IN, not a shadow merely printed under it.
  const stepR = W * 0.435;
  x.strokeStyle = "rgba(0,0,0,0.5)"; x.lineWidth = 2.2;
  x.beginPath(); x.arc(W / 2, H / 2, stepR, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = "rgba(255,255,255,0.06)"; x.lineWidth = 1.4;
  x.beginPath(); x.arc(W / 2, H / 2, stepR + 3, 0, Math.PI * 2); x.stroke();

  // faint concentric mould witness-lines around the hub — the kind of
  // mark an injection tool actually leaves in a part shaped like this
  x.strokeStyle = "rgba(255,255,255,0.03)"; x.lineWidth = 1;
  for (let r = W * 0.1; r < W * 0.2; r += 4) { x.beginPath(); x.arc(W / 2, H / 2, r, 0, Math.PI * 2); x.stroke(); }
  return (_innerTray = toTexture(c));
}
/* The disc's locking hub: a raised, slightly tapered boss the disc's
   own centre hole (radius 0.75) clips over. Sized well clear of that
   hole — top radius 0.55 — so there's real room between the hub's own
   edge and the hole for the retention teeth below to actually be
   visible standing in the gap, the way a real hub's rosette is. */
let _hubGeo = null;
function discHubGeometry() {
  return _hubGeo || (_hubGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.06, 24));
}
const discHubMat = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.55 });

/* The rosette of small flexible tabs a disc's hole actually clips onto
   — without these the hub used to be tall enough (0.14 thick) to
   physically intersect the disc's own body by a good 0.075: two
   opaque, near-parallel surfaces occupying the same volume, which is
   exactly what reads as a flickering "black glitch" on the disc as the
   camera angle shifts through the open animation. Both the hub AND
   these teeth now stay entirely BEHIND the disc's own back (data) face
   — see the z-budget spelled out where they're placed in addGames. */
let _toothGeo = null;
function toothGeometry() {
  return _toothGeo || (_toothGeo = new THREE.ConeGeometry(0.05, 0.03, 4));
}
const toothMat = new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.5 });
function buildHubTeeth(topZ) {
  const g = new THREE.Group();
  const n = 5, r = 0.68;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tooth = new THREE.Mesh(toothGeometry(), toothMat);
    tooth.rotation.x = -Math.PI / 2; // cone's apex (local +Y) onto +Z
    tooth.position.set(Math.cos(a) * r, Math.sin(a) * r, topZ - 0.015);
    tooth.castShadow = true;
    g.add(tooth);
  }
  return g;
}

/* ---------- the disc inside ---------- */
/* A real Blu-ray: 12cm across, a 1.5cm centre hole. The hole is a true
   geometric gap (RingGeometry), not a texture trick — through it you
   see straight down to the hub the disc is actually seated on.
   RingGeometry's UVs are already a plain cartesian projection of the
   unit circle, so a normal square texture lands on it correctly with
   no special mapping. */
let _discGeo = null;
function discGeometry() {
  if (_discGeo) return _discGeo;
  const R = 6, hole = 0.75, th = 0.1;
  _discGeo = {
    R, hole, th,
    edge: new THREE.CylinderGeometry(R, R, th, 64, 1, true),
    label: new THREE.RingGeometry(hole, R * 0.999, 64)
  };
  return _discGeo;
}
const discEdgeMat = new THREE.MeshPhysicalMaterial({
  color: 0xd7dde3, metalness: 0.85, roughness: 0.22, envMapIntensity: 1.1
});
let _discDataTex = null;
function discDataTexture() {
  if (_discDataTex) return _discDataTex;
  const W = 512, H = 512;
  const [c, x] = canvas2d(W, H);
  const g = x.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W / 2);
  g.addColorStop(0, "#e7ecef"); g.addColorStop(0.45, "#aab4bd");
  g.addColorStop(0.7, "#7e8890"); g.addColorStop(1, "#4c545c");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // the one purely decorative texture on this whole shelf, standing in
  // for the faint diffraction rings a disc's data layer actually
  // catches under any light that hits it at an angle
  x.strokeStyle = "rgba(20,26,32,0.07)"; x.lineWidth = 1.4;
  for (let r = 60; r < W / 2; r += 6) { x.beginPath(); x.arc(W / 2, H / 2, r, 0, Math.PI * 2); x.stroke(); }
  steamMark(x, W / 2, H / 2, 44, "#4c545c");
  return (_discDataTex = toTexture(c));
}
/* The small amount of print a real disc actually carries near its own
   hub: a thin rim ring and the Steam mark. Hours played used to be
   crammed in here too, but that put the one real fact this shelf
   prints in the single most cramped spot on the whole case, fighting
   the hub for space — it now lives on the inner lid instead (see
   caseInnerLidTexture), where there's room to actually set it. No
   invented publisher, rating or disc number here either: there's no
   real data behind any of those on this shelf, and a disc that
   pretends to have them is worse than one that doesn't. */
/* The printed platform band. A FLAT horizontal strip across the bottom
   of the disc, clipped to the disc's own circle so its ends are cut by
   the edge — not an annular sector following the curvature.

   The curved version this replaces was wrong twice over: it put the
   band at the top, and because an arc band has to stop somewhere, its
   two radial ends read as hard diagonal cuts — a dark wedge sitting on
   the art rather than a strip printed across it. A straight chord has
   no ends to cut: the disc's own silhouette finishes it.

   Bottom, not top, for the same reason a real disc does it — the hub
   already interrupts the middle, so the lower chord is the one large
   uninterrupted run of print the disc actually has. */
function paintDiscBand(x, cx, cy, R) {
  const top = cy + R * 0.64;

  x.save();
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
  x.fillStyle = "#08090b";
  // over-tall on purpose; the clip above is what shapes the bottom edge
  x.fillRect(cx - R, top, R * 2, R * 1.2);
  x.restore();

  /* Lockup, centred on the strip. Sat at 0.80R rather than the strip's
     own midpoint: the chord narrows fast toward the disc's edge, so
     lower down the lockup would start crowding the silhouette.

     Sizes are set against the disc DIAMETER, not against the strip —
     that's what went wrong first time round. At mark 0.19R / type
     0.15R the lockup measured 43% of the disc's diameter and filled
     72% of the chord available to it, so it read as a logo wearing the
     disc rather than a mark printed on it. These values put it at
     ~31% of the diameter and just over half the chord, which is the
     proportion a real printed disc lockup actually sits at. */
  const by = cy + R * 0.80;
  const mark = R * 0.13;
  x.font = '800 ' + Math.round(R * 0.105) + 'px "Inter", system-ui, sans-serif';
  x.textAlign = "left"; x.textBaseline = "middle";
  const tr = R * 0.018;                                  // tracking
  const tw = trackedWidth(x, "STEAM", tr);
  const gap = R * 0.042;
  const left = cx - (mark + gap + tw) / 2;               // true optical centre
  steamMark(x, left + mark / 2, by, mark, "#ffffff");
  x.fillStyle = "#ffffff";
  drawTracked(x, "STEAM", left + mark + gap, by, tr);
}

function paintDiscChrome(x, W, H) {
  const cx = W / 2, cy = H / 2, R = W / 2;
  x.strokeStyle = "rgba(242,239,233,0.55)"; x.lineWidth = 3;
  x.beginPath(); x.arc(cx, cy, R * 0.965, 0, Math.PI * 2); x.stroke();

  paintDiscBand(x, cx, cy, R);

  // The hub is just the dark clamping area now. It used to carry a
  // second Steam mark, which was only ever there because the branding
  // had nowhere better to go — with the band below doing that job
  // properly, a mark here is the same logo twice on one small face.
  const hub = R * 0.3;
  x.fillStyle = "rgba(6,7,9,0.85)";
  x.beginPath(); x.arc(cx, cy, hub, 0, Math.PI * 2); x.fill();
}
function discLabelFallback(game) {
  const W = 512, H = 512;
  const [c, x] = canvas2d(W, H);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#212730"); g.addColorStop(1, "#0f1216");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = "#f2efe9"; x.textAlign = "center"; x.textBaseline = "middle";
  fitText(x, game.name, W * 0.72, 42, 15, 800, '"Plus Jakarta Sans", system-ui, sans-serif');
  x.fillText(game.name, W / 2, H / 2 - 16);
  paintDiscChrome(x, W, H);
  return toTexture(c);
}

/* Builds one disc: the metal edge band plus a printed label face and a
   plain data face, glued together as a coin lying on its side. The
   label material comes back out so the loader below can swap its map
   once the real cover art decodes. */
function buildDisc(game) {
  const D = discGeometry();
  const discObj = new THREE.Group();

  const edge = new THREE.Mesh(D.edge, discEdgeMat);
  edge.castShadow = true; edge.receiveShadow = true;
  discObj.add(edge);

  const labelMat = new THREE.MeshPhysicalMaterial({
    map: discLabelFallback(game), roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.16, envMapIntensity: 1
  });
  const label = new THREE.Mesh(D.label, labelMat);
  label.position.y = D.th / 2; label.rotation.x = -Math.PI / 2;
  discObj.add(label);

  const data = new THREE.Mesh(D.label, new THREE.MeshPhysicalMaterial({
    map: discDataTexture(), metalness: 0.6, roughness: 0.28, envMapIntensity: 1
  }));
  data.position.y = -D.th / 2; data.rotation.x = Math.PI / 2;
  discObj.add(data);

  // the disc's own "up" is its face normal; rotating the whole
  // assembly onto the case's front/back axis is simpler than building
  // it flat to begin with, since RingGeometry/CylinderGeometry are
  // both naturally Y-axis shapes
  discObj.rotation.x = Math.PI / 2;
  return { discObj, labelMat };
}

function addGames(shelf, list) {
  const G = caseGeometry();
  const artAspect = G.printW / G.artH;
  const hingeX = -(CASE.w / 2);
  const backZFace = -(CASE.backT) - 0.012;
  const frontZFace = CASE.frontT + 0.012;

  // the one badge this spine will ever show, and it's derived, not
  // invented — the 3 most-recently-played titles in the actual synced
  // library. lastPlayed is an ISO date string, so a plain string
  // compare already sorts it correctly.
  const recentTitles = new Set(
    list.slice().sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed)).slice(0, 3).map((g) => g.name)
  );

  const winInst = gameWindowInstances(G, list.length, backZFace, hingeX);
  shelf.group.add(winInst.backArt, winInst.backBand, winInst.spine);

  let x = LEAD_IN;
  list.forEach((g, i) => {
    const box = new THREE.Group();

    /* fixed half: the back cover, the spine, the band on both, the
       inner tray, the hub and the disc — none of it moves when the
       case opens */
    const fixed = new THREE.Group();
    box.add(fixed);

    const backShell = new THREE.Mesh(G.backShell, caseShellMat);
    backShell.castShadow = true; backShell.receiveShadow = true;
    backShell.position.z = -CASE.backT / 2;
    fixed.add(backShell);

    addPrintPanel(fixed, G.art, new THREE.MeshStandardMaterial({ map: caseBackTexture(g, artAspect), ...PAPER }),
      G.cx, G.artCy, backZFace, Math.PI);
    addPrintPanel(fixed, G.band, bandPaperMat(), G.cx, G.bandCy, backZFace, Math.PI);
    // the three BACK windows aren't meshes on this case at all — they're
    // slots on the shared InstancedMesh objects above, written into
    // every frame from this case's own live transform in tick()

    const spinePaperMat = new THREE.MeshStandardMaterial({
      map: caseSpineTexture(g, G.spineW / G.spineH, G.spineBandFrac, recentTitles.has(g.name)), ...PAPER
    });
    const spinePaper = new THREE.Mesh(G.spine, spinePaperMat);
    spinePaper.position.set(hingeX - 0.012, 0, 0);
    spinePaper.rotation.y = -Math.PI / 2;
    fixed.add(spinePaper);

    const innerTray = new THREE.Mesh(
      G.innerTray,
      new THREE.MeshStandardMaterial({ map: caseInnerTrayTexture(), roughness: 0.72, side: THREE.DoubleSide })
    );
    innerTray.position.set(G.cx, G.artCy + G.bandH / 2, 0.006);
    fixed.add(innerTray);

    /* The disc's own back (data) face sits at world z = 0.075 - 0.05 =
       0.025 (see discObj's position below and buildDisc's own th/2
       offsets). The hub and its teeth both have to stay entirely
       BEHIND that — topping out at 0.015, a real 0.01 clearance — or
       their opaque geometry physically intersects the disc's own body.
       That was one real source of a black glitch on the disc; see the
       second one, and its fix, on `discGroup` below. */
    const hubTopZ = 0.015;
    const hub = new THREE.Mesh(discHubGeometry(), discHubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 0, hubTopZ - 0.03);
    hub.castShadow = true; hub.receiveShadow = true;

    /* The SECOND source of that glitch: the closed front cover's own
       inner face starts out practically touching the disc's left edge
       (the edge nearest the hinge is only 0.75cm from the hinge axis —
       barely more than the shell's own thickness), and a solid panel
       swinging open around a nearby hinge doesn't move cleanly away
       from a point that close to it — for roughly the first 30-40° of
       the swing, the material closest to the hinge is still sweeping
       *through* the disc's own z-range before it clears. That's a real
       geometric collision, not a shading glitch, and no z-offset fixes
       it — the cover and the disc are both solid, and for that window
       they occupy the same space. The honest fix is the one a real
       product photo would show anyway: from this fixed camera the
       cover doesn't visibly crack open enough to reveal the disc until
       well past that point, so the disc assembly simply isn't drawn
       until the swing has genuinely cleared it. Toggled in tick() off
       `u.openT` — see OPEN_ANGLE and the threshold there. */
    const discGroup = new THREE.Group();
    discGroup.add(hub, buildHubTeeth(hubTopZ));
    fixed.add(discGroup);

    const { discObj, labelMat: discLabelMat } = buildDisc(g);
    // the disc rests just clear of the hub, not floating unattached to
    // anything and not buried in either half's own solid plastic
    discObj.position.set(0, 0, 0.075);
    discGroup.add(discObj);

    /* hinged half: the front cover, pivoting around the spine edge —
       its children sit offset by +w/2 so they land back at the case's
       own centre when the lid is closed (rotation 0) */
    const lid = new THREE.Group();
    lid.position.set(hingeX, 0, 0);
    box.add(lid);

    const frontShell = new THREE.Mesh(G.frontShell, caseShellMat);
    frontShell.castShadow = true; frontShell.receiveShadow = true;
    frontShell.position.set(CASE.w / 2, 0, CASE.frontT / 2);
    lid.add(frontShell);

    const innerLidMat = new THREE.MeshStandardMaterial({
      map: caseInnerLidTexture(g), roughness: 0.72, side: THREE.DoubleSide
    });
    const innerLid = new THREE.Mesh(G.art, innerLidMat);
    innerLid.position.set(CASE.w / 2 + G.cx, G.artCy, -0.006);
    // a plane's default normal (+Z, before the lid ever rotates) ends
    // up facing AWAY from the camera once the lid has swung most of
    // the way open — DoubleSide meant it still drew, but from its own
    // back, which mirrors whatever's on it left-right. Fine for the
    // symmetric highlight bars and mark this used to carry alone, not
    // fine now that it prints real text. Flipping the mesh's own
    // facing 180° is what actually fixes it, not the material side.
    innerLid.rotation.y = Math.PI;
    lid.add(innerLid);

    const frontMat = new THREE.MeshStandardMaterial({ map: caseFrontFallback(g, artAspect), ...PAPER });
    addPrintPanel(lid, G.art, frontMat, CASE.w / 2 + G.cx, G.artCy, frontZFace, 0);
    addPrintPanel(lid, G.band, bandPaperMat(), CASE.w / 2 + G.cx, G.bandCy, frontZFace, 0);
    // the front windows stay individual meshes (not instanced): they
    // also have to track the lid's own open/close rotation every
    // frame, which — unlike the back windows — is a per-case value,
    // not one shared offset every instance could reuse
    const frontArtWindow = new THREE.Mesh(G.art, plasticWindowMat());
    frontArtWindow.position.set(CASE.w / 2 + G.cx, G.artCy, frontZFace + WINDOW_GAP);
    lid.add(frontArtWindow);
    const frontBandWindow = new THREE.Mesh(G.band, plasticWindowMat());
    frontBandWindow.position.set(CASE.w / 2 + G.cx, G.bandCy, frontZFace + WINDOW_GAP);
    lid.add(frontBandWindow);

    /* The booklet page's plate image. `g.screenshot` — a real developer
       screenshot from the game's own store page, fetched into steam.json
       by scripts/fetch-steam.js — is preferred; Steam's wide marketing
       key art (library_hero, derived from the appid, no fetch-workflow
       change needed) is the fallback for the games that don't have one.
       Loaded as a plain Image, not a TextureLoader: it is only ever a
       draw source for the booklet canvas, and the DOM overlay re-uses
       the same URL straight from cache. On failure nothing happens at
       all — the lid keeps the plain panel, and because `artHero` is
       only set in onload, the click target genuinely does not exist
       rather than opening an empty view. */
    const plateUrl = g.screenshot || (g.appid && "https://cdn.cloudflare.steamstatic.com/steam/apps/" + g.appid + "/library_hero.jpg");
    if (plateUrl) {
      const isShot = !!g.screenshot;
      const plate = new Image();
      plate.crossOrigin = "anonymous";
      plate.onload = () => {
        innerLidMat.map = caseInnerLidTexture(g, plate, isShot);
        innerLidMat.needsUpdate = true;
        innerLid.userData.artHero = { url: plateUrl, name: g.name, hours: g.hours, achievement: g.achievement, isShot };
        wake();
      };
      plate.src = plateUrl;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(g.capsule, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropy;

      /* Fill the panel's full width, and anchor the crop to the TOP of
         the source image — not centred, not letterboxed. A centred
         cover-crop was the original bug (it shaved a "safe" 6% off the
         top that still cut straight through No Man's Sky's logo, which
         sits flush against the very top pixel of the source). A fitted,
         letterboxed version was tried after that and was wrong for a
         different reason: it left visible side margins around the art,
         which reads as a bordered inset, not a case cover that fills its
         own panel. Top-anchoring is what actually matches a real disc
         case: the art runs the full panel width, starts exactly where
         the band ends with no gap, and whatever crops off is the BOTTOM
         of the source, which is unimportant background in practice on
         every capsule this shelf has, never the logo. */
      const [fc, fx] = canvas2d(540, Math.round(540 / artAspect));
      const drawW = fc.width, drawH = drawW * (t.image.height / t.image.width);
      // background is only a safety net for the (currently nonexistent)
      // case of a source image too SHORT to cover the panel at full
      // width, so cropping never leaves a visible gap at the bottom
      const fg = fx.createLinearGradient(0, 0, 0, fc.height);
      fg.addColorStop(0, "#212730"); fg.addColorStop(1, "#0f1216");
      fx.fillStyle = fg; fx.fillRect(0, 0, fc.width, fc.height);
      fx.drawImage(t.image, 0, 0, drawW, drawH);
      frontMat.map = toTexture(fc); frontMat.needsUpdate = true;

      // the disc's own label is composited on a canvas, not just a
      // cropped Texture, because it carries real printed chrome (the
      // rim ring, the hours-played patch) layered on top of the same
      // art — only a canvas draw can combine the two
      const [dc, dx] = canvas2d(512, 512);
      const a = t.image.width / t.image.height;
      let sx = 0, sy = 0, sw = t.image.width, sh = t.image.height;
      if (a > 1) { sw = t.image.height; sx = (t.image.width - sw) / 2; }
      /* Centre crop, deliberately, after testing the alternative. The
         platform band covers the bottom of the art, so biasing this
         crop downward (to lift each game's logo clear of it) looks like
         the obvious fix — it isn't. Steam capsules put their logo
         wherever suits the art: Red Dead's sits low, Stardew's sits
         near the top. Cropping low at 0.88 rescued Red Dead and then
         pushed Stardew's, Baldur's Gate's and Spider-Man's wordmarks
         off the TOP of the disc instead, cut by the circle. There is no
         single offset that suits all ten, so this stays centred — and
         the band simply covers the lower art, which is what a printed
         band does on a real disc anyway. */
      else { sh = t.image.width; sy = (t.image.height - sh) / 2; }
      dx.drawImage(t.image, sx, sy, sw, sh, 0, 0, 512, 512);
      paintDiscChrome(dx, 512, 512);
      discLabelMat.map = toTexture(dc); discLabelMat.needsUpdate = true;

      wake(); // same reason as the book cover load below: the loop may
              // already have settled and stopped by the time this lands
    }, undefined, () => {});

    x += CASE.w / 2;
    // a case standing face-out on a shelf settles back against the
    // panel rather than balancing perfectly upright; the extra 0.03
    // is the sliver of height that tip costs, so the bottom edge still
    // rests exactly on the board instead of sinking into it
    const lean = -0.038 - (i % 3) * 0.011;
    box.position.set(x, CASE.h / 2 + 0.03, -3);
    box.rotation.x = lean;
    x += CASE.w / 2 + 1.7;

    // the case's face already points at the camera at rest, so the
    // showcase pose pops it forward and stands it straight up
    registerShow(box, {
      pos: new THREE.Vector3(box.position.x, shelf.mid, box.position.z + 17),
      rot: new THREE.Euler(0, 0, 0)
    });

    // merge onto the userData registerShow() just wrote, rather than
    // replacing it — a plain `=` here silently discarded showPos and
    // showQuat, which is what was crashing tick() on the games shelf
    // (each affected item threw and, before tick() was hardened to
    // survive a single bad frame, killed the render loop outright)
    Object.assign(box.userData, {
      kind: "game", title: g.name,
      sub: g.hours + " hours played · last opened " + g.lastPlayed,
      note: "", lid, disc: discObj, discGroup, openT: 0, openTarget: 0, openPulseT: 99,
      winInst, winIndex: i
    });
    discGroup.visible = false; // tick() reveals it once the lid has actually swung clear
    register(shelf, box);
  });
  return x;
}

function register(shelf, obj) {
  obj.userData.home = obj.position.clone();
  obj.userData.homeRot = obj.rotation.clone();
  obj.userData.homeQuat = new THREE.Quaternion().setFromEuler(obj.rotation);
  obj.userData.shelf = shelf;
  obj.userData.poseT = 0;
  obj.userData.poseTarget = 0;
  // the small forward nudge a resting item gets on hover, so the shelf
  // reads as browsable rather than a static diorama — every item gets
  // this, not just games, since it's a pure position offset
  obj.userData.hoverT = 0;
  obj.userData.hoverTarget = 0;
  shelf.items.push(obj);
  shelf.group.add(obj);
  pickable.push(obj);
}

/* Called before register(): stashes the absolute showcase pose an
   item eases toward when it becomes current. Kept separate from
   register() because toys build their showcase pose from the holder
   before its content (sync or async) has necessarily arrived. */
function registerShow(obj, show) {
  obj.userData.showPos = show.pos;
  obj.userData.showQuat = new THREE.Quaternion().setFromEuler(show.rot);
}

const slugify = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ============================================================
   5. HANDHELDS
   ============================================================ */

/* True-to-life dimensions in cm — Steam Deck, Switch Lite and the
   GBA SP are all real scanned models. */
/* `orient` corrects each scan onto our convention (local X = width,
   Y = height, Z = thickness/front-facing) — every scanned source uses
   a different export orientation. This has to be measured against the
   fully assembled scene's actual bounding box (new THREE.Box3().
   setFromObject on the loaded gltf.scene, trying each 90°-rotation
   candidate and matching the result to the device's known real-world
   width:height:depth ratio) — NOT from a single mesh's raw accessor
   min/max. A scan is usually a node hierarchy (shell, buttons, screen
   as separate positioned/rotated sub-nodes), and reading one mesh's
   own vertex bounds skips all of that, which is exactly how the
   switch-lite entry below first shipped wrong: it looked passable at
   the small resting lean angle and only clearly broke in showcase,
   where the true axis mismatch had nowhere left to hide.
     steam-deck   raw X=width Y=height Z=depth → already correct
     switch-lite  raw X=width Z=height Y=depth → swap Y/Z (rotateX)
     gba-sp       raw X=width Z=height Y=depth → swap Y/Z (rotateX),
                  shown hinged open, so it's taller than it is wide */
const DEVICE = {
  "steam-deck":  { w: 29.8, h: 11.7, d: 4.9, shell: 0x3c4044, accent: 0x24272a, screen: [15.5, 9.4], glow: 0x4a6d8a, model: "/assets/cave/models/steam-deck/scene.gltf" },
  "switch-lite": { w: 20.8, h: 9.1,  d: 2.8, shell: 0x5fa79a, accent: 0x3f7d72, screen: [12.2, 6.9], glow: 0x8e4046, model: "/assets/cave/models/switch-lite/scene.gltf", orient: [Math.PI / 2, 0, 0] },
  "gba-sp":      { w: 8.4,  h: 14.9, d: 4.7, shell: 0x5a3fa0, accent: 0x3d2b73, screen: [4.6, 3.9],  glow: 0x5c8ab0, model: "/assets/cave/models/gba-sp/scene.gltf", orient: [Math.PI / 2, 0, 0] }
};

let _glass = null;
function glassTexture() {
  if (_glass) return _glass;
  const [c, x] = canvas2d(256, 256);
  x.fillStyle = "#0a0d10"; x.fillRect(0, 0, 256, 256);
  const g = x.createLinearGradient(0, 220, 256, 20);
  g.addColorStop(0.0, "rgba(255,255,255,0)");
  g.addColorStop(0.40, "rgba(200,218,240,0.06)");
  g.addColorStop(0.52, "rgba(226,238,255,0.26)");
  g.addColorStop(0.63, "rgba(200,218,240,0.07)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  _glass = toTexture(c);
  return _glass;
}

/* The bevel grows the extrusion outward by `bev` on every axis, so the
   finished solid measures (w + 2·bev) × (h + 2·bev) × (d + 2·bev).
   Callers that care about a real-world size (the game cases below are
   a real keep case, to the millimetre) subtract it back out. */
function roundedSlabGeometry(w, h, d, r, bev = 0.34) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d, bevelEnabled: true, bevelThickness: bev,
    bevelSize: bev, bevelSegments: 4, curveSegments: 16
  });
  geo.center();
  return geo;
}

function roundedSlab(w, h, d, r, mat) {
  const m = new THREE.Mesh(roundedSlabGeometry(w, h, d, r), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* Built from primitives, for the two devices with no scan available:
   a recessed screen well, a raised grip block either side, dished
   buttons and a proper d-pad. */
function buildDevice(id) {
  const spec = DEVICE[id];
  const g = new THREE.Group();
  const FACE = spec.d / 2 + 0.34;

  const shellMat = new THREE.MeshStandardMaterial({
    color: spec.shell,
    roughness: spec.metal ? 0.26 : 0.5,
    metalness: spec.metal || 0.04
  });
  g.add(roundedSlab(spec.w, spec.h, spec.d, 1.6, shellMat));

  const [sw, sh] = spec.screen;

  const well = new THREE.Mesh(
    new THREE.BoxGeometry(sw + 1.5, sh + 1.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x141719, roughness: 0.5 })
  );
  well.position.z = FACE - 0.1;
  well.castShadow = false;
  g.add(well);

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(sw, sh),
    new THREE.MeshPhysicalMaterial({
      map: glassTexture(), color: 0x30363d,
      roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03
    })
  );
  glass.position.z = FACE + 0.18;
  g.add(glass);

  const lit = new THREE.Mesh(
    new THREE.PlaneGeometry(sw * 0.97, sh * 0.95),
    new THREE.MeshBasicMaterial({ color: spec.glow, transparent: true, opacity: 0 })
  );
  lit.position.z = FACE + 0.2;
  g.add(lit);
  g.userData.lit = lit;

  const dark = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.44 });
  const edge = spec.w / 2;

  [-1, 1].forEach((s) => {
    const grip = roundedSlab(6.2, spec.h * 0.94, spec.d * 1.25, 1.4,
      new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.58, metalness: spec.metal ? 0.6 : 0.03 }));
    grip.position.set(s * (edge - 3), 0, -0.2);
    g.add(grip);
  });

  const stickGeo = new THREE.CylinderGeometry(1.15, 1.35, 0.85, 24);
  const dishGeo = new THREE.SphereGeometry(0.62, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);

  const put = (geo, x, y, mat) => {
    const m = new THREE.Mesh(geo, mat || dark);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, FACE + 0.3);
    m.castShadow = true;
    g.add(m);
  };

  // the GBA SP has no thumbsticks — d-pad and face buttons only
  if (id !== "gba-sp") {
    put(stickGeo, -edge + 3.2, spec.h * 0.16);
    put(stickGeo, edge - 3.2, spec.h * 0.16);
  }
  const padMat = dark;
  const ph = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.95, 0.55), padMat);
  const pv = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.9, 0.55), padMat);
  [ph, pv].forEach((p) => {
    p.position.set(-edge + 3.0, -spec.h * 0.2, FACE + 0.24);
    p.castShadow = true;
    g.add(p);
  });
  const fy = -spec.h * 0.2;
  [[0, 1.35], [1.35, 0], [0, -1.35], [-1.35, 0]].forEach(([bx, by]) => {
    put(dishGeo, edge - 3.0 + bx, fy + by);
  });
  [-1, 1].forEach((s) => {
    const sh2 = roundedSlab(5.2, 1.1, 1.9, 0.5, dark);
    sh2.position.set(s * (edge - 4.4), spec.h / 2 - 0.1, -0.6);
    g.add(sh2);
  });

  return g;
}

const gltfLoader = new GLTFLoader();

function loadModel(spec, holder) {
  gltfLoader.load(spec.model, (gltf) => {
    try {
      const m = gltf.scene;
      m.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) o.material.envMapIntensity = 0.8;
        }
      });
      // correct this scan's export orientation onto our convention (see
      // the comment on DEVICE above — measured per model, not guessed)
      if (spec.orient) m.rotation.set(spec.orient[0], spec.orient[1], spec.orient[2]);
      m.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
      if (!size.x || !Number.isFinite(size.x)) throw new Error("degenerate model bounds");
      m.scale.setScalar(spec.w / size.x);
      mount(holder, m);
    } catch (err) {
      console.error("cave shelf: model failed to mount, using fallback", spec.model, err);
      mount(holder, buildDevice(holder.userData.deviceId));
    }
  }, undefined, () => {
    // model missing or failed to fetch: fall back to the built
    // primitive so the shelf is never short a device
    mount(holder, buildDevice(holder.userData.deviceId));
  });
}

/* Sit a device flat on the board: centred on its own footprint, with
   its lowest point exactly on the shelf surface. A scanned model and
   a built one have completely different local origins, so this is
   measured, not assumed — otherwise one of the two hovers.

   `content` must still be unparented and untransformed when this
   runs, so the box really is its own bounds. */
function mount(holder, content) {
  content.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(content);
  const c = bb.getCenter(new THREE.Vector3());
  content.position.set(-c.x, -bb.min.y, -c.z);
  holder.add(content);
  // every caller of mount() is either the synchronous initial build
  // (harmless to wake early) or an async GLTF load landing after the
  // loop may have already settled and stopped — this is what actually
  // gets the model drawn either way
  wake();
}

// how far upright each device leans against the back panel at rest —
// close to vertical, rather than lying nearly flat, so its full
// height reads on the shelf next to a standing book
const HOME_LEAN = -0.34;

function addToys(shelf) {
  let x = LEAD_IN;
  CAT.toys.forEach((t) => {
    const spec = DEVICE[t.id];
    if (!spec) return;
    const holder = new THREE.Group();
    holder.userData.deviceId = t.id;

    x += spec.w / 2;
    holder.position.set(x, 0, -3.2);
    holder.rotation.x = HOME_LEAN;
    x += spec.w / 2 + 6;

    if (spec.model) {
      loadModel(spec, holder);
    } else {
      const dev = buildDevice(t.id);
      holder.userData.lit = dev.userData.lit;
      mount(holder, dev);
    }

    // showcase: stand nearly upright, screen square to the camera, and
    // pop well clear of the shelf — perspective alone makes this read
    // noticeably larger than the resting lean
    registerShow(holder, {
      pos: new THREE.Vector3(holder.position.x, shelf.mid, holder.position.z + 24),
      rot: new THREE.Euler(-0.03, 0, 0)
    });

    holder.userData = Object.assign(holder.userData || {}, {
      kind: "toy", title: t.name, sub: t.maker + " · " + t.year, note: t.note || "", credit: t.credit || ""
    });
    register(shelf, holder);
  });
  return x;
}

/* ============================================================
   6. BUILD
   ============================================================ */

function buildAll(games) {
  shelves.forEach((s) => {
    s.group = new THREE.Group();
    s.group.position.y = s.y;
    rig.add(s.group);
  });

  const widths = [
    addBooks(shelves[0]),
    addGames(shelves[1], games),
    addToys(shelves[2])
  ];
  widths.forEach((w, i) => { shelves[i].width = w; });

  const runW = Math.max(...widths);
  const cabinet = buildCabinet(runW + LEAD_IN * 3);
  cabinet.position.x = runW / 2;
  rig.add(cabinet);

  select(0, 0, true);
}

/* ============================================================
   7. SELECTION
   Whichever item is "current" eases toward its showcase pose; every
   other item eases toward its resting pose. Switching the selection
   just retargets those two poseTarget values — the camera is never
   touched here.
   ============================================================ */

let curShelf = 0, curIndex = 0;
let currentObj = null;
let hoveredObj = null;
const litFades = [];

function fadeLit(obj, to) {
  const l = obj.userData.lit;
  if (!l) return;
  litFades.push({ m: l.material, from: l.material.opacity, to, t: 0 });
}

function current() { return shelves[curShelf].items[curIndex]; }

/* On a wide screen the record sits over the left of the stage, so the
   selection is parked right of centre and the type gets clear room. */
function focusOffset() {
  return camera.aspect < 1.1 ? 0 : 15;
}

function select(si, ii, instant) {
  const s = shelves[Math.max(0, Math.min(shelves.length - 1, si))];
  if (!s.items.length) return;

  curShelf = shelves.indexOf(s);
  curIndex = Math.max(0, Math.min(s.items.length - 1, ii));
  const obj = current();

  if (currentObj && currentObj !== obj) {
    currentObj.userData.poseTarget = 0;
    fadeLit(currentObj, 0);
    // a case left open while it eases back onto the shelf would show a
    // gaping lid shrinking into the row behind it — close it first,
    // with the same settle bounce a manual close gets
    if (currentObj.userData.lid && currentObj.userData.openTarget) {
      currentObj.userData.openTarget = 0;
      currentObj.userData.openPulseT = 0;
    }
  }
  obj.userData.poseTarget = 1;
  fadeLit(obj, 1);
  if (instant || reduceMotion.matches) obj.userData.poseT = 1;
  // a showcased item already pops forward on its own; it doesn't also
  // need whatever browsing-hover nudge it happened to be carrying
  obj.userData.hoverTarget = 0;
  if (hoveredObj === obj) hoveredObj = null;
  currentObj = obj;

  travel.tx = -obj.position.x + focusOffset();
  travel.ty = -s.y + (LOOK.y - (s.mid || 12));
  if (instant || reduceMotion.matches) { travel.x = travel.tx; travel.y = travel.ty; }

  paint(obj);
  document.querySelectorAll("[data-jump]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.jump === s.id));

  // even an "instant" change needs one fresh frame to actually show it
  // if the loop had already stopped from sitting idle
  wake();
}

function paint(obj) {
  if (!obj) return;
  const s = shelves[curShelf];
  panel.num.textContent = String(curIndex + 1).padStart(2, "0") + " / " + String(s.items.length).padStart(2, "0");
  panel.title.textContent = obj.userData.title;
  panel.sub.textContent = obj.userData.sub;
  panel.note.textContent = obj.userData.note;
  panel.credit.textContent = obj.userData.credit || "";

  if (panel.openBtn) {
    const isGame = obj.userData.kind === "game";
    panel.openBtn.hidden = !isGame;
    if (isGame) panel.openBtn.textContent = obj.userData.openTarget ? "Close case" : "Open case";
  }
}

// toggles the currently showcased case's lid — a no-op for anything
// that isn't a game, so the button can be wired up without also
// having to guard every call site against a book or a handheld
function toggleCase(obj) {
  if (!obj || !obj.userData.lid) return;
  obj.userData.openTarget = obj.userData.openTarget ? 0 : 1;
  // restarts the settle-bounce timer tick() reads — see the comment
  // on it there for what it actually drives
  obj.userData.openPulseT = 0;
  if (panel.openBtn) panel.openBtn.textContent = obj.userData.openTarget ? "Close case" : "Open case";
  wake();
}

function step(d) {
  let i = curIndex + d, s = curShelf;
  if (i < 0) {
    if (s === 0) { i = 0; } else { s--; i = shelves[s].items.length - 1; }
  } else if (i >= shelves[s].items.length) {
    if (s === shelves.length - 1) { i = shelves[s].items.length - 1; }
    else { s++; i = 0; }
  }
  select(s, i);
}

function stepShelf(d) {
  const s = Math.max(0, Math.min(shelves.length - 1, curShelf + d));
  if (s === curShelf) return false;
  const ratio = curIndex / Math.max(1, shelves[curShelf].items.length - 1);
  select(s, Math.round(ratio * (shelves[s].items.length - 1)));
  return true;
}

/* ============================================================
   8. INPUT
   ============================================================ */

/* Dragging and wheeling both used to fire a discrete step() every
   time the pointer crossed a threshold. A brisk swipe across a
   14-book row crosses that threshold many times inside one gesture,
   each call kicking off its own ~400ms pose transition — faster than
   any single one can finish, so half the row ends up mid-lift at
   once. That was the "bugged" look.

   The fix: while the gesture is live, only the rig itself follows the
   pointer (a plain, continuous slide — no per-item pose ever
   retargets). Exactly one selection change fires, at the very end,
   snapping to whichever item is nearest the focus point. One
   transition, always. */

function shelfTy(i) {
  const s = shelves[i];
  return -s.y + (LOOK.y - (s.mid || 12));
}

// `atX`/`atY` let a caller ask "nearest to where this gesture's
// momentum is actually headed" instead of "nearest to where the rig
// happens to sit right now" — see the momentum projection on release,
// below. Omitted, both default to the live rig position, unchanged
// from before.
function nearestOnShelf(si, atX) {
  const targetX = atX !== undefined ? atX : focusOffset() - travel.x;
  const items = shelves[si].items;
  let best = 0, bestD = Infinity;
  items.forEach((o, i) => {
    const d = Math.abs(o.position.x - targetX);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
function nearestShelf(atY) {
  const ty = atY !== undefined ? atY : travel.y;
  let best = 0, bestD = Infinity;
  shelves.forEach((s, i) => {
    const d = Math.abs(shelfTy(i) - ty);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();

/* The exact mesh the ray landed on, before pickAt() walks up to the
   shelf item that owns it. Needed because the booklet page is a child
   of the case, so "which item is this" (what pickAt returns) can't tell
   the lid's art panel apart from the case's own shell. Set on every
   pickAt() call and read immediately after it — never trust it across
   an await or a later frame. */
let lastRawHit = null;

function pickAt(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.x = ((cx - r.left) / r.width) * 2 - 1;
  ptr.y = -((cy - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(pickable, true)[0];
  lastRawHit = hit ? hit.object : null;
  if (!hit) return null;
  let o = hit.object;
  while (o && !o.userData.kind) o = o.parent;
  return o || null;
}

/* The booklet under the pointer, or null. Deliberately strict: the art
   only opens from the item that's actually showcased, and only once its
   lid has swung far enough that the page is genuinely facing the camera
   (DISC_REVEAL_T is the same gate the disc itself uses). Without the
   open check a click could otherwise land on a page that is physically
   there but visually edge-on or hidden behind the closed cover. */
function bookletAt(cx, cy) {
  const owner = pickAt(cx, cy);
  const raw = lastRawHit;
  if (!raw || !raw.userData.artHero) return null;
  if (!owner || owner !== current()) return null;
  if (!(owner.userData.openT > DISC_REVEAL_T)) return null;
  return raw.userData.artHero;
}

let dragging = false, dragAxis = null;
let startClientX = 0, startClientY = 0, startTx = 0, startTy = 0;
let movedX = 0, movedY = 0;

/* A short rolling history of {x, y, t} pointer samples, just enough to
   read a real release velocity from — not the whole gesture, since an
   average over the entire drag would be dragged down by however the
   gesture started, not how it's moving right now at release. */
const ptHistory = [];
const VELOCITY_WINDOW_MS = 80;

function pushSample(e) {
  ptHistory.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  while (ptHistory.length > 8) ptHistory.shift();
}

// px/second along one axis, read from the most recent ~80ms of samples
// rather than just the last two points (which a single stalled frame
// can turn into noise).
function releaseVelocity(axis) {
  if (ptHistory.length < 2) return 0;
  const newest = ptHistory[ptHistory.length - 1];
  let old = ptHistory[0];
  for (let i = ptHistory.length - 2; i >= 0; i--) {
    old = ptHistory[i];
    if (newest.t - ptHistory[i].t >= VELOCITY_WINDOW_MS) break;
  }
  const dt = (newest.t - old.t) / 1000;
  if (dt <= 0) return 0;
  return ((axis === "x" ? newest.x - old.x : newest.y - old.y)) / dt;
}

/* Apple's own momentum-projection function (Designing Fluid Interfaces,
   WWDC 2018): where a flick at this velocity would actually come to
   rest under normal scroll deceleration, in the same px units the
   gesture itself is measured in — NOT the physics-textbook v²/(2·decel)
   form. decelerationRate 0.998 is the standard "normal scroll" feel. */
function project(velocity, decelerationRate = 0.998) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/* Soft boundary instead of a hard stop: the further past `dimension`
   the drag goes, the less of the extra distance actually gets through.
   Used both for the horizontal drag cap and to keep momentum
   projection from ever throwing the shelf absurdly far past a real
   snap point. */
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/* Where the gesture's own momentum — not just where the pointer
   happened to be at the exact instant it lifted — says this flick
   should land. A flick thrown fast across a shelf row should land
   further along it than an identical-length drag that was released
   slowly; without this every release picked the nearest item to the
   raw endpoint regardless of how fast it was moving, so a hard flick
   and a lazy drag of the same distance behaved identically. Reduced
   motion turns this off entirely (a released gesture lands exactly
   where it was let go, no extra travel), matching every other bit of
   momentum/overshoot in this file. The rubberband() reuse here isn't
   a boundary — it's capping the projection itself so a very fast flick
   still can't throw the shelf multiple shelves or a dozen items past a
   sane landing point. */
function projectedFocusX() {
  if (reduceMotion.matches) return focusOffset() - travel.x;
  const raw = project(releaseVelocity("x"));
  const capped = Math.sign(raw) * rubberband(Math.abs(raw), 140);
  return focusOffset() - (travel.x + capped);
}
function projectedTy() {
  if (reduceMotion.matches) return travel.y;
  // travel.ty now tracks `startTy + dy` (see the pointermove handler —
  // this was `- dy`, which had the whole drag direction backwards), so
  // its velocity runs the SAME way as the raw pointer's, not opposite.
  // Cap was SHELF_GAP * 0.9 (~41 of a ~46-51 gap) — nearly a WHOLE
  // shelf-gap of extra travel on top of wherever the raw drag ended,
  // which directly broke this function's own stated goal ("can't throw
  // the shelf... past a sane landing point"): with only 3 shelves, a
  // raw drag that lands anywhere past the midpoint to shelf 1 plus
  // that much momentum reliably overshoots into shelf 2, skipping the
  // middle shelf ("Last played") entirely on any drag with real
  // velocity — confirmed directly by instrumenting travel.ty through a
  // controlled drag: raw landed at 49 (right next to shelf 1's 46,
  // shelf 2 is 97) and projectedTy() still resolved to shelf 2. Capped
  // to a fifth of a gap instead — still a real nudge toward the next
  // shelf on a genuine flick, not enough to single-handedly cover
  // another whole gap on top of the drag itself.
  const raw = project(releaseVelocity("y"));
  const capped = Math.sign(raw) * rubberband(Math.abs(raw), SHELF_GAP * 0.2);
  return travel.y + capped;
}

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  dragAxis = null;
  movedX = movedY = 0;
  startClientX = e.clientX; startClientY = e.clientY;
  // Grabbing mid-flight has to continue from wherever the rig actually
  // IS on screen (travel.x/y, the live "presentation" value), not from
  // whatever it was easing TOWARD (travel.tx/ty). Reading the target
  // here would make the very first pointermove of a re-grab snap the
  // rig to the old destination before the drag continues from there —
  // a visible jump exactly where interrupting a settle animation is
  // supposed to be seamless.
  startTx = travel.x; startTy = travel.y;
  ptHistory.length = 0;
  pushSample(e);
  canvas.setPointerCapture(e.pointerId);
  // a whole-shelf drag is a different gesture from browsing in place —
  // whatever was hovered a moment ago shouldn't keep sitting forward
  if (hoveredObj) { hoveredObj.userData.hoverTarget = 0; hoveredObj = null; }
  wake();
});

// The shelf reads as browsable rather than a static diorama mostly
// because of this: whatever's under the pointer while just looking
// around — not dragging, not already the current item — nudges gently
// forward and eases back the instant the pointer leaves it.
function updateHover(cx, cy) {
  const hit = pickAt(cx, cy);
  // the page prints "CLICK TO ENLARGE", so the cursor has to agree —
  // reads lastRawHit, which the pickAt() immediately above just set
  const overBooklet = !!(lastRawHit && lastRawHit.userData.artHero &&
    hit === current() && hit.userData.openT > DISC_REVEAL_T);
  canvas.style.cursor = overBooklet ? "zoom-in" : "";
  const next = hit && hit !== current() ? hit : null;
  if (next === hoveredObj) return;
  if (hoveredObj) hoveredObj.userData.hoverTarget = 0;
  hoveredObj = next;
  if (hoveredObj) hoveredObj.userData.hoverTarget = 1;
  wake();
}
canvas.addEventListener("pointerleave", () => {
  if (!hoveredObj) return;
  hoveredObj.userData.hoverTarget = 0;
  hoveredObj = null;
  wake();
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) { updateHover(e.clientX, e.clientY); return; }
  const dx = e.clientX - startClientX, dy = e.clientY - startClientY;
  movedX = Math.abs(dx); movedY = Math.abs(dy);
  pushSample(e);

  // the gesture commits to one axis the first time it clears a small
  // deadzone, so a slightly diagonal swipe doesn't fight itself
  if (!dragAxis && (movedX > 6 || movedY > 6)) {
    dragAxis = movedY > movedX * 1.3 ? "y" : "x";
  }
  if (dragAxis === "x") {
    // 1:1 up to the cap, then a soft boundary instead of a hard stop —
    // dragging further past it still nudges the shelf a little further,
    // just with progressively more resistance, the way a real edge
    // resists rather than simply refusing to move at all
    const maxDrag = 300;
    travel.tx = startTx + (Math.abs(dx) <= maxDrag
      ? dx
      : Math.sign(dx) * (maxDrag + rubberband(Math.abs(dx) - maxDrag, maxDrag)));
  } else if (dragAxis === "y") {
    const min = shelfTy(0), max = shelfTy(shelves.length - 1);
    // Was `startTy - dy`, which made dragging DOWN move target toward
    // shelfTy(0) (Books) — i.e. backwards/previous-shelf — while the
    // on-screen hint ("drag down ... for the next shelf") promises the
    // opposite. `+ dy` makes a physical downward drag increase target,
    // which is the direction of increasing shelf index (Books → Last
    // played → Toys), matching both the hint text and shelfTy's own
    // ordering (shelfTy(0) < shelfTy(1) < shelfTy(2)).
    const target = startTy + dy;
    // Wrap-around is meant to trigger only past the true ends — i.e.
    // target < min (dragged past the top-most shelf) or target > max
    // (past the bottom-most). The comparisons here were backwards
    // (`target > min` / `target < max`), and since min < max, almost
    // every in-range target satisfies `target > min` on its own — so
    // travel.ty could only ever land on exactly min or exactly max,
    // never anywhere in between. That's the actual bug behind "can't
    // drag to Last played": the middle shelf was never reachable by
    // drag, the gesture snapped straight past it on every frame.
    //
    // A straight `target < min` still isn't enough on its own, though:
    // Books sits AT min, so a drag aimed at landing on Books that
    // overshoots by even a couple of units (easy — it's a real gesture,
    // not a laser) crossed straight into "wrap to Toys" instead of just
    // landing on the shelf it was already touching. The X-axis drag
    // avoids exactly this with a soft rubberband past its own edge
    // instead of a hard cutoff; this needs the equivalent — a margin
    // past the boundary shelf itself before a wrap is actually the
    // right read of the gesture, not a slightly-long drag toward it.
    const WRAP_MARGIN = SHELF_GAP * 0.5;
    if (target < min - WRAP_MARGIN) {
      travel.ty = max;
    } else if (target > max + WRAP_MARGIN) {
      travel.ty = min;
    } else {
      travel.ty = target;
    }
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  canvas.releasePointerCapture(e.pointerId);

  if (movedX < 6 && movedY < 6) {
    // The booklet page is checked first: it lives on the item that's
    // ALREADY current, and the branch below deliberately does nothing
    // when you click the current item — so without this the page would
    // be unreachable by click no matter what it's tagged with.
    const art = bookletAt(e.clientX, e.clientY);
    if (art) { openArtViewer(art); return; }
    // a real click/tap: jump straight to whatever is under the pointer
    const hit = pickAt(e.clientX, e.clientY);
    if (!hit || hit === current()) return;
    const si = shelves.indexOf(hit.userData.shelf);
    select(si, hit.userData.shelf.items.indexOf(hit));
    return;
  }
  // the gesture ended mid-slide: land on whatever is nearest where its
  // own momentum projects it to, not just the raw release point
  if (dragAxis === "y") select(nearestShelf(projectedTy()), curIndex);
  else select(curShelf, nearestOnShelf(curShelf, projectedFocusX()));
});

/* A real browser can interrupt a gesture (a touch scroll conflict, the
   OS stealing focus) without ever firing pointerup. Without this, the
   pointer stays "captured" in our own bookkeeping and the rig can be
   left stranded off its snap point until another full gesture starts. */
canvas.addEventListener("pointercancel", (e) => {
  if (!dragging) return;
  dragging = false;
  if (movedX >= 6 || movedY >= 6) {
    if (dragAxis === "y") select(nearestShelf(projectedTy()), curIndex);
    else select(curShelf, nearestOnShelf(curShelf, projectedFocusX()));
  } else {
    // barely moved before the cancel: just settle back to where we were
    select(curShelf, curIndex);
  }
});

/* Wheel gets the same treatment: nudge continuously, then settle on
   whatever's nearest once scrolling actually pauses, instead of
   firing a select() per tick of the wheel. */
let wheelSettle = null;
function armWheelSettle(axis) {
  clearTimeout(wheelSettle);
  wheelSettle = setTimeout(() => {
    // must go null before select() fires, not after — tick() treats a
    // truthy wheelSettle as "a gesture is still in flight" to keep the
    // loop alive, and an expired timer id left behind would pin the
    // loop on forever after the very first scroll
    wheelSettle = null;
    if (axis === "y") select(nearestShelf(), curIndex);
    else select(curShelf, nearestOnShelf(curShelf));
  }, reduceMotion.matches ? 0 : 140);
  wake();
}

canvas.addEventListener("wheel", (e) => {
  const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  if (horiz) {
    e.preventDefault();
    travel.tx -= e.deltaX;
    armWheelSettle("x");
    return;
  }
  const down = e.deltaY > 0;
  const canGo = down ? curShelf < shelves.length - 1 : curShelf > 0;
  const atRest = Math.abs(travel.ty - shelfTy(curShelf)) < 0.5;
  if (!canGo && atRest) return;   // let the page scroll on
  e.preventDefault();
  const min = shelfTy(0), max = shelfTy(shelves.length - 1);
  travel.ty = Math.max(Math.min(travel.ty - e.deltaY * 0.6, Math.max(min, max)), Math.min(min, max));
  armWheelSettle("y");
}, { passive: false });

addEventListener("keydown", (e) => {
  const k = e.key;
  if (k === "ArrowLeft") { e.preventDefault(); step(-1); }
  else if (k === "ArrowRight") { e.preventDefault(); step(1); }
  else if (k === "ArrowUp") { if (stepShelf(-1)) e.preventDefault(); }
  else if (k === "ArrowDown") { if (stepShelf(1)) e.preventDefault(); }
});

document.querySelectorAll("[data-jump]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const i = shelves.findIndex((s) => s.id === btn.dataset.jump);
    if (i < 0) return;
    select(i, 0);
  });
});
document.querySelector("[data-prev]")?.addEventListener("click", () => step(-1));
document.querySelector("[data-next]")?.addEventListener("click", () => step(1));
panel.openBtn?.addEventListener("click", () => toggleCase(currentObj));

/* ============================================================
   9. RESIZE + LOOP
   ============================================================ */

/* The only place the camera is ever touched, aside from its initial
   setup above. Stepping through items or shelves never calls this —
   only an actual window resize does. */
function homePos() {
  const half = Math.tan((camera.fov * Math.PI / 180) / 2);
  let dist = 24 / half;
  const needW = camera.aspect < 1.1 ? 46 : 96;
  dist = Math.max(dist, (needW / 2) / (half * camera.aspect));
  return new THREE.Vector3(0, CAM_Y, dist);
}

function resize() {
  // the canvas's own box, not .stage's — on the mobile layout .stage
  // is a flex column holding both the canvas AND the record panel
  // text below it, so .stage.clientHeight is taller than what the
  // canvas actually renders at. Sizing the renderer to that mismatch
  // is exactly what stretched the 3D scene: the WebGL buffer's aspect
  // ratio stopped matching the box it was actually being displayed in.
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.position.copy(homePos());
  camera.lookAt(LOOK);
  wake();
}
addEventListener("resize", resize);

const travel = { x: 0, tx: 0, y: 0, ty: 0 };
const clock = new THREE.Clock();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
// scratch for the instanced-window matrix math below — a case's own
// matrix composed fresh each frame, times each panel's fixed local
// offset, written straight into the shared InstancedMesh objects
const _boxMat = new THREE.Matrix4();
const _instMat = new THREE.Matrix4();
const _oneScale = new THREE.Vector3(1, 1, 1);

/* Render-on-demand. A shelf sitting there with nothing changing has no
   reason to run shadow maps and draw calls sixty times a second —
   that was the single biggest thing making this page heavy on CPU,
   and it cost the same whether anyone was touching the shelf or had
   tabbed away and forgotten it was open. The loop now stops itself
   completely once everything has actually arrived at its target, and
   `wake()` is the only thing allowed to restart it — called from
   every place that sets a new travel or pose target (select, drag,
   wheel, resize, context restore), so nothing can go stale by simply
   forgetting to ask for a frame. */
let looping = false;
function wake() {
  if (looping) return;
  looping = true;
  clock.getDelta(); // drop whatever piled up while stopped, so the
                     // first frame back doesn't leap on a huge dt
  requestAnimationFrame(tick);
}

/* ============================================================
   PERFORMANCE GOVERNOR
   Render-on-demand and the static tuning above (pixel ratio cap,
   hard shadows, a smaller map, lower anisotropy) get every device to
   a good starting point, but "good" on the machine this was built on
   proves nothing about a five-year-old laptop or a mid-range phone.
   This measures REAL frame delivery — the timestamp requestAnimation-
   Frame itself hands back, the one number immune to anything my own
   JS timers could be fooled by — only while something is actually
   animating (idle is already free), and steps quality down exactly
   once per rolling window if the device can't hold ~50fps. It never
   steps back up: a quality level that visibly flickers mid-session is
   worse than one that's merely conservative for the rest of the visit.
   ============================================================ */
let tierIndex = 0;
function applyTier(i) {
  tierIndex = i;
  const t = TIERS[i];
  renderer.setPixelRatio(t.pr);
  // (bloom used to be the first thing dropped here — see the long note
  // where the composer was set up for why there's no bloom to drop now)
  renderer.shadowMap.enabled = t.shadows;
  renderer.shadowMap.type = t.type;
  key.castShadow = t.shadows;
  key.shadow.mapSize.set(t.map, t.map);
  if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
  resize();
}

const GOV_WINDOW = 40;      // frames per measurement window
const GOV_BUDGET_MS = 20;   // ~50fps floor before stepping down a tier
let govFrameCount = 0, govWindowStart = 0;
function governFrame(time, wasActive) {
  if (!wasActive || tierIndex >= TIERS.length - 1) { govFrameCount = 0; return; }
  if (govFrameCount === 0) govWindowStart = time;
  govFrameCount++;
  if (govFrameCount >= GOV_WINDOW) {
    const avgMs = (time - govWindowStart) / govFrameCount;
    govFrameCount = 0;
    if (avgMs > GOV_BUDGET_MS) applyTier(tierIndex + 1);
  }
}

const TRAVEL_EPS = 0.02;
const POSE_EPS = 0.0008;
// how far a resting item pops toward the camera on hover
const HOVER_BUMP = 1.6;

/* The loop must also be un-killable: a single bad frame — a GPU
   hiccup, an async texture callback that left something in a
   half-updated state, anything — must never take down every frame
   after it for the rest of the visit. Before this, ANY thrown error
   inside tick() stopped requestAnimationFrame from ever being called
   again, and the shelf would freeze on whatever it last managed to
   draw while the rest of the page (which doesn't touch WebGL) kept
   working normally — engine state advancing, panel text updating,
   nothing visibly wrong except the one thing that actually shows the
   current selection. The catch here can't fix an unknown root cause,
   but it guarantees the next frame always gets a chance to render
   correctly instead of the failure being permanent. */
function tick(time) {
  let settled = true;
  try {
    if (!contextLost) {
      const dt = Math.min(clock.getDelta(), 0.05);
      const kTravel = reduceMotion.matches ? 1 : 1 - Math.pow(0.0015, dt);
      const kPose = reduceMotion.matches ? 1 : 1 - Math.pow(0.002, dt);

      const travelDx = travel.tx - travel.x, travelDy = travel.ty - travel.y;
      if (dragging) {
        // Direct manipulation: while a gesture is actually live the rig
        // must stay glued 1:1 to the pointer, not follow it through the
        // same eased filter a programmatic transition uses. Running it
        // through kTravel here too was a real, if subtle, latency: every
        // pointermove only ever closed ~10% of the gap to the pointer
        // per frame, so the shelf was always trailing behind the finger
        // during the drag itself, not just snapping to it afterward.
        travel.x = travel.tx; travel.y = travel.ty;
      } else if (Math.abs(travelDx) < TRAVEL_EPS && Math.abs(travelDy) < TRAVEL_EPS) {
        travel.x = travel.tx; travel.y = travel.ty;
      } else {
        settled = false;
        travel.x += travelDx * kTravel;
        travel.y += travelDy * kTravel;
      }
      rig.position.set(travel.x, travel.y, 0);

      pickable.forEach((o) => {
        const u = o.userData;

        // the case lid opens independently of the item's own pose —
        // it can swing while the case is sitting fully showcased at
        // rest — so this runs unconditionally, not inside whichever
        // pose branch below happens to fire this frame
        if (u.lid) {
          if (Math.abs(u.openTarget - u.openT) < POSE_EPS) {
            u.openT = u.openTarget;
          } else {
            settled = false;
            u.openT += (u.openTarget - u.openT) * kPose;
          }

          // a physical latch doesn't stop dead: for a brief window
          // after every open/close toggle, a fast decaying oscillation
          // rides on top of the eased angle — the "flexes, then
          // settles, tiny bounce" beat. openPulseT is the time since
          // that toggle; once it's run past the point the sine wave is
          // below visual precision, this whole block goes inert again.
          // Gated behind reduceMotion like every other bit of motion in
          // this file — kPose above already makes openT SNAP instantly
          // when motion is reduced, and this pulse must never survive
          // that snap as a lingering jitter the user explicitly asked
          // not to see.
          u.openPulseT += dt;
          let wobble = 0;
          if (!reduceMotion.matches && u.openPulseT < 1.1) {
            settled = false;
            wobble = Math.exp(-u.openPulseT * 6.5) * Math.sin(u.openPulseT * 27) * 0.14;
          }
          u.lid.rotation.y = -OPEN_ANGLE * u.openT + wobble;
          // the disc has no hinge of its own to flex — what it has is
          // inertia, so it picks up a slightly bigger share of the
          // same pulse as a wobble around its own face, like a disc
          // jostling on a hub the case just swung.
          // MUST be rotation.y, not .z: discObj is built face-normal-
          // along-Y then baked to rotation.x = PI/2 (see buildDisc),
          // which puts the face normal on world Z. With that base pose
          // already set, .rotation.x/.y/.z are independent Euler terms
          // recomposed as Rx·Ry·Rz — since the face normal IS the Y
          // axis pre-bake, spinning the Y term leaves it fixed (a pure
          // in-plane spin), but spinning Z rotates around an axis that
          // lies IN the disc's own face, i.e. tips it edge-on. Verified
          // directly: with x=PI/2, setting z=0.3 moves the face normal
          // from (0,0,1) to (-0.296,0,0.955) — a real tilt, not a spin
          // — while setting y=0.3 leaves it at (0,0,1) exactly. The old
          // .z version was the actual cause of the reported "disc
          // wiggles and shows a black texture on its side": that tilt
          // exposes discEdgeMat, a highly metallic (0.85) material
          // with no reflection to catch from a face-on camera, which
          // is why it read as a flash of solid black rather than a
          // shaded edge.
          if (u.disc) u.disc.rotation.y = wobble * 1.8;
          // see the long comment on discGroup in addGames() — below
          // this angle the closing cover is still physically sweeping
          // through the disc's own space, and from this fixed camera
          // it hasn't visibly cracked open far enough to show the disc
          // yet anyway, so nothing is lost by not drawing it
          if (u.discGroup) u.discGroup.visible = u.openT > DISC_REVEAL_T;
        }

        if (Math.abs(u.poseTarget - u.poseT) < POSE_EPS) {
          u.poseT = u.poseTarget;
          // fully at rest: pin exactly, so float error never creeps in
          if (u.poseT === 0) { o.position.copy(u.home); o.quaternion.copy(u.homeQuat); }
          else { o.position.copy(u.showPos); o.quaternion.copy(u.showQuat); }
        } else {
          settled = false;
          u.poseT += (u.poseTarget - u.poseT) * kPose;
          _pos.lerpVectors(u.home, u.showPos, u.poseT);
          _quat.slerpQuaternions(u.homeQuat, u.showQuat, u.poseT);
          o.position.copy(_pos);
          o.quaternion.copy(_quat);
        }

        // the browsing-hover nudge: a plain forward offset added on
        // top of whichever pose branch just ran, so it works whether
        // the item just got pinned to its home position or is still
        // easing there
        if (Math.abs(u.hoverTarget - u.hoverT) < POSE_EPS) {
          u.hoverT = u.hoverTarget;
        } else {
          settled = false;
          u.hoverT += (u.hoverTarget - u.hoverT) * kPose;
        }
        if (u.hoverT > 0.0004) o.position.z += u.hoverT * HOVER_BUMP;

        // the three instanced BACK windows: this case's own matrix,
        // freshly composed from the position/rotation just settled
        // above (including the hover bump), times each panel's fixed
        // local offset — never read from o.matrix itself, which three
        // only refreshes during the render traversal and would still
        // be showing last frame's transform at this point
        if (u.winInst) {
          _boxMat.compose(o.position, o.quaternion, _oneScale);
          _instMat.multiplyMatrices(_boxMat, u.winInst.backArtOffset);
          u.winInst.backArt.setMatrixAt(u.winIndex, _instMat);
          _instMat.multiplyMatrices(_boxMat, u.winInst.backBandOffset);
          u.winInst.backBand.setMatrixAt(u.winIndex, _instMat);
          _instMat.multiplyMatrices(_boxMat, u.winInst.spineOffset);
          u.winInst.spine.setMatrixAt(u.winIndex, _instMat);
        }
      });

      if (_gameWinInst) {
        _gameWinInst.backArt.instanceMatrix.needsUpdate = true;
        _gameWinInst.backBand.instanceMatrix.needsUpdate = true;
        _gameWinInst.spine.instanceMatrix.needsUpdate = true;
      }

      if (litFades.length) settled = false;
      for (let i = litFades.length - 1; i >= 0; i--) {
        const f = litFades[i];
        f.t = Math.min(1, f.t + dt / 0.4);
        f.m.opacity = f.from + (f.to - f.from) * f.t;
        if (f.t >= 1) litFades.splice(i, 1);
      }

      // a live drag/wheel gesture pushes travel.tx/ty directly, outside
      // this function, so the loop must keep running for its duration
      // even on a frame where nothing has moved yet
      if (dragging || wheelSettle) settled = false;

      renderer.render(scene, camera);
    }
  } catch (err) {
    console.error("cave shelf: frame failed, continuing", err);
    settled = false; // don't let a mid-failure frame masquerade as "done"
  }
  governFrame(time, !settled);
  if (settled) { looping = false; return; }
  requestAnimationFrame(tick);
}

/* ============================================================
   10. GO
   ============================================================ */

function ledger(sel, rows) {
  const ul = document.querySelector(sel);
  if (!ul || !rows.length) return;
  ul.innerHTML = "";
  rows.forEach((r) => { const li = document.createElement("li"); li.textContent = r; ul.appendChild(li); });
}

// the shelf cards' item counts are real, not the mock numbers baked
// into the markup for the no-JS/first-paint state — this replaces
// them with whatever's actually on the shelf
function paintCount(shelfId, n) {
  const el = document.querySelector('[data-count="' + shelfId + '"]');
  if (!el) return;
  el.textContent = n ? n + (n === 1 ? " item" : " items") : "—";
}

async function start() {
  let games = [];
  try {
    const r = await fetch("/assets/cave/steam.json", { cache: "no-cache" });
    if (r.ok) {
      const d = await r.json();
      games = d.games || [];
      ledger("[data-ledger-games]", games.map((g) => g.name + " — " + g.hours + " h, last played " + g.lastPlayed));
    }
  } catch (_) {}

  try {
    const r = await fetch("/assets/cave/books/index.json", { cache: "no-cache" });
    if (r.ok) covers = await r.json();
  } catch (_) {}

  try { await document.fonts.ready; } catch (_) {}

  paintCount("books", CAT.books.length);
  paintCount("games", games.length);
  paintCount("toys", CAT.toys.length);

  buildAll(games);
  resize(); // also kicks off the first frame via its own wake() call
}

start();

