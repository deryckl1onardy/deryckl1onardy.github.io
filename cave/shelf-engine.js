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
  credit: document.querySelector("[data-credit]")
};

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

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
scene.add(new THREE.HemisphereLight(0xfff4e2, 0xb8ae9e, 0.55));

const key = new THREE.DirectionalLight(0xfff0dc, 3.1);
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
key.shadow.radius = 2;
scene.add(key);

const fill = new THREE.DirectionalLight(0xe6ecf4, 0.4);
fill.position.set(80, 20, 70);
scene.add(fill);

// a low warm rim from behind-left, just enough to separate a book's
// spine edge from the dark recess of the cabinet
const rim = new THREE.DirectionalLight(0xffe6c2, 0.5);
rim.position.set(-40, 10, -60);
scene.add(rim);

const rig = new THREE.Group();
scene.add(rig);

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
const backerMat = new THREE.MeshStandardMaterial({ color: 0xa89e90, roughness: 0.96 });

/* Baked ambient occlusion for the back wall: a soft dark band exactly
   where each shelf board meets it. The camera sits close to shelf
   height, almost side-on to the boards, so a real contact shadow
   there would land on this vertical surface — not on the boards
   themselves, which the camera barely sees the face of. Cheap
   (one shared multiply-map on a mesh that already exists) instead of
   a real AO pass, but it's exactly what a real corner like this does:
   read darker right where two surfaces meet. `vs` is each shelf's
   board line as a 0..1 fraction of the back panel's own height. */
function backAOTexture(vs) {
  const W = 64, H = 512;
  const [c, x] = canvas2d(W, H);
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  vs.forEach((v) => {
    // canvas rows run top(0)→bottom(H); a CanvasTexture's V=1 lands on
    // the canvas's top row, so v=1 (topY) must be painted near row 0
    const cy = H * (1 - v);
    // biased upward: the board's underside is what actually blocks the
    // key light (coming from above), so the wall it shadows is mostly
    // the bay ABOVE the board, not below it — a symmetric band read as
    // a smudge straddling the board rather than a shadow it's casting
    const up = 0.16 * H, down = 0.05 * H;
    const g = x.createLinearGradient(0, cy - up, 0, cy + down);
    g.addColorStop(0.0, "rgba(14,11,8,0)");
    g.addColorStop(0.42, "rgba(14,11,8,0.34)");
    g.addColorStop(0.72, "rgba(14,11,8,0.58)");
    g.addColorStop(0.86, "rgba(14,11,8,0.4)");
    g.addColorStop(1.0, "rgba(14,11,8,0)");
    x.fillStyle = g;
    x.fillRect(0, Math.max(0, cy - up), W, up + down);
  });
  return toTexture(c);
}

/* ---------- book spine + cover art ---------- */

