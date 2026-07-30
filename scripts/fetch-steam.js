#!/usr/bin/env node
/* ============================================================
   THE CAVE — STEAM SYNC
   Runs in GitHub Actions (see .github/workflows/steam.yml).
   Writes assets/cave/steam.json, which the Cave page fetches.

   Zero dependencies — uses Node 20's global fetch.

   Local run:
     STEAM_API_KEY=xxx STEAM_ID=7656119... node scripts/fetch-steam.js

   Why GetOwnedGames and not GetRecentlyPlayedGames:
   GetRecentlyPlayedGames only covers a rolling two-week window,
   so after any quiet fortnight it returns an empty list and the
   shelf would go blank. GetOwnedGames carries rtime_last_played
   for every title, so sorting by it gives a true "last 10 played"
   that is always full.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const KEY = process.env.STEAM_API_KEY;
const ID = process.env.STEAM_ID;
const COUNT = 10;
const OUT = path.join(__dirname, "..", "assets", "cave", "steam.json");

function fail(msg) {
  console.error("steam-sync: " + msg);
  // Exit 0 on purpose. A Steam outage or a missing secret must not
  // fail the workflow or overwrite the last good file — the page
  // keeps rendering whatever is already committed.
  process.exit(0);
}

if (!KEY || !ID) fail("STEAM_API_KEY or STEAM_ID not set — leaving existing file untouched.");

const url =
  "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/" +
  "?key=" + encodeURIComponent(KEY) +
  "&steamid=" + encodeURIComponent(ID) +
  "&include_appinfo=1&include_played_free_games=1&format=json";

(async function () {
  let payload;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "cave-shelf" } });
    if (!res.ok) return fail("Steam returned HTTP " + res.status);
    payload = await res.json();
  } catch (err) {
    return fail("request failed — " + err.message);
  }

  const owned = payload && payload.response && payload.response.games;
  if (!Array.isArray(owned) || !owned.length) {
    return fail(
      "no games in response. Check that Steam profile > Privacy > " +
      "'Game details' is set to Public."
    );
  }

  const games = owned
    .filter((g) => g.rtime_last_played > 0)
    .sort((a, b) => b.rtime_last_played - a.rtime_last_played)
    .slice(0, COUNT)
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      hours: Math.round((g.playtime_forever || 0) / 6) / 10,
      lastPlayed: new Date(g.rtime_last_played * 1000).toISOString().slice(0, 10),
      capsule:
        "https://cdn.cloudflare.steamstatic.com/steam/apps/" +
        g.appid + "/library_600x900.jpg"
    }));

  if (!games.length) return fail("no played games found — leaving existing file untouched.");

  const next = { updated: new Date().toISOString(), games: games };
  const serialized = JSON.stringify(next, null, 2) + "\n";

  // Compare on the games array only — the `updated` timestamp always
  // differs, and committing that alone would make a pointless commit
  // every single day.
  let unchanged = false;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
    unchanged = JSON.stringify(prev.games) === JSON.stringify(next.games);
  } catch (_) {
    /* no previous file, or it's malformed — write a fresh one */
  }

  if (unchanged) {
    console.log("steam-sync: no change (" + games.length + " games).");
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, serialized);
  console.log("steam-sync: wrote " + games.length + " games.");
  console.log(games.map((g) => "  " + g.lastPlayed + "  " + g.name).join("\n"));
})();
