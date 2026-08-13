// ---------------------------------------------------------------
// NOTE: legacy debugging proxy — the site itself no longer calls
// this (it uses /api/club + /api/db). Kept because it is handy for
// poking individual Steam endpoints in the browser. Safe to delete.
// ---------------------------------------------------------------
// /api/steam — one serverless proxy for every Steam Web API call.
// Keeps STEAM_API_KEY server-side and adds CDN caching so the
// club doesn't burn through Steam's 100k calls/day limit.
//
// Deploy on Vercel. Set STEAM_API_KEY in project env vars.
//
// Routes (all GET):
//   /api/steam?op=resolve&vanity=ethansprofile      → { steamid }
//   /api/steam?op=owned&steamid=765...              → owned games + playtime
//   /api/steam?op=achievements&steamid=765...&appid=1145360
//   /api/steam?op=global&appid=1145360              → global unlock %s
//   /api/steam?op=schema&appid=1145360              → achievement names/icons
//   /api/steam?op=summary&steamids=765...,765...    → personas + avatars
// ---------------------------------------------------------------

const BASE = "https://api.steampowered.com";

const ROUTES = {
  resolve: (q, key) =>
    `${BASE}/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${q.vanity}`,
  owned: (q, key) =>
    `${BASE}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${q.steamid}&include_appinfo=1&include_played_free_games=1`,
  achievements: (q, key) =>
    `${BASE}/ISteamUserStats/GetPlayerAchievements/v1/?key=${key}&steamid=${q.steamid}&appid=${q.appid}`,
  global: (q) =>
    `${BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${q.appid}`,
  schema: (q, key) =>
    `${BASE}/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${q.appid}`,
  summary: (q, key) =>
    `${BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${q.steamids}`,
  // Steam STORE search (different host, no key needed) — powers the
  // Century page's add-a-game box. Proxied for CORS + caching.
  search: (q) =>
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q.term ?? "")}&cc=us&l=en`,
};

// Cache lifetimes (seconds) for Vercel's CDN. Global rarity moves slowly;
// player achievements should stay fresh so new unlocks show up quickly.
const CACHE = {
  search: 3600,
  resolve: 86400,
  owned: 900,
  achievements: 300,
  global: 43200,
  schema: 604800,
  summary: 3600,
};

export default async function handler(req, res) {
  const { op, ...q } = req.query;
  const key = process.env.STEAM_API_KEY;

  if (!key) return res.status(500).json({ error: "STEAM_API_KEY not set" });
  if (!ROUTES[op]) return res.status(400).json({ error: `Unknown op '${op}'` });

  // Basic input hygiene — Steam IDs and app IDs are numeric.
  for (const field of ["steamid", "appid"]) {
    if (q[field] && !/^\d+$/.test(q[field]))
      return res.status(400).json({ error: `Invalid ${field}` });
  }

  try {
    const upstream = await fetch(ROUTES[op](q, key));
    if (!upstream.ok) {
      // Steam returns 403 when a profile/game stats are private.
      return res.status(upstream.status).json({
        error:
          upstream.status === 403
            ? "Profile or game stats are private on Steam"
            : `Steam API returned ${upstream.status}`,
      });
    }
    const data = await upstream.json();
    res.setHeader(
      "Cache-Control",
      `s-maxage=${CACHE[op]}, stale-while-revalidate=${CACHE[op] * 2}`
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Steam API unreachable" });
  }
}
