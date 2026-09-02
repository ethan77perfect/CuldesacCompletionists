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
      if (r.status === 403 || r.status === 400) {
        // Steam speaks 400/403 in two dialects. An ANSWER carries a
        // JSON body ("Requested app has no stats", private profile) —
        // a legitimate negative that flows through as data. A REFUSAL
        // (throttle page, empty body) carries no answer at all — treat
        // it like any transient and retry, else it punches silent
        // holes in player data (the 10→9→8 perfect flicker: soft
        // refusals bypassed the hole patch, which only heard hardMiss).
        try {
          const body = await r.json();
          if (body && typeof body === "object") return { data: body, hardMiss: false };
        } catch { /* no answer in the body — fall through to retry */ }
      }
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

  const byApp = new Map(appids.map((a) => [String(a), { global: null, schema: null, players: {}, globalMiss: false, schemaMiss: false, playerMiss: [] }]));
  const profiles = withProfiles
    ? Object.fromEntries(steamids.map((s) => [s, { persona: null, avatar: null, playtime: {}, lastPlayed: {} }]))
    : {};
  // Truth vs. absence: a null response and an empty response used to be
  // indistinguishable from "owns nothing" / "never played" — which let a
  // single throttled call quietly un-own a member's whole library or
  // punch a hole in a game's players map (the perfect-count flicker).
  // Now every failure is REPORTED so the merge layer can carry the
  // previous data forward instead of believing the gap:
  //   profileMeta[sid].ownedFetched — GetOwnedGames genuinely returned a
  //     games array this run (403s, timeouts, and private-profile empty
  //     responses all read as "not fetched", never as "owns nothing")
  //   playerMisses[appid] — sids whose GetPlayerAchievements call hard-
  //     failed (retries exhausted). A clean 400 ("no stats") is NOT a
  //     miss: that's the legitimate signal for a never-launched game.
  const profileMeta = {};
  const playerMisses = {};
  tasks.forEach((t, i) => {
    const r = outcomes[i].data;
    if (t.kind === "summary") {
      for (const p of r?.response?.players ?? []) {
        if (profiles[p.steamid]) { profiles[p.steamid].persona = p.personaname; profiles[p.steamid].avatar = p.avatarfull; }
      }
      return;
    }
    if (t.kind === "owned") {
      profileMeta[t.sid] = { ownedFetched: Array.isArray(r?.response?.games) };
      for (const g of r?.response?.games ?? []) {
        profiles[t.sid].playtime[g.appid] = g.playtime_forever;
        profiles[t.sid].lastPlayed[g.appid] = g.rtime_last_played ?? 0;
      }
      return;
    }
    const slot = byApp.get(String(t.appid));
    // With body-aware steamJSON above, null now means UNANSWERED,
    // period — every answered negative arrives as parsed JSON. So any
    // null is a miss: the game isn't emitted (global/schema) or the
    // player's cached unlocks are carried (player), no exceptions.
    if (t.kind === "global") { slot.global = r; slot.globalMiss = r == null; }
    else if (t.kind === "schema") { slot.schema = r; slot.schemaMiss = r == null; }
    else {
      slot.players[t.sid] = r;
      if (r == null) slot.playerMiss.push(t.sid);
    }
  });

  const games = [];
  for (const [appid, app] of byApp) {
    // A hard-failed global OR schema call means we can't trust this
    // run's picture of the game (a schema-less emission can shrink the
    // achievement list and mint false perfects). Don't emit — the merge
    // layer carries the cached copy forward, same as an unfetched game.
    if (app.globalMiss || app.schemaMiss) continue;
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
    if (app.playerMiss.length) playerMisses[appid] = app.playerMiss;
    games.push(game);
  }
  return { games, profiles, failed, profileMeta, playerMisses };
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
