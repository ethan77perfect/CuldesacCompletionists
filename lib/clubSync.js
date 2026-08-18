// ---------------------------------------------------------------
// lib/clubSync.js — the shared brain for keeping snapshot_cache true.
//
// Two processes write the cache now: the nightly cron and the
// on-demand /api/refresh endpoint. Both follow the same contract,
// defined here once:
//
//   computeTargets  — which games to fetch this run (stalest first,
//                     bounded budget, skip anything fresh enough)
//   mergePayload    — fetched games replace their cache entries,
//                     everything else carries over; per-game
//                     freshness (gameFetchedAt) and announcement
//                     watermarks (announceWatermark) ride inside
//                     the payload itself
//   buildSnapshotRows — one row per member per owned game, the
//                     library-scoped history the charts read
//   diffAnnouncements — completions, rare unlocks, and pioneer
//                     inserts detected against PER-GAME watermarks,
//                     so a game announced by a 2pm refresh is not
//                     re-announced by the 10pm cron. Pure function:
//                     no db, no Discord — callers do the writing.
//
// The watermark rule that keeps double-writers honest: an event is
// "new" iff its unlock time is at or after the game's watermark, and
// whoever merges a fetched game advances that game's watermark to
// its fetch time. Carried-over games keep their old watermark, so
// nothing is ever announced from data that didn't just arrive.
// ---------------------------------------------------------------

export function computeTargets(prevFetchMap, appids,
  { budget, staleAfterSec, nowEpoch, hotIds = new Set(), hotStaleAfterSec = staleAfterSec }) {
  // Two clocks: games someone is actively playing (hotIds, from
  // GetRecentlyPlayedGames) go stale in minutes so unlocks surface
  // fast; the dormant library keeps the slow, cheap cycle.
  const limitFor = (a) => (hotIds.has(String(a)) ? hotStaleAfterSec : staleAfterSec);
  const stale = appids.filter((a) => (prevFetchMap[a] ?? 0) < nowEpoch - limitFor(a));
  stale.sort((a, b) => (prevFetchMap[a] ?? 0) - (prevFetchMap[b] ?? 0));
  return { targets: stale.slice(0, budget), staleCount: stale.length };
}

export function mergePayload(prevPayload, fetched, clubIds, nowEpoch) {
  const gotIds = new Set(fetched.games.map((g) => Number(g.appid)));
  const gameFetchedAt = { ...(prevPayload?.gameFetchedAt ?? {}) };
  for (const id of gotIds) gameFetchedAt[id] = nowEpoch;
  for (const id of Object.keys(gameFetchedAt)) if (!clubIds.has(Number(id))) delete gameFetchedAt[id];
  const announceWatermark = { ...(prevPayload?.announceWatermark ?? {}) };
  for (const id of Object.keys(announceWatermark)) if (!clubIds.has(Number(id))) delete announceWatermark[id];
  return {
    payload: {
      games: [
        ...fetched.games,
        ...(prevPayload?.games ?? []).filter((g) => !gotIds.has(Number(g.appid)) && clubIds.has(Number(g.appid))),
      ],
      profiles: { ...(prevPayload?.profiles ?? {}), ...fetched.profiles },
      gameFetchedAt, announceWatermark,
      recentAppids: prevPayload?.recentAppids ?? [],       // carried; /api/refresh overwrites when it re-checks
      recentCheckedAt: prevPayload?.recentCheckedAt ?? 0,
    },
    gotIds,
  };
}

export function buildSnapshotRows(payload, steamids, day) {
  // LIBRARY SCOPE: a row per game the member OWNS (their GetOwnedGames
  // playtime map), even with no achievement data yet — so the history
  // view's sum(total) is each member's library size. The || keeps two
  // safety nets: free games Steam doesn't report as owned until first
  // launch, and runs where the ownership fetch failed (empty map =
  // unknown, not "owns nothing") degrade to started-games scope.
  const rows = [];
  for (const g of payload.games) {
    for (const sid of steamids) {
      const unlocks = g.players[sid];
      const pt = payload.profiles?.[sid]?.playtime ?? {};
      const owned = Object.keys(pt).length > 0 && pt[g.appid] !== undefined;
      if (!unlocks && !owned) continue;
      rows.push({
        day, steamid: sid, appid: g.appid,
        unlocked: unlocks?.length ?? 0, total: g.ach.length,
        complete: !!unlocks && unlocks.length === g.ach.length && g.ach.length > 0,
      });
    }
  }
  return rows;
}

