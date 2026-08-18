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
      tasks.push({ kind: "owned", sid, url: `${BASE}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${sid}&include_played_free_games=1` });
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
    ? Object.fromEntries(steamids.map((s) => [s, { persona: null, avatar: null, playtime: {}, lastPlayed: {} }]))
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
      for (const g of r?.response?.games ?? []) {
        profiles[t.sid].playtime[g.appid] = g.playtime_forever;
        profiles[t.sid].lastPlayed[g.appid] = g.rtime_last_played ?? 0;
      }
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
    const schemaAch = app.schema?.game?.availableGameStats?.achievements ?? [];
    // Distinguish two very different "no percentages" cases:
    //  - the call FAILED (app.global === null): transient — skip this
    //    load rather than zeroing an established game's difficulty
    //  - the call SUCCEEDED but empty: Steam genuinely has no stats yet
    //    (brand-new title). If the schema shows achievements, include
    //    the game with everything ⏳ Unrated instead of leaving it
    //    permanently cold — it graduates when Steam's stats arrive.
    const globalSucceeded = app.global !== null && app.global !== undefined;
    if (!globalList.length && !(globalSucceeded && schemaAch.length)) continue;
    const names = new Map(schemaAch.map((a) => [a.name, a.displayName]));
    // UNION of schema ∪ global-percentages: the schema knows about newly
    // added achievements immediately; the percentages endpoint lags behind
    // game updates. Schema-only achievements get pct 0 → rendered as
    // ⏳ Unrated and scored provisionally until Steam publishes numbers.
    const globalPct = new Map(globalList.map((a) => [a.name, parseFloat(a.percent)]));
    const ids = [...new Set([...schemaAch.map((a) => a.name), ...globalList.map((a) => a.name)])];
    const game = {
      appid: Number(appid),
      name: app.schema?.game?.gameName ?? `App ${appid}`,
      ach: ids.map((id) => ({ id, name: names.get(id) ?? id, pct: globalPct.get(id) ?? 0 })),
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

// Which club-relevant games has anyone touched in the last two weeks?
// One cheap call per member (GetRecentlyPlayedGames) — the signal that
// lets /api/refresh give actively-played games a minutes-scale
// staleness while the dormant library stays on the slow, cheap cycle.
export async function fetchRecentAppids(key, steamids) {
  const results = await Promise.all(steamids.map(async (sid) => {
    try {
      const r = await fetch(`${BASE}/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${sid}&count=0`);
      const j = await r.json();
      return (j?.response?.games ?? []).map((g) => Number(g.appid));
    } catch { return []; }
  }));
  return [...new Set(results.flat())];
}
