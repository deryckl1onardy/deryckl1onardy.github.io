#!/usr/bin/env node
/*
   Pulls real "last played" data from the Steam Web API and writes
   assets/cave/steam.json in the shape shelf-engine.js expects:
   { appid, name, hours, lastPlayed, capsule, screenshot?, achievement? }[]

   screenshot is a real developer-provided screenshot from the game's own
   store page (not marketing key art). achievement is the account's most
   recently unlocked real achievement for that game, with its real name
   and description from the game's schema. Both are omitted — never
   invented — when Steam has nothing real to report.

   Reads STEAM_API_KEY and STEAM_ID from .env.steam (gitignored — never
   commit real credentials). STEAM_ID may be a numeric SteamID64 or a
   vanity profile name (the part after /id/ in a profile URL); either
   works, vanity names get resolved automatically.

   Usage: node scripts/fetch-steam.js [howMany=12]
*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.steam");
const OUT_PATH = path.join(ROOT, "assets", "cave", "steam.json");

function loadEnv(file) {
  const out = {};
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function resolveSteamId(key, id) {
  if (/^\d{17}$/.test(id)) return id; // already a SteamID64
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(id)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ResolveVanityURL failed: ${r.status}`);
  const d = await r.json();
  if (d.response.success !== 1) throw new Error(`Could not resolve vanity URL "${id}": ${d.response.message || "not found"}`);
  return d.response.steamid;
}

async function fetchOwnedGames(key, steamid) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GetOwnedGames failed: ${r.status}`);
  const d = await r.json();
  return (d.response && d.response.games) || [];
}

function toDateString(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A real developer-provided screenshot of the game itself (from its
// store page), not Steam's marketing key art. Some appids (new/delisted
// titles) have none — returns null rather than a guess.
async function fetchScreenshot(appid) {
  try {
    const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}`);
    if (!r.ok) return null;
    const d = await r.json();
    const entry = d[appid];
    const shots = entry && entry.success && entry.data && entry.data.screenshots;
    if (!shots || !shots.length) return null;
    return shots[0].path_full || null;
  } catch (_) {
    return null;
  }
}

// The most recently unlocked real achievement for this game on this
// account, with its real display name and description from the game's
// own schema. Most games have achievements disabled, private, or none
// unlocked yet — any of those returns null, never an invented one.
async function fetchLatestAchievement(key, steamid, appid) {
  try {
    const ar = await fetch(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?appid=${appid}&key=${key}&steamid=${steamid}`);
    if (!ar.ok) return null;
    const ad = await ar.json();
    const stats = ad.playerstats;
    if (!stats || !stats.success || !stats.achievements) return null;
    const unlocked = stats.achievements.filter((a) => a.achieved === 1);
    if (!unlocked.length) return null;
    unlocked.sort((a, b) => b.unlocktime - a.unlocktime);
    const latest = unlocked[0];

    const sr = await fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${appid}`);
    if (!sr.ok) return null;
    const sd = await sr.json();
    const list = sd.game && sd.game.availableGameStats && sd.game.availableGameStats.achievements;
    const schema = list && list.find((a) => a.name === latest.apiname);
    if (!schema || !schema.displayName) return null;

    return {
      name: schema.displayName,
      description: schema.description || "",
      icon: schema.icon || null,
      unlocked: toDateString(latest.unlocktime),
    };
  } catch (_) {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`Missing ${ENV_PATH}. Create it with STEAM_API_KEY and STEAM_ID.`);
    process.exit(1);
  }
  const env = loadEnv(ENV_PATH);
  const key = env.STEAM_API_KEY;
  const rawId = env.STEAM_ID;
  if (!key || !rawId) {
    console.error("STEAM_API_KEY and STEAM_ID must both be set in .env.steam");
    process.exit(1);
  }

  const howMany = parseInt(process.argv[2], 10) || 12;

  const steamid = await resolveSteamId(key, rawId);
  const games = await fetchOwnedGames(key, steamid);

  if (!games.length) {
    console.error(
      "Steam returned zero games. Your profile/game-details privacy is probably set to " +
      "Private — set it to Public (or Friends Only won't work either) at " +
      "steamcommunity.com/my/edit/settings, then re-run this script."
    );
    process.exit(1);
  }

  const played = games.filter((g) => g.rtime_last_played && g.playtime_forever > 0);
  played.sort((a, b) => b.rtime_last_played - a.rtime_last_played);

  // shelf-engine.js loads `capsule` as a THREE texture with no error
  // handler, so a 404 there just silently leaves that shelf item blank.
  // A few very new/niche titles haven't had a portrait library capsule
  // uploaded to Steam's CDN yet — check each one and skip it (pulling
  // the next-most-recently-played game instead) rather than shipping a
  // broken image.
  const picked = [];
  for (const g of played) {
    if (picked.length >= howMany) break;
    const capsule = `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`;
    let ok = false;
    try {
      const r = await fetch(capsule, { method: "HEAD" });
      ok = r.ok;
    } catch (_) {}
    if (!ok) {
      console.warn(`  skipping "${g.name}" — no library capsule art at ${capsule}`);
      continue;
    }

    const screenshot = await fetchScreenshot(g.appid);
    await sleep(250); // store API is rate-limited; owned-games and stats calls are not
    const achievement = await fetchLatestAchievement(key, steamid, g.appid);
    await sleep(150);

    const entry = {
      appid: g.appid,
      name: g.name,
      hours: Math.round((g.playtime_forever / 60) * 10) / 10,
      lastPlayed: toDateString(g.rtime_last_played),
      capsule,
    };
    if (screenshot) entry.screenshot = screenshot;
    if (achievement) entry.achievement = achievement;
    picked.push(entry);
  }

  const out = {
    seed: false,
    updated: new Date().toISOString(),
    games: picked,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${out.games.length} real games to ${path.relative(ROOT, OUT_PATH)}`);
  out.games.forEach((g) => {
    const ach = g.achievement ? ` · 🏆 ${g.achievement.name}` : "";
    const shot = g.screenshot ? " · has screenshot" : "";
    console.log(`  ${g.lastPlayed}  ${g.hours.toString().padStart(6)} h  ${g.name}${shot}${ach}`);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
