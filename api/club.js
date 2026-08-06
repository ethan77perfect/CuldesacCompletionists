// ---------------------------------------------------------------
// /api/club v1.2 — pulls raw achievement data from Steam for the
// whole roster and every tracked game. Scoring happens in the
// browser (src/lib/scoring.js) so settings sliders update live.
//
//   GET /api/club?steamids=A,B,C&appids=X,Y,Z
//
// v1.2 changes:
//   - Requests run through a concurrency pool (not one giant burst),
//     so tracking 80+ games no longer trips Steam's rate limiting.
//   - Automatic retry with backoff on 429/5xx responses.
//   - maxDuration raised to 60s for large libraries.
// ---------------------------------------------------------------

export const config = { maxDuration: 60 };

const BASE = "https://api.steampowered.com";
const CONCURRENCY = 8;   // simultaneous requests to Steam
const RETRIES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function steamJSON(url) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      // 403 = private profile, 400 = unplayed game: real answers, don't retry
      if (r.status === 403 || r.status === 400) return null;
      // 429/5xx: back off and retry
      if (attempt < RETRIES) await sleep(600 * (attempt + 1));
    } catch {
      if (attempt < RETRIES) await sleep(600 * (attempt + 1));
    }
  }
  return null;
}

/** Run fn over items with at most `limit` in flight at once. */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export default async function handler(req, res) {
  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: "STEAM_API_KEY not set" });

  const steamids = (req.query.steamids || "").split(",").filter((s) => /^\d{17}$/.test(s));
  const appids = (req.query.appids || "").split(",").filter((s) => /^\d+$/.test(s));
  if (!steamids.length || !appids.length)
    return res.status(400).json({ error: "steamids and appids are required" });

  // Build the full request list, then feed it through the pool.
  // Per game: 1 global-rarity + 1 schema + 1 per player.
  const tasks = [];
  // Once per request: personas/avatars, and per-member playtime
  tasks.push({ kind: "summary",
    url: `${BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamids.join(",")}` });
  for (const sid of steamids) {
    tasks.push({ kind: "owned", sid,
      url: `${BASE}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${sid}` });
  }
  for (const appid of appids) {
    tasks.push({ appid, kind: "global",
      url: `${BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}` });
    tasks.push({ appid, kind: "schema",
      url: `${BASE}/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${appid}` });
    for (const sid of steamids) {
      tasks.push({ appid, kind: "player", sid,
        url: `${BASE}/ISteamUserStats/GetPlayerAchievements/v1/?key=${key}&steamid=${sid}&appid=${appid}` });
    }
  }

  const responses = await pool(tasks, CONCURRENCY, (t) => steamJSON(t.url));

  // Reassemble
  const byApp = new Map(appids.map((a) => [a, { global: null, schema: null, players: {} }]));
  const profiles = Object.fromEntries(steamids.map((s) => [s, { persona: null, avatar: null, playtime: {} }]));
  tasks.forEach((t, i) => {
    const r = responses[i];
    if (t.kind === "summary") {
      for (const p of r?.response?.players ?? []) {
        if (profiles[p.steamid]) {
          profiles[p.steamid].persona = p.personaname;
          profiles[p.steamid].avatar = p.avatarfull;
        }
      }
      return;
    }
    if (t.kind === "owned") {
      for (const g of r?.response?.games ?? []) {
        profiles[t.sid].playtime[g.appid] = g.playtime_forever; // minutes
      }
      return;
    }
    const slot = byApp.get(t.appid);
    if (t.kind === "global") slot.global = r;
    else if (t.kind === "schema") slot.schema = r;
    else slot.players[t.sid] = r;
  });

  const games = [];
  for (const [appid, app] of byApp) {
    const globalList = app.global?.achievementpercentages?.achievements ?? [];
    if (!globalList.length) continue;

    const names = new Map(
      (app.schema?.game?.availableGameStats?.achievements ?? []).map((a) => [
        a.name, a.displayName,
      ])
    );

    const game = {
      appid: Number(appid),
      name: app.schema?.game?.gameName ?? `App ${appid}`,
      ach: globalList.map((a) => ({
        id: a.name,
        name: names.get(a.name) ?? a.name,
        pct: parseFloat(a.percent),
      })),
      players: {},
    };

    for (const [sid, p] of Object.entries(app.players)) {
      const list = p?.playerstats?.achievements;
      if (!list) continue;
      game.players[sid] = list
        .filter((a) => a.achieved)
        .map((a) => ({ id: a.apiname, t: a.unlocktime }));
    }

    games.push(game);
  }

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({ games, profiles });
}