function luminance(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (sh) => { const v = ((n >> sh) & 255) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(16) + 0.7152 * f(8) + 0.0722 * f(0);
}
function inkOn(hex, foil) {
  const L = luminance(hex);
  if (foil) return L > 0.22 ? "#3a2907" : "#f0d6a0";
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

function sleeveTexture(game, color) {
  const W = 512, H = 768;
  const [c, x] = canvas2d(W, H);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, color); g.addColorStop(1, "#1d1a17");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = "rgba(255,246,233,0.95)"; x.textAlign = "left";
  const words = game.name.split(" ");
  const lines = []; let line = "";
  x.font = `700 46px "Plus Jakarta Sans", system-ui, sans-serif`;
  words.forEach((w) => {
    const t = line ? line + " " + w : w;
    if (x.measureText(t).width > W - 96 && line) { lines.push(line); line = w; } else line = t;
  });
  if (line) lines.push(line);
  lines.slice(0, 4).forEach((l, i) => x.fillText(l, 48, H - 190 + i * 54));
  x.font = `600 24px "Inter", system-ui, sans-serif`;
  x.globalAlpha = 0.6; x.fillText(game.hours + " HOURS", 48, H - 92); x.globalAlpha = 1;
  return toTexture(c);
}

/* ============================================================
   3. CARCASS
   ============================================================ */

const SHELF_D = 30, BOARD_T = 3, BAY_H = 30;
const SHELF_GAP = 46;

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildCabinet(width) {
  const g = new THREE.Group();
  const topY = BAY_H + 2;
  const botY = shelves[shelves.length - 1].y - 6;
  const innerH = topY - botY;

  if (!backerMat.map) {
    const boardVs = shelves.map((s) => (s.y - botY) / innerH);
    backerMat.map = backAOTexture(boardVs);
    backerMat.needsUpdate = true;
  }

  const back = box(width, innerH, 1.4, backerMat);
  back.position.set(0, botY + innerH / 2, -SHELF_D / 2 + 0.7);
  g.add(back);

  shelves.forEach((s) => {
    const board = box(width, BOARD_T, SHELF_D, woodMat);
    board.position.set(0, s.y - BOARD_T / 2, 0);
    g.add(board);
    const lip = box(width, 1.0, 1.2, woodEdge);
    lip.position.set(0, s.y - BOARD_T + 0.35, SHELF_D / 2 - 0.5);
    g.add(lip);
  });

  const crown = box(width, BOARD_T, SHELF_D, woodMat);
  crown.position.set(0, topY + BOARD_T / 2, 0);
  g.add(crown);
  const plinth = box(width, 4, SHELF_D * 0.92, woodEdge);
  plinth.position.set(0, botY - 2, 0);
  g.add(plinth);

  [-1, 1].forEach((s) => {
    const side = box(3, innerH + BOARD_T * 2, SHELF_D, woodEdge);
    side.position.set(s * (width / 2 + 1.5), botY + innerH / 2, 0);
    g.add(side);
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

function addGames(shelf, list) {
  let x = LEAD_IN;
  list.forEach((g, i) => {
    const h = 24, w = 17, d = 2.6;
    const sleeveCol = ["#4a3f36", "#3d4750", "#4a3a3a", "#3f4a42", "#4a4436"][i % 5];
    const edge = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.4 });
    const front = new THREE.MeshStandardMaterial({ map: sleeveTexture(g, sleeveCol), roughness: 0.3 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [edge, edge, edge, edge, front, edge]);
    mesh.castShadow = true; mesh.receiveShadow = true;

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(g.capsule, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropy;
      front.map = t; front.needsUpdate = true;
      wake(); // same reason as the book cover load below: the loop may
              // already have settled and stopped by the time this lands
    }, undefined, () => {});

    x += w / 2;
    mesh.position.set(x, h / 2, -3);
    x += w / 2 + 1.6;

    // the case's face already points at the camera at rest, so the
    // showcase pose only pops it forward — no rotation needed
    registerShow(mesh, {
      pos: new THREE.Vector3(mesh.position.x, shelf.mid, mesh.position.z + 16),
      rot: new THREE.Euler(0, 0, 0)
    });

    // merge onto the userData registerShow() just wrote, rather than
    // replacing it — a plain `=` here silently discarded showPos and
    // showQuat, which is what was crashing tick() on the games shelf
    // (each affected item threw and, before tick() was hardened to
    // survive a single bad frame, killed the render loop outright)
    Object.assign(mesh.userData, {
      kind: "game", title: g.name,
      sub: g.hours + " hours played · last opened " + g.lastPlayed,
      note: ""
    });
    register(shelf, mesh);
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

function roundedSlab(w, h, d, r, mat) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d, bevelEnabled: true, bevelThickness: 0.34,
    bevelSize: 0.34, bevelSegments: 4, curveSegments: 16
  });
  geo.center();
  const m = new THREE.Mesh(geo, mat);
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
  }
  obj.userData.poseTarget = 1;
  fadeLit(obj, 1);
  if (instant || reduceMotion.matches) obj.userData.poseT = 1;
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

function nearestOnShelf(si) {
  const targetX = focusOffset() - travel.x;
  const items = shelves[si].items;
  let best = 0, bestD = Infinity;
  items.forEach((o, i) => {
    const d = Math.abs(o.position.x - targetX);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
function nearestShelf() {
  let best = 0, bestD = Infinity;
  shelves.forEach((s, i) => {
    const d = Math.abs(shelfTy(i) - travel.y);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();

function pickAt(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.x = ((cx - r.left) / r.width) * 2 - 1;
  ptr.y = -((cy - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(pickable, true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o && !o.userData.kind) o = o.parent;
  return o || null;
}

let dragging = false, dragAxis = null;
let startClientX = 0, startClientY = 0, startTx = 0, startTy = 0;
let movedX = 0, movedY = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  dragAxis = null;
  movedX = movedY = 0;
  startClientX = e.clientX; startClientY = e.clientY;
  startTx = travel.tx; startTy = travel.ty;
  canvas.setPointerCapture(e.pointerId);
  wake();
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - startClientX, dy = e.clientY - startClientY;
  movedX = Math.abs(dx); movedY = Math.abs(dy);

  // the gesture commits to one axis the first time it clears a small
  // deadzone, so a slightly diagonal swipe doesn't fight itself
  if (!dragAxis && (movedX > 6 || movedY > 6)) {
    dragAxis = movedY > movedX * 1.3 ? "y" : "x";
  }
  if (dragAxis === "x") {
    const maxDrag = 300;
    travel.tx = startTx + Math.max(-maxDrag, Math.min(dx, maxDrag));
  } else if (dragAxis === "y") {
    const min = shelfTy(0), max = shelfTy(shelves.length - 1);
    const target = startTy - dy;
    // wrap-around: dragging up past top goes to bottom, dragging down past bottom goes to top
    if (target > min) {
      travel.ty = max;
    } else if (target < max) {
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
    // a real click/tap: jump straight to whatever is under the pointer
    const hit = pickAt(e.clientX, e.clientY);
    if (!hit || hit === current()) return;
    const si = shelves.indexOf(hit.userData.shelf);
    select(si, hit.userData.shelf.items.indexOf(hit));
    return;
  }
  // the gesture ended mid-slide: land on whatever is nearest the focus
  if (dragAxis === "y") select(nearestShelf(), curIndex);
  else select(curShelf, nearestOnShelf(curShelf));
});

/* A real browser can interrupt a gesture (a touch scroll conflict, the
   OS stealing focus) without ever firing pointerup. Without this, the
   pointer stays "captured" in our own bookkeeping and the rig can be
   left stranded off its snap point until another full gesture starts. */
canvas.addEventListener("pointercancel", (e) => {
  if (!dragging) return;
  dragging = false;
  if (movedX >= 6 || movedY >= 6) {
    if (dragAxis === "y") select(nearestShelf(), curIndex);
    else select(curShelf, nearestOnShelf(curShelf));
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
      if (Math.abs(travelDx) < TRAVEL_EPS && Math.abs(travelDy) < TRAVEL_EPS) {
        travel.x = travel.tx; travel.y = travel.ty;
      } else {
        settled = false;
        travel.x += travelDx * kTravel;
        travel.y += travelDy * kTravel;
      }
      rig.position.set(travel.x, travel.y, 0);

      pickable.forEach((o) => {
        const u = o.userData;
        if (Math.abs(u.poseTarget - u.poseT) < POSE_EPS) {
          u.poseT = u.poseTarget;
          // fully at rest: pin exactly, so float error never creeps in
          if (u.poseT === 0) { o.position.copy(u.home); o.quaternion.copy(u.homeQuat); }
          else { o.position.copy(u.showPos); o.quaternion.copy(u.showQuat); }
          return;
        }
        settled = false;
        u.poseT += (u.poseTarget - u.poseT) * kPose;
        _pos.lerpVectors(u.home, u.showPos, u.poseT);
        _quat.slerpQuaternions(u.homeQuat, u.showQuat, u.poseT);
        o.position.copy(_pos);
        o.quaternion.copy(_quat);
      });

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
