// ---------------------------------------------------------------
// /api/club v2.1 — raw achievement data for a batch of games.
//
//   GET /api/club?steamids=A,B&appids=X,Y&profiles=1
//
// v2.1: designed to be called in SMALL BATCHES by the frontend
// (a dozen appids at a time) so big clubs don't fire ~1000 Steam
// requests in one invocation and trip rate limiting.
//   - steamJSON distinguishes real answers (private profile /
//     unplayed = null, cacheable) from throttle failures.
//   - Any throttle failure → response is NOT CDN-cached and
//     includes `failed: n` so the frontend can retry the batch.
//   - profiles=1 (first batch only) also fetches personas,
//     avatars, and playtime.
// ---------------------------------------------------------------

export const config = { maxDuration: 60 };

const BASE = "https://api.steampowered.com";
const CONCURRENCY = 5;
const RETRIES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// → { data, hardMiss }  hardMiss = throttled/network-failed after retries
async function steamJSON(url) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return { data: await r.json(), hardMiss: false };
      // 403 = private profile, 400 = unplayed/no stats: real answers
      if (r.status === 403 || r.status === 400) return { data: null, hardMiss: false };
      if (attempt < RETRIES) await sleep(1000 * (attempt + 1));
    } catch {
      if (attempt < RETRIES) await sleep(1000 * (attempt + 1));
    }
  }
  return { data: null, hardMiss: true };
}

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
  const wantProfiles = req.query.profiles !== "0";
  if (!steamids.length || !appids.length)
    return res.status(400).json({ error: "steamids and appids are required" });

  const tasks = [];
  if (wantProfiles) {
    tasks.push({ kind: "summary",
      url: `${BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamids.join(",")}` });
    for (const sid of steamids) {
      tasks.push({ kind: "owned", sid,
        url: `${BASE}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${sid}` });
    }
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

  const outcomes = await pool(tasks, CONCURRENCY, (t) => steamJSON(t.url));
  const failed = outcomes.filter((o) => o.hardMiss).length;

  const byApp = new Map(appids.map((a) => [a, { global: null, schema: null, players: {} }]));
  const profiles = wantProfiles
    ? Object.fromEntries(steamids.map((s) => [s, { persona: null, avatar: null, playtime: {} }]))
    : {};
  tasks.forEach((t, i) => {
    const r = outcomes[i].data;
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
        profiles[t.sid].playtime[g.appid] = g.playtime_forever;
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
      (app.schema?.game?.availableGameStats?.achievements ?? []).map((a) => [a.name, a.displayName])
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
      game.players[sid] = list.filter((a) => a.achieved).map((a) => ({ id: a.apiname, t: a.unlocktime }));
    }
    games.push(game);
  }

  // Only cache clean responses — a throttled batch must not poison the CDN.
  if (failed === 0) {
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({ games, profiles, failed });
}
