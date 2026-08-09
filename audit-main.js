/* ============================================================
   DERRICK LIONARDY — PORTFOLIO INTERACTIONS
   All physical metaphors driven here: shared-element tape morphs
   between pages, spring-lerped parallax tilt, spinning reels,
   the mouse-tracking face, the cassette player, the chat panel.
   ============================================================ */
(function () {
  "use strict";
  // Content must be visible by default. .reveal (and a few other scroll-
  // triggered bits) start hidden in CSS ONLY when this class is present —
  // set here, synchronously, before anything else runs — so a blocked or
  // erroring script never leaves a whole section stuck at opacity:0 with
  // nothing left to reveal it. See the "html.js .reveal" rule in
  // audit-styles.css.
  document.documentElement.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasVT = typeof CSS !== "undefined" && CSS.supports && CSS.supports("view-transition-name: none");

  /* ---------- SHARED-ELEMENT TAPE MORPHS (cross-document) ----------
     Each cassette on the wall is paired with the hero cassette of the
     page it links to via a matching view-transition-name, so the tape
     physically flies off the wall into the case study — and back. */
  (function () {
    function slug(s) { return (s || "").split("#")[0].replace(/\.html$/, "").replace(/\/+$/, "").split("/").pop().replace(/[^a-z0-9-]/gi, ""); }
    document.querySelectorAll("a.mixtape[href]").forEach(function (a) {
      var s = slug(a.getAttribute("href"));
      var shell = a.querySelector(".mixtape__shell");
      if (s && shell) shell.style.viewTransitionName = "tape-" + s;
    });
    var here = slug(location.pathname.split("/").pop() || "index");
    var cs = document.querySelector(".cs-tape .mixtape__shell");
    if (cs && here) cs.style.viewTransitionName = "tape-" + here;
  })();
  // When arriving via a view transition, the morph IS the entrance —
  // suppress the default page fade so the two never fight.
  window.addEventListener("pagereveal", function (e) {
    if (e.viewTransition) document.documentElement.classList.add("vt-in");
  });

  /* ---------- NAV: mark current page ---------- */
  (function () {
    var pathParts = location.pathname.split("/").filter(function(p) { return p.length > 0; });
    var currentPage = pathParts[pathParts.length - 1] || "";
    document.querySelectorAll(".nav__link").forEach(function (a) {
      var href = (a.getAttribute("href") || "").split("#")[0].replace(/\/$/, "");
      var hrefParts = href.split("/").filter(function(p) { return p.length > 0; });
      var hrefPage = hrefParts[hrefParts.length - 1] || "";
      var isActive = (href === "/" && currentPage === "") || (href === currentPage) || (hrefPage === currentPage && hrefPage !== "");
      if (isActive) {
        if (!a.dataset.section) a.classList.add("is-active");
      }
    });
  })();

  /* ---------- PAGE TRANSITIONS (fallback for non-VT browsers) ---------- */
  var page = document.querySelector(".page");
  if (!hasVT) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a || reduce) return;
      var href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto") ||
          a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      if (page) page.classList.add("is-leaving");
      setTimeout(function () { location.href = href; }, 165);
    });
  }

  /* ---------- SCROLL REVEAL ---------- */
  (function () {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- CASSETTES: SPRING TILT + REEL INERTIA ---------- */
  (function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll(".mixtape"));
    if (!cards.length) return;

    // Build a real cassette drive hub: through the shell opening you see a
    // cream plastic toothed ring (the part the player's spindle grips) on a
    // dark recess — NOT the tape pack. Matches actual cassette anatomy.
    function reelArt() {
      var teeth = "";
      for (var i = 0; i < 6; i++) {
        teeth += '<rect x="46.4" y="20.5" width="7.2" height="12" rx="2.4" fill="#e9e5da" transform="rotate(' + (i * 60) + ' 50 50)"/>';
      }
      return '<svg class="reel__art" viewBox="0 0 100 100" aria-hidden="true">'
        + '<circle cx="50" cy="50" r="49.5" fill="#080605"/>'
        + '<circle cx="50" cy="50" r="45.5" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.6"/>'
        + '<circle cx="50" cy="50" r="36" fill="none" stroke="#e9e5da" stroke-width="13"/>'
        + '<circle cx="50" cy="50" r="42.8" fill="none" stroke="rgba(0,0,0,0.38)" stroke-width="1.6"/>'
        + '<circle cx="50" cy="50" r="29.4" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.2"/>'
        + teeth
        + '<circle cx="50" cy="50" r="17.5" fill="#0d0a08"/>'
        + "</svg>";
    }

    cards.forEach(function (card) {
      var shell = card.querySelector(".mixtape__shell");
      // Case-study hero tapes play on their own (CSS keyframes drive them).
      if (card.classList.contains("cs-tape")) card.setAttribute("data-idle", "");
      var state = {
        shell: shell,
        cssSpin: card.hasAttribute("data-idle"),
        spin: false, vel: 0,
        rotL: Math.random() * 360, rotR: Math.random() * 360,
        x: 0, y: 0, tx: 0, ty: 0
      };
      card._cs = state;
      var reelL = card.querySelector(".reel--left");
      var reelR = card.querySelector(".reel--right");
      if (reelL && !reelL.querySelector("svg")) reelL.insertAdjacentHTML("beforeend", reelArt(true));
      if (reelR && !reelR.querySelector("svg")) reelR.insertAdjacentHTML("beforeend", reelArt(false));
      state.reelL = reelL; state.reelR = reelR;

      if (!reduce) {
        card.addEventListener("pointermove", function (e) {
          var r = shell.getBoundingClientRect();
          state.tx = (e.clientX - r.left) / r.width - 0.5;   // -0.5..0.5
          state.ty = (e.clientY - r.top) / r.height - 0.5;
          kick();
        });
        card.addEventListener("pointerenter", function () { state.spin = true; kick(); });
        card.addEventListener("pointerleave", function () {
          state.spin = false; state.tx = 0; state.ty = 0; kick();
        });
      }
    });

    // The recorder card isn't a tape (no href, no tilt physics) but its
    // cassette door uses the exact same drive-hub reels the tapes do —
    // it should look like it belongs to the same set, not a lesser
    // hand-drawn cousin of them. CSS spins them on its own (see
    // .recorder .reel--left/right); this just needs to draw the hubs.
    document.querySelectorAll(".recorder .reel--left, .recorder .reel--right").forEach(function (reel) {
      if (!reel.querySelector("svg")) reel.insertAdjacentHTML("beforeend", reelArt());
    });

    // will-change is only worth its GPU-layer cost while the shared loop
    // is actually running — set once when it wakes, cleared once every
    // card has settled back to rest, not left standing on nine idle
    // shells + reels for the rest of the page's life.
    function setWillChange(on) {
      cards.forEach(function (card) {
        var s = card._cs, v = on ? "transform" : "";
        s.shell.style.willChange = v;
        if (s.reelL) s.reelL.style.willChange = v;
        if (s.reelR) s.reelR.style.willChange = v;
      });
    }

    // One shared rAF loop, alive only while something is moving.
    // The tilt is lerped toward the pointer every frame (no CSS transition
    // fighting the input = zero judder), and the reels carry inertia.
    var running = false;
    function frame() {
      var active = false;
      cards.forEach(function (card) {
        var s = card._cs;

        // tilt spring
        var dx = s.tx - s.x, dy = s.ty - s.y;
        if (Math.abs(dx) > 0.0004 || Math.abs(dy) > 0.0004) {
          s.x += dx * 0.16; s.y += dy * 0.16; active = true;
          var st = s.shell.style;
          st.setProperty("--ry", (s.x * 14).toFixed(2) + "deg");
          st.setProperty("--rx", (-s.y * 14).toFixed(2) + "deg");
          st.setProperty("--px-near", (s.x * 10).toFixed(1) + "px");
          st.setProperty("--py-near", (s.y * 10).toFixed(1) + "px");
          st.setProperty("--px-mid", (s.x * 6).toFixed(1) + "px");
          st.setProperty("--py-mid", (s.y * 6).toFixed(1) + "px");
          st.setProperty("--px-far", (s.x * -4).toFixed(1) + "px");
          st.setProperty("--py-far", (s.y * -4).toFixed(1) + "px");
        }

        // reel inertia — the take-up reel (less tape) spins faster
        if (!s.cssSpin) {
          var target = s.spin ? 1 : 0;
          s.vel += (target - s.vel) * 0.08;
          if (s.spin || s.vel > 0.001) {
            active = true;
            s.rotL = (s.rotL + s.vel * 4.2) % 360;
            s.rotR = (s.rotR + s.vel * 6.1) % 360;
            if (s.reelL) s.reelL.style.setProperty("--reel-rot", s.rotL.toFixed(1) + "deg");
            if (s.reelR) s.reelR.style.setProperty("--reel-rot", s.rotR.toFixed(1) + "deg");
          }
        }
      });
      if (active) { requestAnimationFrame(frame); } else { running = false; setWillChange(false); }
    }
    function kick() { if (!running && !reduce) { running = true; setWillChange(true); requestAnimationFrame(frame); } }
  })();

  /* ---------- ANIMATED AVATAR ---------- */
  (function () {
    var av = document.querySelector(".avatar");
    if (!av) return;
    var pupils = av.querySelector(".avatar-pupils");

    if (!reduce) {
      window.addEventListener("pointermove", function (e) {
        var r = av.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
        var dy = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
        av.style.setProperty("--avatar-x", (dx * 4.2).toFixed(2) + "px");
        av.style.setProperty("--avatar-y", (dy * 4.2).toFixed(2) + "px");
      });
      // blink
      function blink() {
        if (pupils) {
          pupils.classList.add("is-blinking");
          setTimeout(function () { pupils.classList.remove("is-blinking"); }, 130);
        }
        setTimeout(blink, 2600 + Math.random() * 3600);
      }
      setTimeout(blink, 2400);
    }
  })();

  /* ---------- THE DECK — portable cassette player ---------- */
  (function () {
    var deck = document.querySelector(".deck");
    if (!deck) return;
    var tracks = [
      { t: "Boring Things, Made Magical", a: "Derrick Lionardy · designing payments since 2018", d: 228 },
      { t: "Designing for Trust", a: "DANA Sessions · B-side", d: 252 },
      { t: "Jakarta, 2 AM", a: "Late Night Figma", d: 201 },
      { t: "Ship It (demo take)", a: "Derrick Lionardy", d: 175 }
    ];
    var i = 0, pos = 0, playing = false, timer = null, dragging = false;
    var elTitle = deck.querySelector(".lcd__title");
    var elArtist = deck.querySelector(".lcd__artist");
    var fill = deck.querySelector(".seek__fill");
    var thumb = deck.querySelector(".seek__thumb");
    var bar = deck.querySelector(".seek");
    var cur = deck.querySelector(".t-cur");
    var dur = deck.querySelector(".t-dur");
    var btnPlay = deck.querySelector('[data-act="play"]');
    var btnPrev = deck.querySelector('[data-act="prev"]');
    var btnNext = deck.querySelector('[data-act="next"]');
    var btnStop = deck.querySelector('[data-act="stop"]');

    function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
    function render() {
      var tr = tracks[i];
      elTitle.textContent = tr.t; elArtist.textContent = tr.a;
      var pct = Math.min(100, (pos / tr.d) * 100);
      fill.style.width = pct + "%"; if (thumb) thumb.style.left = pct + "%";
      cur.textContent = fmt(pos); dur.textContent = fmt(tr.d);
      if (bar) bar.setAttribute("aria-valuenow", Math.round(pos));
    }
    function tick() { if (playing && !dragging) { pos += 1; if (pos >= tracks[i].d) { next(); } render(); } }
    function play() { playing = true; deck.classList.add("is-playing"); if (btnPlay) btnPlay.setAttribute("aria-label", "Pause"); if (!timer) timer = setInterval(tick, 1000); }
    function pause() { playing = false; deck.classList.remove("is-playing"); if (btnPlay) btnPlay.setAttribute("aria-label", "Play"); }
    function toggle() { playing ? pause() : play(); }
    function next() { i = (i + 1) % tracks.length; pos = 0; render(); }
    function prev() { if (pos > 3) { pos = 0; } else { i = (i - 1 + tracks.length) % tracks.length; pos = 0; } render(); }
    function stop() { pause(); pos = 0; render(); }

    if (btnPlay) btnPlay.addEventListener("click", toggle);
    if (btnNext) btnNext.addEventListener("click", next);
    if (btnPrev) btnPrev.addEventListener("click", prev);
    if (btnStop) btnStop.addEventListener("click", stop);

    function seek(clientX) {
      var r = bar.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      pos = p * tracks[i].d; render();
    }
    if (bar) {
      bar.addEventListener("pointerdown", function (e) { dragging = true; bar.setPointerCapture(e.pointerId); seek(e.clientX); });
      bar.addEventListener("pointermove", function (e) { if (dragging) seek(e.clientX); });
      bar.addEventListener("pointerup", function () { dragging = false; });
      bar.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { pos = Math.min(tracks[i].d, pos + 5); render(); }
        else if (e.key === "ArrowLeft") { pos = Math.max(0, pos - 5); render(); }
      });
    }
    render();
    // start spinning on load — the centerpiece should feel alive
    play();
  })();

  /* ---------- POLAROID WALL — free drag with physical tilt ---------- */
  (function () {
    var wall = document.querySelector(".pwall");
    if (!wall) return;
    var pols = Array.prototype.slice.call(wall.querySelectorAll(".pol"));
    if (!pols.length) return;

    // scatter: xr = left as a ratio of the free width, y = px from top, r = resting tilt
    var scatter = [
      { xr: 0.02, y: 8,   r: -5 },
      { xr: 0.37, y: 2,   r: 3  },
      { xr: 0.66, y: 10,  r: -2 },
      { xr: 0.16, y: 318, r: 4  },
      { xr: 0.50, y: 312, r: -5 },
      { xr: 0.80, y: 322, r: 3  },
      { xr: 0.04, y: 628, r: 6  },
      { xr: 0.42, y: 622, r: -4 },
      { xr: 0.71, y: 632, r: 2  }
    ];
    var DRAG_THRESHOLD = 8;
    var zTop = 10, raf = null, animating = false, lastFrameT = null;
    var active = null, pending = null, sx = 0, sy = 0, ox = 0, oy = 0, lastX = 0, vx = 0;
    var velSamples = []; // {x, y, t} — a short window for a real release velocity

    /* Soft boundary instead of a hard stop: the further past the edge the
       drag goes, the less of the extra distance actually gets through.
       Same formula/constant as cave/shelf-engine.js and image-lightbox.js
       so every drag surface in this pass feels like one house style. */
    function rubberband(overshoot, dimension, constant) {
      constant = constant || 0.55;
      if (dimension <= 0) return 0;
      return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
    }
    function withRubberband(value, min, max, dimension) {
      if (value > max) return max + rubberband(value - max, dimension, 0.55);
      if (value < min) return min - rubberband(min - value, dimension, 0.55);
      return value;
    }
    // Apple's exponential-decay momentum projection (Designing Fluid
    // Interfaces, WWDC 2018) — where a flick at this velocity would
    // actually coast to a stop, not the physics-textbook v²/(2·decel) form.
    function project(velocity, decelerationRate) {
      decelerationRate = decelerationRate || 0.998;
      return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
    }
    function bounds(p) {
      var W = wall.clientWidth, H = wall.clientHeight, cw = p.offsetWidth, ch = p.offsetHeight;
      return { minX: -cw * 0.45, maxX: W - cw * 0.55, minY: -ch * 0.3, maxY: H - ch * 0.4, W: W, H: H };
    }
    function pushVelSample(x, y, t) {
      velSamples.push({ x: x, y: y, t: t });
      if (velSamples.length > 6) velSamples.shift();
    }
    // px/second, read from the recent samples rather than just the last
    // two points — one stalled frame right at release shouldn't decide
    // the whole throw.
    function releaseVelocity() {
      if (velSamples.length < 2) return { vx: 0, vy: 0 };
      var first = velSamples[0], last = velSamples[velSamples.length - 1];
      var dt = (last.t - first.t) / 1000;
      if (dt <= 0) return { vx: 0, vy: 0 };
      return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
    }

    function apply(p) {
      p.style.transform = "translate(" + p._x.toFixed(1) + "px," + p._y.toFixed(1) +
        "px) rotate(" + p._rot.toFixed(2) + "deg) scale(" + p._scale.toFixed(3) + ")";
    }
    // will-change is only worth paying for while a photo is actually
    // mid-gesture or still settling — not for nine static prints sitting
    // on the wall the rest of the time.
    function beginMotion(p) { p.style.willChange = "transform"; }
    function endMotionIfSettled(p) {
      if (p === active || p._settlingPos) return;
      if (p._rot !== p._baseRot || p._scale !== 1) return;
      p.style.willChange = "";
    }
    function layout() {
      var W = wall.clientWidth;
      pols.forEach(function (p, i) {
        if (p._dragged) return;
        var s = scatter[i] || { xr: 0.5, y: i * 130, r: 0 };
        p._x = s.xr * Math.max(0, W - p.offsetWidth);
        p._y = s.y; p._rot = s.r; p._baseRot = s.r; p._scale = 1;
        p.style.zIndex = i + 1;
        apply(p);
      });
    }
    pols.forEach(function (p) {
      p._x = 0; p._y = 0; p._rot = 0; p._baseRot = 0; p._scale = 1;
      p._settlingPos = false; p._tx = 0; p._ty = 0; p._velX = 0; p._velY = 0;
    });
    layout();
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(layout, 120); });

    // Critically-damped spring constants for the post-release position
    // settle — same values as image-lightbox.js's springTo, so a flung
    // photo and a flung zoomed photo decelerate with the same feel.
    var SPRING_K = 210, SPRING_D = 28;

    function startLoop() {
      if (animating || reduce) return; animating = true; lastFrameT = null;
      function loop(now) {
        if (lastFrameT === null) lastFrameT = now;
        var dt = Math.min((now - lastFrameT) / 1000, 0.032);
        lastFrameT = now;
        var live = false;
        pols.forEach(function (p) {
          var tRot = (p === active) ? p._baseRot + Math.max(-15, Math.min(15, vx * 1.1)) : p._baseRot;
          var tScale = (p === active) ? 1.05 : 1;
          var dr = tRot - p._rot, ds = tScale - p._scale, changed = false;
          if (Math.abs(dr) > 0.04) { p._rot += dr * 0.2; changed = true; } else if (p._rot !== tRot) { p._rot = tRot; changed = true; }
          if (Math.abs(ds) > 0.002) { p._scale += ds * 0.25; changed = true; } else if (p._scale !== tScale) { p._scale = tScale; changed = true; }

          // Momentum settle: a critically-damped spring (no overshoot,
          // per the apple-design default for a settle rather than a
          // flick) carries the release velocity toward the momentum-
          // projected landing point. Starts from wherever the photo
          // actually IS and whatever velocity it actually has, so a
          // re-grab mid-settle (see down()) redirects it instantly
          // instead of finishing the old animation first.
          if (p._settlingPos) {
            var ax = -SPRING_K * (p._x - p._tx) - SPRING_D * p._velX;
            var ay = -SPRING_K * (p._y - p._ty) - SPRING_D * p._velY;
            p._velX += ax * dt; p._velY += ay * dt;
            p._x += p._velX * dt; p._y += p._velY * dt;
            changed = true;
            var settled = Math.abs(p._x - p._tx) < 0.3 && Math.abs(p._y - p._ty) < 0.3 &&
              Math.abs(p._velX) < 4 && Math.abs(p._velY) < 4;
            if (settled) { p._x = p._tx; p._y = p._ty; p._velX = 0; p._velY = 0; p._settlingPos = false; }
          }

          if (changed) { apply(p); live = true; } else { endMotionIfSettled(p); }
        });
        vx *= 0.82;
        if (active || live || Math.abs(vx) > 0.1) { raf = requestAnimationFrame(loop); } else { animating = false; }
      }
      raf = requestAnimationFrame(loop);
    }

    function down(e) {
      var p = e.currentTarget;
      p.style.zIndex = ++zTop;
      pending = { el: p, id: e.pointerId };
      sx = e.clientX; sy = e.clientY; ox = p._x; oy = p._y; lastX = e.clientX; vx = 0;
      velSamples.length = 0;
      pushVelSample(e.clientX, e.clientY, performance.now());
      // Don't preventDefault yet — wait until we're sure it's a drag, not a scroll
    }
    function commitDrag(e) {
      var p = pending.el;
      active = p; pending = null;
      p._dragged = true;
      // Grabbing a photo that's still coasting home from the last release
      // has to continue from its live on-screen position, not snap to
      // wherever the settle spring was heading — cancel the momentum
      // target outright so this drag starts clean from the real spot.
      p._settlingPos = false;
      p.classList.add("is-grab");
      beginMotion(p);
      try { p.setPointerCapture(e.pointerId); } catch (err) {}
      if (reduce) { p._scale = 1.03; apply(p); } else { startLoop(); }
    }
    function move(e) {
      if (pending && pending.el === e.currentTarget && pending.id === e.pointerId) {
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) commitDrag(e);
      }
      if (!active || active !== e.currentTarget) return;
      e.preventDefault();
      var b = bounds(active);
      var nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
      if (reduce) {
        active._x = Math.max(b.minX, Math.min(b.maxX, nx));
        active._y = Math.max(b.minY, Math.min(b.maxY, ny));
      } else {
        active._x = withRubberband(nx, b.minX, b.maxX, b.W);
        active._y = withRubberband(ny, b.minY, b.maxY, b.H);
      }
      // Position tracks the pointer 1:1 on every move, applied here
      // directly rather than left to piggyback on the shared tilt/scale
      // loop — once that spring converges (tilt settled, scale at 1.05)
      // it stops calling apply() on its own, which would otherwise freeze
      // the photo mid-drag the instant the pointer stops moving in X
      // (e.g. a pure vertical drag, where the tilt's vx input is ~0).
      apply(active);
      vx = e.clientX - lastX; lastX = e.clientX;
      pushVelSample(e.clientX, e.clientY, performance.now());
    }
    function up(e) {
      if (pending && pending.el === e.currentTarget) pending = null;
      if (!active) return;
      var p = active;
      p.classList.remove("is-grab");
      try { p.releasePointerCapture(e.pointerId); } catch (err) {}
      active = null;
      if (reduce) {
        var rb = bounds(p);
        p._scale = 1;
        p._x = Math.max(rb.minX, Math.min(rb.maxX, p._x));
        p._y = Math.max(rb.minY, Math.min(rb.maxY, p._y));
        apply(p);
        p.style.willChange = "";
      } else {
        // Project the release velocity forward (§6) rather than just
        // dropping the photo where the pointer happened to let go, then
        // land it inside the TRUE (non-rubber-banded) bounds — an edge
        // always springs back, a flick across open space keeps coasting.
        var b = bounds(p);
        var rv = releaseVelocity();
        var targetX = Math.max(b.minX, Math.min(b.maxX, p._x + project(rv.vx)));
        var targetY = Math.max(b.minY, Math.min(b.maxY, p._y + project(rv.vy)));
        p._tx = targetX; p._ty = targetY;
        p._velX = rv.vx; p._velY = rv.vy;
        p._settlingPos = !(targetX === p._x && targetY === p._y && Math.abs(rv.vx) < 30 && Math.abs(rv.vy) < 30);
        velSamples.length = 0;
        startLoop();
      }
    }
    pols.forEach(function (p) {
      p.addEventListener("pointerdown", down);
      p.addEventListener("pointermove", move);
      p.addEventListener("pointerup", up);
      p.addEventListener("pointercancel", up);
      p.addEventListener("dragstart", function (e) { e.preventDefault(); });
    });
  })();

  /* ---------- CHAT PANEL ---------- */
  (function () {
    var chat = document.querySelector(".chat");
    if (!chat) return;
    var log = chat.querySelector(".chat__log");
    var input = chat.querySelector(".chat__input");
    var send = chat.querySelector(".chat__send");
    var form = chat.querySelector(".chat__form");

    function bubble(text, who) {
      var b = document.createElement("div");
      b.className = "bubble bubble--" + who;
      b.textContent = text;
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    }
    function reply(text) {
      var typing = document.createElement("div");
      typing.className = "bubble bubble--in bubble--typing";
      typing.innerHTML = "<i></i><i></i><i></i>";
      log.appendChild(typing); log.scrollTop = log.scrollHeight;
      setTimeout(function () { typing.remove(); bubble(text, "in"); }, 900 + Math.random() * 700);
    }
    function answer(msg) {
      var m = msg.toLowerCase();
      if (/hi|hello|hey|halo/.test(m)) return "Hey! Thanks for stopping by 👋";
      if (/hire|job|role|work together|opportunit|freelanc/.test(m)) return "I'd love to chat — drop a line to derrick@lionardy.com and we'll find a time.";
      if (/coffee|matcha|kopi/.test(m)) return "Always. Kopi susu in Jakarta, on me ☕";
      if (/dana|payment|fintech/.test(m)) return "Six years of it! Ask me about wallets, onboarding, or designing for trust.";
      if (/portfolio|case study|project/.test(m)) return "Tap any cassette on the home page — each one is a project.";
      return "Got it! For anything real, derrick@lionardy.com is the fastest way to reach me.";
    }

    input.addEventListener("input", function () { send.classList.toggle("is-active", input.value.trim().length > 0); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      bubble(v, "out");
      input.value = ""; send.classList.remove("is-active");
      reply(answer(v));
    });
  })();

  /* ---------- CASE STUDY TOC ---------- */
  (function () {
    var toc = document.querySelector(".cs-toc");
    if (!toc || !("IntersectionObserver" in window)) return;
    var links = Array.prototype.slice.call(toc.querySelectorAll("a"));
    var map = {};
    links.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var sec = document.getElementById(id);
      if (sec) map[id] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("is-active"); });
          if (map[en.target.id]) map[en.target.id].classList.add("is-active");
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  })();

  /* ---------- INSTANT CAMERA (hero) ----------
     Press the shutter: flash fires, the developed print ejects and slips
     away, a fresh one rolls out of the slot and develops into the portrait
     again. The first print is the live one; every new print is a clone. */
  (function () {
    var cam = document.querySelector(".instax");
    if (!cam) return;
    var body = cam.querySelector(".instax__body");
    var shutter = cam.querySelector(".instax__shutter");
    var first = cam.querySelector(".instax__photo");
    if (!first || !body) return;
    var template = first.cloneNode(true); // pristine, undeveloped master
    var busy = false;

    if (reduce) {
      first.classList.remove("is-developing");
      var milk = first.querySelector(".photo__milk");
      if (milk) milk.style.opacity = "0";
    }

    function shoot() {
      if (busy || reduce) return;
      busy = true;
      cam.classList.add("is-shooting");
      setTimeout(function () { cam.classList.remove("is-shooting"); }, 260);

      var old = cam.querySelector(".instax__photo:not(.is-ejecting)");
      if (old) {
        old.classList.add("is-ejecting");
        setTimeout(function () { old.remove(); }, 660);
      }
      // a fresh print, slightly delayed so the flash reads first
      setTimeout(function () {
        var fresh = template.cloneNode(true);
        cam.insertBefore(fresh, body); // sits behind the opaque body
        void fresh.offsetWidth;        // commit start state
        fresh.classList.add("is-emerging", "is-developing");
        setTimeout(function () { busy = false; }, 900);
      }, 180);
    }

    if (shutter) shutter.addEventListener("click", shoot);
    // clicking anywhere on the camera or photo takes a shot
    cam.addEventListener("pointerdown", function () { shoot(); });
  })();

  /* ---------- LIGHTBOX (click any work image to zoom) ---------- */
  (function () {
    var imgs = document.querySelectorAll(".figure img, .compare__half img, .shot img");
    if (!imgs.length) return;
    var box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Zoomed image");
    var big = document.createElement("img");
    big.alt = "";
    box.appendChild(big);
    document.body.appendChild(box);
    function close() { box.classList.remove("is-open"); document.documentElement.style.overflow = ""; }
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest && t.closest(".lightbox")) { close(); return; }
      if (t.tagName === "IMG" && t.closest(".figure, .compare__half, .shot")) {
        big.src = t.currentSrc || t.src;
        big.alt = t.alt || "";
        box.classList.add("is-open");
        document.documentElement.style.overflow = "hidden";
      }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  })();

  /* ---------- YEAR ---------- */
  document.querySelectorAll(".js-year").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- TAPE CURSOR LABEL ----------
     A spring-lerped pill that follows the pointer and shows
     the project title while hovering any cassette. */
  (function () {
    var tapes = document.querySelectorAll(".mixtape[href]");
    if (!tapes.length || reduce) return;
    var el = document.createElement("div");
    el.className = "tape-cursor";
    document.body.appendChild(el);
    var mx = 0, my = 0, cx = 0, cy = 0, live = false, raf = null;
    function step() {
      cx += (mx - cx) * 0.14;
      cy += (my - cy) * 0.14;
      el.style.translate = cx.toFixed(1) + "px " + (cy - 52).toFixed(1) + "px";
      if (live || Math.abs(mx - cx) > 0.4 || Math.abs(my - cy) > 0.4) {
        raf = requestAnimationFrame(step);
      } else { raf = null; }
    }
    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (!raf) { cx = mx; cy = my; raf = requestAnimationFrame(step); }
    });
    tapes.forEach(function (tape) {
      var titleEl = tape.querySelector(".mixtape__title");
      var label = titleEl ? titleEl.textContent.trim() : "View";
      tape.addEventListener("mouseenter", function () {
        el.textContent = "▸ " + label;
        el.classList.add("is-visible");
        live = true;
        if (!raf) raf = requestAnimationFrame(step);
      });
      tape.addEventListener("mouseleave", function () {
        el.classList.remove("is-visible");
        live = false;
      });
    });
  })();
})();
