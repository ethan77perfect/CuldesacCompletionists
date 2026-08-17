// ---------------------------------------------------------------
// /api/cron — the club's nightly heartbeat.
//
// Runs at 10:00 PM Eastern, year-round: vercel.json triggers at both
// 02:00 and 03:00 UTC (10pm EDT vs 10pm EST), and this handler checks
// the real clock in America/New_York — it runs on the trigger that
// lands at 10pm and silently skips the other. DST handles itself.
// Manual test: open /api/cron?secret=YOUR_CRON_SECRET in a browser
// (manual runs skip the 10pm check; if CRON_SECRET isn't set, any
// request is allowed — set it!).
//
// Each run:
//   1. Fetch the ENTIRE club from Steam (shared lib, gentle pace)
//   2. Abort without writing if Steam throttled too much — never
//      snapshot garbage
//   3. Save the payload to snapshot_cache (→ instant page loads)
//      and one row per player-per-game to snapshots (→ history)
//   4. Diff against the previous snapshot: completions, rare
//      unlocks since last run, Monday contract report
//   5. Post the morning digest to Discord (if DISCORD_WEBHOOK_URL
//      is set; otherwise steps 1–4 still run silently)
// ---------------------------------------------------------------

export const config = { maxDuration: 60 };

import { createClient } from "@supabase/supabase-js";
import { fetchClubData } from "../lib/steamFetch.js";

const CLUB_TZ = "America/New_York";
const tzPart = (type) =>
  new Intl.DateTimeFormat("en-US", { timeZone: CLUB_TZ, hour: "numeric", hour12: false, weekday: "short" })
    .formatToParts(new Date()).find((p) => p.type === type)?.value;

const nextMonday = (epoch) => {
  const d = new Date(epoch * 1000);
  const days = ((8 - d.getUTCDay()) % 7) || 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days) / 1000;
};

async function postDiscord(webhook, embeds) {
  // Discord allows ≤10 embeds per message — chunk politely
  for (let i = 0; i < embeds.length; i += 10) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "The 100% Club", embeds: embeds.slice(i, i + 10) }),
    }).catch(() => {});
  }
}