export function diffAnnouncements({
  prevPayload, fetchedGames, nowEpoch,
  nameOf, gameName, rarePct, pioneerPct,
  existingPioneerKeys, pioneerFirstScan,
}) {
  // Previous-run lookups, from the payload this merge is replacing
  const prevComplete = new Map();
  const prevTracked = new Set();
  const prevAchPct = new Map();
  for (const g of prevPayload?.games ?? []) {
    prevTracked.add(Number(g.appid));
    for (const a of g.ach) prevAchPct.set(`${g.appid}|${a.id}`, a.pct);
    for (const [sid, unlocks] of Object.entries(g.players ?? {})) {
      prevComplete.set(`${sid}|${g.appid}`, unlocks.length === g.ach.length && g.ach.length > 0);
    }
  }
  const prevWatermark = prevPayload?.announceWatermark ?? {};
  // Legacy fallback for games that predate watermarks: the cache-level
  // fetched_at handled this before; a day's lookback is the safe floor.
  const legacyWindow = nowEpoch - 86400;
  const firstRun = !prevPayload;   // no cache at all → establish baseline silently

  const embeds = [], pioneerInserts = [], newPioneerKeys = new Set();
  const watermark = {};
  for (const g of fetchedGames) {
    const wm = prevWatermark[g.appid] ?? legacyWindow;
    watermark[g.appid] = nowEpoch;
    const achById = Object.fromEntries(g.ach.map((a) => [a.id, a]));
    for (const [sid, unlocks] of Object.entries(g.players)) {
      // pioneers: recorded at ingest, immune to the % rising later
      for (const u of unlocks) {
        const a = achById[u.id];
        if (!a || a.pct <= 0 || a.pct > pioneerPct) continue;   // 0.0% = unknown, never counts
        const keyStr = `${sid}|${g.appid}|${u.id}`;
        if (existingPioneerKeys.has(keyStr)) continue;
        const prevPct = prevAchPct.get(`${g.appid}|${u.id}`);
        const graduated = (prevPct === undefined || prevPct <= 0) && a.pct > 0;
        if (pioneerFirstScan || u.t >= wm || graduated) {
          pioneerInserts.push({ steamid: sid, appid: g.appid, achid: u.id,
            unlocked_at: u.t ? new Date(u.t * 1000).toISOString() : null, pct_at_unlock: a.pct });
          if (!pioneerFirstScan) newPioneerKeys.add(keyStr);
        }
      }
      if (firstRun) continue;
      // completion: complete now, wasn't last run, and the game was
      // TRACKED last run (adding an already-beaten game isn't news)
      const isComplete = unlocks.length === g.ach.length && g.ach.length > 0;
      if (isComplete && prevTracked.has(Number(g.appid)) && !prevComplete.get(`${sid}|${g.appid}`)) {
        embeds.push({
          title: `💯 ${nameOf[sid]} perfected ${gameName[g.appid] ?? g.appid}!`,
          description: `${g.ach.length} achievements, all of them. The shelf grows.`,
          color: 0xE8B84B,
        });
      }
      // rare unlocks inside this game's window
      for (const u of unlocks) {
        const a = achById[u.id];
        if (u.t >= wm && a && a.pct > 0 && a.pct <= rarePct) {
          const isPio = newPioneerKeys.has(`${sid}|${g.appid}|${u.id}`);
          embeds.push({
            title: `${isPio ? "🚩" : "💎"} ${nameOf[sid]} unlocked "${a.name}"`,
            description: `${g.name} — only **${a.pct.toFixed(2)}%** of players have this.` +
              (isPio ? "\nPIONEER recorded — early forever, no matter how common it becomes." : ""),
            color: isPio ? 0xE05B5B : 0xB48CE0,
          });
        }
      }
    }
  }
  return { embeds, pioneerInserts, watermark };
}

// Optimistic write: lose the race → caller re-reads, re-merges, retries.
export async function casWriteCache(db, prevRow, payload, { touchFetchedAt = false } = {}) {
  const patch = { payload, version: (prevRow?.version ?? 0) + 1 };
  if (touchFetchedAt || !prevRow) patch.fetched_at = new Date().toISOString();
  if (!prevRow) {
    const w = await db.from("snapshot_cache").insert({ id: 1, ...patch });
    return !w.error;
  }
  const w = await db.from("snapshot_cache")
    .update(patch).eq("id", 1).eq("version", prevRow.version ?? 0).select("version");
  return !w.error && (w.data ?? []).length > 0;
}
