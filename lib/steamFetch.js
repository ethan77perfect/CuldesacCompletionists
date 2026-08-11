// ---------------------------------------------------------------
// lib/steamFetch.js — the ONE place that talks to Steam.
// Used by /api/club (live batches) and /api/cron (nightly full run)
// so both produce the identical payload shape:
//   { games: [{appid, name, ach:[{id,name,pct}], players:{sid:[{id,t}]}}],
//     profiles: {sid: {persona, avatar, playtime}}, failed }
// ---------------------------------------------------------------

const BASE = "https://api.steampowered.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function steamJSON(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return { data: await r.json(), hardMiss: false };
      if (r.status === 403 || r.status === 400) return { data: null, hardMiss: false };
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    } catch {
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  return { data: null, hardMiss: true };
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchClubData(key, steamids, appids, { withProfiles = true, concurrency = 5 } = {}) {
  const tasks = [];
  if (withProfiles) {
    tasks.push({ kind: "summary",
      url: `${BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamids.join(",")}` });
    for (const sid of steamids)
      tasks.push({ kind: "owned", sid, url: `${BASE}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${sid}` });
  }
  for (const appid of appids) {
    tasks.push({ appid, kind: "global",
      url: `${BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}` });
    tasks.push({ appid, kind: "schema",
      url: `${BASE}/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${appid}` });
    for (const sid of steamids)
      tasks.push({ appid, kind: "player", sid,
        url: `${BASE}/ISteamUserStats/GetPlayerAchievements/v1/?key=${key}&steamid=${sid}&appid=${appid}` });
  }

  const outcomes = await pool(tasks, concurrency, (t) => steamJSON(t.url));
  const failed = outcomes.filter((o) => o.hardMiss).length;

  const byApp = new Map(appids.map((a) => [String(a), { global: null, schema: null, players: {} }]));
  const profiles = withProfiles
    ? Object.fromEntries(steamids.map((s) => [s, { persona: null, avatar: null, playtime: {} }]))
    : {};
  tasks.forEach((t, i) => {
    const r = outcomes[i].data;
    if (t.kind === "summary") {
      for (const p of r?.response?.players ?? []) {
        if (profiles[p.steamid]) { profiles[p.steamid].persona = p.personaname; profiles[p.steamid].avatar = p.avatarfull; }
      }
      return;
    }
    if (t.kind === "owned") {
      for (const g of r?.response?.games ?? []) profiles[t.sid].playtime[g.appid] = g.playtime_forever;
      return;
    }
    const slot = byApp.get(String(t.appid));
    if (t.kind === "global") slot.global = r;
    else if (t.kind === "schema") slot.schema = r;
    else slot.players[t.sid] = r;
  });

  const games = [];
  for (const [appid, app] of byApp) {
    const globalList = app.global?.achievementpercentages?.achievements ?? [];
    if (!globalList.length) continue;
    const names = new Map((app.schema?.game?.availableGameStats?.achievements ?? []).map((a) => [a.name, a.displayName]));
    const game = {
      appid: Number(appid),
      name: app.schema?.game?.gameName ?? `App ${appid}`,
      ach: globalList.map((a) => ({ id: a.name, name: names.get(a.name) ?? a.name, pct: parseFloat(a.percent) })),
      players: {},
    };
    for (const [sid, p] of Object.entries(app.players)) {
      const list = p?.playerstats?.achievements;
      if (!list) continue;
      game.players[sid] = list.filter((a) => a.achieved).map((a) => ({ id: a.apiname, t: a.unlocktime }));
    }
    games.push(game);
  }
  return { games, profiles, failed };
}
