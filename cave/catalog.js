/* ============================================================
   THE CAVE — CATALOG
   The only file you need to edit to change what's on the shelf.
   No build step, no imports: just edit and save.
   ============================================================ */

window.CAVE_CATALOG = (function () {
  /* ----------------------------------------------------------
     SPINE CLOTH
     Aged bookbinding cloth under a warm desk lamp. Every colour
     here is desaturated on purpose — these are dyed fabric, not
     screen colours. If you add one, keep it muted or it will
     jump out of the shelf and look wrong next to the cassettes.
     ---------------------------------------------------------- */
  var CLOTH = [
    "#6b4a3f", // chestnut
    "#5d7c70", // the site green
    "#7d3f3a", // oxblood
    "#39434f", // slate navy
    "#8a6a3a", // ochre buckram
    "#4a4a44", // charcoal linen
    "#2f4a45", // deep teal
    "#8c7350", // tan
    "#5a4560", // faded plum
    "#3c5163"  // library blue
  ];

  /* ----------------------------------------------------------
     BOOKS
     Only `title` and `author` are required. Everything else is
     optional and will be derived deterministically from the
     title if you leave it out, so a bare {title, author} entry
     still renders a proper spine.

       title      required
       author     required
       spine      hex; omit to auto-pick from CLOTH above
       height     0.78–1.00, fraction of the bay height.
                  Omit for an auto height. Real shelves are
                  uneven — that unevenness is the whole look.
       thickness  22–52 px. Omit to derive from the title length
                  (longer book, fatter spine) which reads true.
       finish     "cloth" (default) | "matte" | "foil"
                  foil = gold-stamped title, for the nice ones
       lean       true = leans over into the gap beside it
       flat       true = lies flat instead of standing. Put these
                  last — they stack at the end of the row.
     ---------------------------------------------------------- */
  var books = [
    { title: "The Hunger Games Trilogy", author: "Suzanne Collins",
      spine: "#4a4a44", height: 0.82, thickness: 44, finish: "matte",
      note: "The dystopian trilogy read end to end. Still the benchmark for pacing a young-adult series." },

    { title: "Marvel Year by Year", author: "A Visual History",
      spine: "#7d3f3a", height: 1.0, thickness: 52, finish: "foil",
      note: "A chronological doorstop of Marvel history, a year to a spread. Mostly opened at random." },

    { title: "The Art and Making of Hogwarts Legacy", author: "Jody Revenson",
      spine: "#2f4a45", height: 0.97, thickness: 36, finish: "foil",
      note: "Concept art and production design from the game. The environment work is the reason to own it." },

    { title: "Articulating Design Decisions", author: "Tom Greever",
      spine: "#3c5163", height: 0.86, thickness: 24, finish: "matte",
      note: "On explaining design work to the people who have to sign it off. The most directly useful book here." },

    { title: "Ex Machina, Book One", author: "Brian K. Vaughan",
      spine: "#39434f", height: 0.9, thickness: 22, finish: "matte",
      note: "A superhero who quits to become mayor of New York. Politics with the powers turned down." },

    { title: "Valentino Rossi: The Autobiography", author: "Valentino Rossi",
      spine: "#8a6a3a", height: 0.88, thickness: 30,
      note: "Rossi in his own words, from minimoto tracks to MotoGP titles." },

    { title: "World of Warcraft: Dark Riders", author: "Mike Costa",
      spine: "#5a4560", height: 0.93, thickness: 26,
      note: "A Warcraft graphic novel, picked up for the artwork more than the plot." },

    { title: "Black Star", author: "Eric Anthony Glover",
      spine: "#2b2b28", height: 0.87, thickness: 20, finish: "matte",
      note: "Two astronauts stranded on a hostile planet, and only one way home." },

    { title: "Assassin's Creed: The Secret Crusade", author: "Oliver Bowden",
      spine: "#6b4a3f", height: 0.83, thickness: 26, finish: "matte",
      note: "Altair's story retold as a novel, filling the gaps between the games." },

    { title: "Angry Birds: Hatching the Universe", author: "Rovio",
      spine: "#8c5a3a", height: 0.91, thickness: 30,
      note: "How a mobile game became a franchise. More brand study than artbook." },

    { title: "The Art of Madagascar", author: "DreamWorks",
      spine: "#46615a", height: 0.95, thickness: 34, finish: "foil",
      note: "DreamWorks production art. The character design sheets are the strongest part." },

    { title: "Sherlock Holmes: The Penguin Complete", author: "Arthur Conan Doyle",
      spine: "#a05c30", height: 0.92, thickness: 54, finish: "foil",
      note: "Every Holmes story in a single brick. The reference copy." },

    { title: "The Cuckoo's Calling", author: "Robert Galbraith",
      spine: "#6d573a", height: 0.85, thickness: 32, finish: "matte",
      lean: true,
      note: "Rowling writing under a pen name. A straight detective novel, no magic anywhere." },

    /* lies flat at the end of the row, the way a big artbook always
       ends up when there's no room left to stand it */
    { title: "The Art of Turbo", author: "Robert Abele",
      spine: "#86513f", height: 0.94, thickness: 30, finish: "foil",
      flat: true,
      note: "DreamWorks again: a snail that wants to race, rendered beautifully." }
  ];

  /* ----------------------------------------------------------
     TOYS
     `id` must match an entry in the DEVICE table in shelf-engine.js.
     Adding a device = one row here + one DEVICE entry there
     (either a real model path, or the built-in primitive builder
     picks it up automatically as a fallback).
     ---------------------------------------------------------- */
  var toys = [
    { id: "steam-deck", name: "Steam Deck", maker: "Valve", year: "2022",
      note: "The heavy one. Does everything, costs your wrists.",
      credit: "Model by wallmasterr" },
    { id: "switch-lite", name: "Switch Lite", maker: "Nintendo", year: "2019",
      note: "Animal Crossing edition. Handheld only, and better for it.",
      credit: "Model by eddakat" },
    { id: "gba-sp", name: "Game Boy Advance SP", maker: "Nintendo", year: "2003",
      note: "The clamshell that fixed the original's biggest complaint: no backlight.",
      credit: "Model by synthetic worlds" }
  ];

  return { books: books, toys: toys, cloth: CLOTH };
})();
