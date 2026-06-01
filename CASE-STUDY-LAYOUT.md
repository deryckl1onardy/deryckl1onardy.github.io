# Case Study Layout System

This document defines the shared layout, components, and CSS conventions for all case study pages in this portfolio. Follow this exactly when creating new case study pages to ensure visual consistency on both desktop and mobile.

---

## File Structure

Every case study page uses this set of files:

```
[page-name].html          ← page markup
[page-name].css           ← page-specific overrides (imports dana-wallet-v3.css first)
[page-name].js            ← scroll-spy + intro scale logic (copy from onboarding-registration.js)
dana-wallet-v3.css        ← shared base styles (DO NOT edit per-page)
footer.css / footer.js    ← shared footer
page-transition.css / page-transition.js ← shared page transitions
```

---

## HTML Shell

Every case study page must follow this exact structure:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>[Case Study Title] | Derrick Portfolio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@600&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="dana-wallet-v3.css?v=3" />
    <link rel="stylesheet" href="[page-name].css?v=3" />
    <link rel="stylesheet" href="footer.css" />
    <link rel="stylesheet" href="page-transition.css" />
    <script src="page-transition.js" defer></script>
    <script src="footer.js" defer></script>
  </head>
  <body class="[page-slug]-page">
    <div class="case-page">

      <!-- NAV -->
      <header class="case-header">
        <nav class="pill-nav" aria-label="Primary">
          <a class="nav-link" href="index.html#home">Home</a>
          <a class="nav-link is-active" href="index.html#work">Work</a>
          <a class="nav-link" href="about.html">About</a>
        </nav>
      </header>

      <!-- INTRO HERO -->
      <section class="intro" id="summary">
        <div class="intro-stage">
          <!-- page-specific hero images go here -->
          <div class="intro-copy">
            <h1>[Title]</h1>
            <p>[One-sentence description]</p>
            <p class="intro-tags">
              <span>[Category]</span>
              <span aria-hidden="true">&bull;</span>
              <span>[Year]</span>
              <span aria-hidden="true">&bull;</span>
              <span>[Platform]</span>
            </p>
            <a class="prototype-btn" href="[figma-url]" target="_blank" rel="noopener noreferrer">View Prototype</a>
          </div>
        </div>
      </section>

      <!-- STUDY SHELL -->
      <div class="study-shell">

        <!-- SIDEBAR NAV -->
        <aside class="overview-card" id="overview-sidebar">
          <h2>Overview</h2>
          <div class="overview-divider"></div>
          <a class="overview-link is-active" data-target="[section-id]" href="#[section-id]">[Section Name]</a>
          <!-- repeat for each section -->
        </aside>

        <!-- MAIN CONTENT -->
        <main class="study-main">
          <section class="study-section" id="[section-id]">
            <h2>[Section Heading]</h2>
            <p>[Content]</p>
          </section>
          <!-- repeat sections -->
        </main>

      </div><!-- /.study-shell -->
    </div><!-- /.case-page -->

    <!-- FOOTER (copy exactly from any existing page) -->
    <footer class="site-footer">...</footer>

    <script src="[page-name].js"></script>
  </body>
</html>
```

**Nav rules:**
- Always: Home / Work / About — never change these labels
- `is-active` is always on Work for case study pages

---

## Desktop Layout (≥960px)

### Intro Hero
- Container: `section.intro` — full viewport width, `height: 442px`, `overflow: hidden`
- Inner: `div.intro-stage` — `width: 1440px`, scaled by JS to fit the viewport
- The JS in `[page-name].js` handles scaling: `scale = viewport / 1440`, centered with `translateX`
- Phone/device image: `position: absolute` inside `.intro-stage`
- Copy block: `position: absolute; left: ~630px; top: ~75px; width: 762px` inside `.intro-stage`
- All pixel values inside `.intro-stage` assume 1440px canvas — design at 1440, the JS handles scaling

### Study Shell
- `div.study-shell`: `display: grid; grid-template-columns: 265px minmax(0, 1059px); gap: 24px`
- Left: `aside.overview-card` — sticky sidebar with section links
- Right: `main.study-main` — `display: grid; gap: 56px` (one grid cell per section)

### Typography (desktop)
- `h1` in intro: `64px`, weight 700
- `h2` in sections: `clamp(36px, 4.6vw, 48px)`, weight 700
- `h3` in sections: `clamp(28px, 3vw, 32px)`
- Body paragraphs: `clamp(14px, 1.9vw, 18px)`, color `#373737`
- Sidebar links: `24px`, weight 300; active: weight 400, green-left-border `#99bba1`

---

## Mobile Layout (≤960px)

### Intro Hero — CRITICAL RULE
The JS clears the scale transform at ≤980px. This means `.intro-stage` reverts to its natural DOM flow. Every page-specific CSS **must** override the intro at ≤960px:

```css
@media (max-width: 960px) {
  /* intro becomes a normal block, not scaled */
  .intro {
    height: auto;
    overflow: hidden;
    padding: 16px 16px 0;
  }

  .[page]-page .intro-stage {
    position: relative;
    width: 100%;
    height: auto;
    transform: none !important;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }

  /* copy comes first (order: 1), image comes second (order: 2) */
  .[page]-page .intro-copy {
    order: 1;
    position: relative;
    left: auto; top: auto;
    width: 100%;
  }

  /* any absolutely-positioned image inside intro-stage must become relative.
     Use object-fit: cover + object-position to clip to the phone area of
     the composite image — do NOT use object-fit: contain (shows full image). */
  .[page]-page .intro-[image-element] {
    position: relative;
    order: 2;
    width: min(280px, 75vw);
    height: 230px;
    left: auto; top: auto;
    margin: 8px auto 0;
    object-fit: cover;
    object-position: left center;
    border-radius: 16px;
  }
}
```

**If you skip this, the image will float over the title text on mobile. Always add it.**

### Study Shell (mobile)
Handled by `dana-wallet-v3.css` automatically at ≤960px:
- Shell collapses to single column
- Sidebar becomes a horizontal grid of links (2-col at ≤640px)
- Active link shows green underline instead of green left border

### Content grids (collapse to 1 column at ≤960px)
All multi-column content grids must collapse on mobile. Add to `@media (max-width: 960px)` in your page CSS:

```css
.your-card-row   { flex-direction: column; }
.your-two-col    { grid-template-columns: 1fr; }
.your-three-col  { grid-template-columns: 1fr; }
.your-six-col    { grid-template-columns: repeat(3, 1fr); }  /* half at tablet */
```

At `≤640px`, `.your-six-col` → `repeat(2, 1fr)`.

---

## Shared Components

### Prototype Button
```html
<a class="prototype-btn" href="[url]" target="_blank" rel="noopener noreferrer">View Prototype</a>
```
Base CSS in `dana-wallet-v3.css`. At ≤640px add `width: 100%` override in page CSS.

### Image Panel (gray or blue background container)
```html
<div class="ob-img-panel ob-img-panel--gray ob-img-panel--3">
  <div class="ob-img-panel__col">
    <img src="..." alt="..." />
    <p>Caption</p>
  </div>
</div>
```
Modifiers: `--gray` (#d6d6d6), `--blue` (#d3e6ee), `--3` (3-col grid), `--6` (6-col grid).

### Blockquote
```html
<blockquote class="ob-blockquote">
  <span class="ob-bq-open">"</span>
  <p>Quote text</p>
  <span class="ob-bq-close">"</span>
</blockquote>
<p class="ob-bq-source">— Attribution</p>
```

### Card
```html
<div class="ob-card-row">
  <div class="ob-card">
    <h3>Heading</h3>
    <p>Body</p>
  </div>
  <div class="ob-card">...</div>
</div>
```
Single card: `<div class="ob-card">` directly (no row wrapper).

### Timeline Grid (2-col, collapses to 1-col on mobile)
```html
<div class="ob-timeline-grid">
  <div class="ob-timeline-item">
    <p class="ob-timeline-date">Month Year</p>
    <h3>Study Title</h3>
    <p>Description</p>
  </div>
  <!-- last item spanning both cols: add class ob-timeline-full -->
</div>
```

### Insight Grid (2-col, collapses to 1-col on mobile)
```html
<div class="ob-insight-grid">
  <div class="ob-insight">
    <h3>Finding</h3>
    <p>Explanation</p>
    <div class="ob-insight-stat">Stat callout</div>
  </div>
</div>
```

---

## JavaScript (scroll-spy + intro scale)

Copy `onboarding-registration.js` verbatim and rename. It handles:
1. Sidebar link highlighting as user scrolls
2. Intro stage CSS scale (`viewport / 1440`) at desktop, cleared at ≤980px

The JS clears the transform at `max-width: 980px` — your CSS mobile override must kick in at `960px` (matches the CSS breakpoints above).

---

## Colors & Tokens

```css
--bg: #dddddd;           /* page background */
--text: #202020;
--muted: #3f3f3f;
--panel: #e9e9e9;        /* card/sidebar fill */
--panel-border: #e1e1e1;
--panel-shadow: 0 12px 16px rgba(0,0,0,0.04);
--stroke: #c1c1c1;
```

Accent green (sidebar active, overview underline): `#99bba1`
Link blue (timeline dates): `#108ee9`

---

## Checklist for a New Case Study Page

- [ ] `<body class="[slug]-page">` unique class for scoping overrides
- [ ] Nav: Home / Work / **About** (never "Contact")
- [ ] `is-active` on Work nav link
- [ ] Intro stage: desktop positions absolute inside 1440px canvas
- [ ] Intro stage: ≤960px mobile override added in page CSS (copy pattern above)
- [ ] Copy block: `order: 1` on mobile, image/media: `order: 2`
- [ ] All multi-column grids collapse to 1-col at ≤960px
- [ ] `prototype-btn` full-width at ≤640px
- [ ] Footer copied exactly from an existing page
- [ ] JS file copied from `onboarding-registration.js` and renamed
- [ ] Both CSS and JS loaded in `<head>` / before `</body>`
