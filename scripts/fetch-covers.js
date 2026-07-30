#!/usr/bin/env node
/* ============================================================
   THE CAVE — BOOK COVER FETCH
   Pulls cover art from Open Library into assets/cave/books/ and
   writes an index the shelf reads at runtime.

     node scripts/fetch-covers.js

   Re-run it any time you add books to cave/catalog.js. Files that
   already exist are left alone, so it is cheap to run again.

   Open Library is a best-effort match on title + author. Some of
   these are game artbooks and licensed tie-ins that simply are not
   catalogued there; those keep their procedural cloth cover, which
   is the same graceful-degradation the reference shelf uses.

   To override any cover by hand, drop your own image at
   assets/cave/books/<slug>.jpg — the slug is printed below, and a
   file you supply is never overwritten.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "assets", "cave", "books");

/* read the catalog without a bundler: it just assigns to window */
function loadCatalog() {
  const src = fs.readFileSync(path.join(ROOT, "cave", "catalog.js"), "utf8");
  const win = {};
  new Function("window", src)(win);
  return win.CAVE_CATALOG;
}

const slugify = (s) =>
  s.toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findCover(book) {
  const q = encodeURIComponent(book.title + " " + book.author);
  const url =
    "https://openlibrary.org/search.json?q=" + q +
    "&limit=5&fields=title,author_name,cover_i";
  const res = await fetch(url, { headers: { "User-Agent": "cave-shelf" } });
  if (!res.ok) throw new Error("search HTTP " + res.status);
  const data = await res.json();
  const hit = (data.docs || []).find((d) => d.cover_i);
  return hit ? { id: hit.cover_i, matched: hit.title } : null;
}

(async function () {
  const cat = loadCatalog();
  fs.mkdirSync(OUT, { recursive: true });

  const index = {};
  let got = 0, kept = 0, missed = 0;

  for (const book of cat.books) {
    const slug = slugify(book.title);
    const file = slug + ".jpg";
    const dest = path.join(OUT, file);

    if (fs.existsSync(dest)) {
      index[slug] = file;
      kept++;
      console.log("keep   " + slug);
      continue;
    }

    try {
      const found = await findCover(book);
      if (!found) {
        missed++;
        // written explicitly as null (not just left out) so the index
        // file itself shows you, at a glance, which books still need
        // a cover — an absent key looks identical to "not checked yet"
        index[slug] = null;
        console.log("miss   " + slug + "   (no cover in Open Library)");
        await sleep(250);
        continue;
      }

      const img = await fetch(
        "https://covers.openlibrary.org/b/id/" + found.id + "-L.jpg"
      );
      if (!img.ok) throw new Error("cover HTTP " + img.status);
      const buf = Buffer.from(await img.arrayBuffer());

      // Open Library answers a missing cover with a tiny 1x1 placeholder
      if (buf.length < 2500) {
        missed++;
        index[slug] = null;
        console.log("miss   " + slug + "   (placeholder image)");
        await sleep(250);
        continue;
      }

      fs.writeFileSync(dest, buf);
      index[slug] = file;
      got++;
      console.log(
        "get    " + slug + "   <- " + found.matched +
        (found.matched.toLowerCase() !== book.title.toLowerCase()
          ? "   ** loose match, check this one **" : "")
      );
    } catch (err) {
      missed++;
      index[slug] = null;
      console.log("fail   " + slug + "   " + err.message);
    }
    await sleep(250);
  }

  fs.writeFileSync(
    path.join(OUT, "index.json"),
    JSON.stringify(index, null, 2) + "\n"
  );

  console.log(
    "\n" + got + " fetched, " + kept + " already present, " + missed +
    " without art (procedural cover).\n" +
    "Drop your own at assets/cave/books/<slug>.jpg to override any of them."
  );
})();