export default async function handler(req, res) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>; manual tests can use ?secret=
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization === `Bearer ${secret}` || req.query.secret === secret;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
  }
  // Scheduled triggers: BOTH vercel.json slots now run — 10pm club time
  // is the primary pass, 11pm the catch-up pass. With the per-run game
  // budget below, two passes cover the whole library nightly; before,
  // the second trigger was skipped and one oversized pass had to
  // survive Steam's rate limits alone (at 127 games it usually didn't).
  const isManual = Boolean(req.query.secret);
  const hourNow = tzPart("hour");
  if (!isManual && hourNow !== "22" && hourNow !== "23") {
    return res.status(200).json({ ok: true, skipped: `not 10/11pm ${CLUB_TZ} on this trigger` });
  }
  const quiet = req.query.quiet === "1";   // manual repair runs: &quiet=1 skips Discord
  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: "STEAM_API_KEY not set" });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const [members, gamesList, settingsRow, contracts, prevCache] = await Promise.all([
    db.from("members").select("*"),
    db.from("games").select("*"),
    db.from("settings").select("data").eq("id", 1).maybeSingle(),
    db.from("contracts").select("*"),
    db.from("snapshot_cache").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (members.error || gamesList.error)
    return res.status(500).json({ error: "DB read failed — run migration-v4.sql?" });

  const steamids = (members.data ?? []).map((m) => m.steamid);
  const appids = (gamesList.data ?? []).map((g) => String(g.appid));
  if (!steamids.length || !appids.length)
    return res.status(200).json({ ok: true, note: "Empty club, nothing to snapshot" });

  // ---- 1. the fetch: RESUMABLE. Stale-first, budgeted, merged. ----
  // One 127-game pass is ~1,500 Steam calls — big enough that a grumpy
  // Steam evening tripped the all-or-nothing garbage guard night after
  // night, freezing the cache (the "96 missing games" incident). Now
  // each run fetches only the GAME_BUDGET stalest games and MERGES the
  // results into the existing cache: fetched games replace their old
  // entries, everything else carries over untouched. Partial success
  // advances the club instead of being thrown away, and any single run
  // is small enough to finish fast and under the rate limit. Staleness
  // lives in the payload itself (gameFetchedAt: appid → epoch); games
  // missing from the cache rank stalest of all. Repair by hand anytime:
  // /api/cron?secret=...&quiet=1, repeatedly, until staleRemaining: 0.
  const GAME_BUDGET = 60;   // ≈ 730 calls/run at 10 members — 2 nightly passes cover ~120 games
  const prevPayload0 = prevCache.data?.payload ?? null;
  const prevFetchMap = prevPayload0?.gameFetchedAt ?? {};
  const clubIds = new Set(appids.map(Number));
  const targets = [...appids]
    .sort((a, b) => (prevFetchMap[a] ?? 0) - (prevFetchMap[b] ?? 0))
    .slice(0, GAME_BUDGET);
  const fetched = await fetchClubData(key, steamids, targets, { concurrency: 5 });

  // ---- 2. never MERGE garbage ----
  // The guard survives, per-run: a total wipeout or heavy throttling
  // aborts without writing. But an aborted 60-game run is a skipped
  // hour, not a lost night — and merge semantics mean a carried-over
  // game can never be replaced by a worse copy of itself.
  const totalReqs = targets.length * (2 + steamids.length) + steamids.length + 1;
  if (!fetched.games.length || fetched.failed > Math.max(10, totalReqs * 0.15)) {
    return res.status(502).json({ error: `Steam throttled ${fetched.failed}/${totalReqs} requests — skipped this run` });
  }

  // ---- merge: fetched games win, everything else carries over ----
  const gotIds = new Set(fetched.games.map((g) => Number(g.appid)));
  const nowEpoch = Math.floor(Date.now() / 1000);
  const gameFetchedAt = { ...prevFetchMap };
  for (const id of gotIds) gameFetchedAt[id] = nowEpoch;
  for (const id of Object.keys(gameFetchedAt)) if (!clubIds.has(Number(id))) delete gameFetchedAt[id];
  const data = {
    games: [
      ...fetched.games,
      ...(prevPayload0?.games ?? []).filter((g) => !gotIds.has(Number(g.appid)) && clubIds.has(Number(g.appid))),
    ],
    profiles: { ...(prevPayload0?.profiles ?? {}), ...fetched.profiles },
    gameFetchedAt,
    failed: fetched.failed,
  };

  // ---- 3. write cache + snapshot rows ----
  // Club-local date, not UTC: the 10pm Eastern run is 02:00–03:00 UTC
  // *tomorrow*, so toISOString() stamped every snapshot one day ahead of
  // the evening it captured. en-CA formats as YYYY-MM-DD directly.
  // One-time effect at changeover: the first club-stamped run lands on
  // the same `day` as the last UTC-stamped one and upserts over it —
  // two evenings merge into one row, once, then history is clean.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rows = [];
  for (const g of data.games) {
    for (const sid of steamids) {
      const unlocks = g.players[sid];
      // LIBRARY SCOPE: a row per game the member OWNS (their
      // GetOwnedGames playtime map, fetched with every profile pass),
      // even with no achievement data yet — owned-but-untouched games
      // write unlocked=0 so snapshot_daily's sum(total) becomes each
      // member's library size, which is the Burndown chart's honest
      // denominator. The || keeps two safety nets: free games Steam
      // doesn't report as owned until first launch, and runs where the
      // ownership fetch failed (empty map = unknown, not "owns
      // nothing") degrade to the old started-games behavior instead of
      // dropping the member's rows for the day.
      const pt = data.profiles?.[sid]?.playtime ?? {};
      const owned = Object.keys(pt).length > 0 && pt[g.appid] !== undefined;
      if (!unlocks && !owned) continue;
      rows.push({
        day: today, steamid: sid, appid: g.appid,
        unlocked: unlocks?.length ?? 0, total: g.ach.length,
        complete: !!unlocks && unlocks.length === g.ach.length && g.ach.length > 0,
      });
    }
  }
  const prevFetchedAt = prevCache.data?.fetched_at ? Date.parse(prevCache.data.fetched_at) / 1000 : Date.now() / 1000 - 86400;
  // Writes must fail LOUDLY — a silent write failure here shows up later
  // as "slow loads + Discord re-announcing everything" with no error.
  const cacheWrite = await db.from("snapshot_cache").upsert({ id: 1, payload: data, fetched_at: new Date().toISOString() });
  if (cacheWrite.error)
    return res.status(500).json({ error: `snapshot_cache write failed: ${cacheWrite.error.message} — did you run supabase/migration-v4.sql?` });
  if (rows.length) {
    const rowWrite = await db.from("snapshots").upsert(rows);
    if (rowWrite.error)
      return res.status(500).json({ error: `snapshots write failed: ${rowWrite.error.message} — did you run supabase/migration-v4.sql?` });
  }

  // ---- 3.5 pioneer scan: record unlocks made while the WORLD was ≤ pioneerPct ----
  // Detected at ingest: if an unlock is new since last run and the
  // achievement's current global % is tiny, that player was verifiably
  // early — recorded permanently, immune to the % rising later.
  // First-ever scan backfills from all current sub-threshold unlocks.
  const pioneerPct = settingsRow.data?.data?.pioneerPct ?? 1.0;
  // previous run's per-achievement pct, for graduation detection
  const prevAchPct = new Map();
  for (const g of prevCache.data?.payload?.games ?? [])
    for (const a of g.ach) prevAchPct.set(`${g.appid}|${a.id}`, a.pct);
  const existingPio = await db.from("pioneers").select("steamid, appid, achid");
  const newPioneerKeys = new Set();
  if (!existingPio.error) {
    const have = new Set((existingPio.data ?? []).map((r) => `${r.steamid}|${r.appid}|${r.achid}`));
    const firstScan = (existingPio.data ?? []).length === 0;
    const inserts = [];
    for (const g of data.games) {
      const achById = Object.fromEntries(g.ach.map((a) => [a.id, a]));
      for (const [sid, unlocks] of Object.entries(g.players)) {
        for (const u of unlocks) {
          const a = achById[u.id];
          if (!a || a.pct <= 0 || a.pct > pioneerPct) continue;   // 0.0% = unknown, never counts
          const keyStr = `${sid}|${g.appid}|${u.id}`;
          if (have.has(keyStr)) continue;
          // GRADUATION: the achievement was unknown (0.0% / untracked) last
          // run and now has a real sub-threshold value — everyone already
          // holding it earned it while the world was at most this rare.
          const prevPct = prevAchPct.get(`${g.appid}|${u.id}`);
          const graduated = (prevPct === undefined || prevPct <= 0) && a.pct > 0;
          if (firstScan || u.t >= prevFetchedAt || graduated) {
            inserts.push({ steamid: sid, appid: g.appid, achid: u.id,
              unlocked_at: u.t ? new Date(u.t * 1000).toISOString() : null, pct_at_unlock: a.pct });
            if (!firstScan) newPioneerKeys.add(keyStr);
          }
        }
      }
    }
    if (inserts.length) {
      const w = await db.from("pioneers").upsert(inserts);
      if (w.error) return res.status(500).json({ error: `pioneers write failed: ${w.error.message} — run migration-v5.sql?` });
    }
  }

  // ---- 4. the diff (against the previous RUN, not the previous day) ----
  // The last run's full payload lives in snapshot_cache, so back-to-back
  // runs diff cleanly and skipped nights don't break anything. The
  // per-day snapshot rows are history-chart data, not diff data.
  const prevPayload = prevCache.data?.payload ?? null;
  const prevComplete = new Map();      // "sid|appid" -> was complete last run
  const prevTracked = new Set();       // appids that existed last run
  if (prevPayload?.games) {
    for (const g of prevPayload.games) {
      prevTracked.add(Number(g.appid));
      for (const [sid, unlocks] of Object.entries(g.players ?? {})) {
        prevComplete.set(`${sid}|${g.appid}`, unlocks.length === g.ach.length && g.ach.length > 0);
      }
    }
  }
  const nameOf = Object.fromEntries((members.data ?? []).map((m) => [m.steamid, m.name]));
  const gameName = Object.fromEntries((gamesList.data ?? []).map((g) => [g.appid, g.name]));
  const rarePct = settingsRow.data?.data?.notifyRarePct ?? 1.0;

  const embeds = [];
  // FIRST-RUN GUARD: no previous payload → establish the baseline
  // silently instead of announcing the club's entire history.
  const firstRun = !prevPayload;
  // completions: complete now, wasn't complete last run, and the game
  // was TRACKED last run (adding an already-beaten game isn't news)
  for (const r of firstRun ? [] : rows) {
    if (r.complete && prevTracked.has(Number(r.appid)) && !prevComplete.get(`${r.steamid}|${r.appid}`)) {
      embeds.push({
        title: `💯 ${nameOf[r.steamid]} perfected ${gameName[r.appid] ?? r.appid}!`,
        description: `${r.total} achievements, all of them. The shelf grows.`,
        color: 0xE8B84B,
      });
    }
  }
  // rare unlocks since last run
  for (const g of data.games) {
    const achById = Object.fromEntries(g.ach.map((a) => [a.id, a]));
    for (const [sid, unlocks] of Object.entries(g.players)) {
      for (const u of unlocks) {
        const a = achById[u.id];
        if (u.t >= prevFetchedAt && a && a.pct > 0 && a.pct <= rarePct) {
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
  // Monday (club time): contract week report + spin-day call —
  // posts Monday EVENING, wrapping the first day of the fresh week
  const isMonday = tzPart("weekday") === "Mon" && !isManual && hourNow === "22";
  if (isMonday) {
    const lastWeek = contracts.data?.filter((c) => {
      const epoch = Date.parse(c.accepted_at) / 1000;
      return nextMonday(epoch) * 1000 >= Date.now() - 86400000 && epoch < Date.now() / 1000;
    }) ?? [];
    const lines = lastWeek.map((c) => {
      const g = data.games.find((x) => x.appid === Number(c.appid));
      const holders = c.steamid ? [c.steamid] : steamids;
      const beaten = holders.some((sid) => {
        const un = g?.players[sid];
        return un && g && un.length === g.ach.length;
      });
      const who = c.steamid ? nameOf[c.steamid] : "the club";
      return `${beaten ? "✅" : "❌"} ${who} — ${gameName[c.appid] ?? c.appid} (${c.multiplier}×)`;
    });
    embeds.push({
      title: "🎡 SPIN DAY — the wheels are unlocked",
      description: (lines.length ? `Last week's contracts:\n${lines.join("\n")}\n\n` : "") +
        "Fresh contracts and a fresh bounty await. Get spinning.",
      color: 0x5CB8A6,
    });
  }

  // ---- 5. Discord ----
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook && embeds.length && !quiet) await postDiscord(webhook, embeds);

  const STALE_AFTER = 20 * 3600;   // "fresh" = fetched within ~a day
  const staleRemaining = appids.filter((a) => (gameFetchedAt[a] ?? 0) < nowEpoch - STALE_AFTER).length;
  return res.status(200).json({
    ok: true, snapshotted: rows.length, failedRequests: data.failed,
    fetchedGames: gotIds.size, carriedGames: data.games.length - gotIds.size, staleRemaining,
    prevRunAt: prevCache.data?.fetched_at ?? null, firstRun,
    notifications: embeds.length, discord: Boolean(webhook),
  });
}
