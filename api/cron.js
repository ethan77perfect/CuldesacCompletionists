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
import { computeTargets, mergePayload, buildSnapshotRows, diffAnnouncements, casWriteCache } from "../lib/clubSync.js";

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
  const clubIds = new Set(appids.map(Number));
  const nowEpoch = Math.floor(Date.now() / 1000);
  // 20h freshness skip: the 11pm pass won't redo the 10pm pass's games,
  // and a day of /api/refresh traffic means the cron often has little
  // left to do — which is the point.
  const { targets } = computeTargets(prevPayload0?.gameFetchedAt ?? {}, appids,
    { budget: GAME_BUDGET, staleAfterSec: 20 * 3600, nowEpoch });
  if (!targets.length) {
    // everything fresh — still do the daily duties on the payload we have
  }
  const fetched = targets.length
    ? await fetchClubData(key, steamids, targets, { concurrency: 5 })
    : { games: [], profiles: {}, failed: 0 };

  // ---- 2. never MERGE garbage ----
  // The guard survives, per-run: a total wipeout or heavy throttling
  // aborts without writing. But an aborted 60-game run is a skipped
  // hour, not a lost night — and merge semantics mean a carried-over
  // game can never be replaced by a worse copy of itself.
  const totalReqs = targets.length * (2 + steamids.length) + steamids.length + 1;
  if (targets.length && (!fetched.games.length || fetched.failed > Math.max(10, totalReqs * 0.15))) {
    return res.status(502).json({ error: `Steam throttled ${fetched.failed}/${totalReqs} requests — skipped this run` });
  }

  // ---- merge: fetched games win, everything else carries over ----
  const merged = mergePayload(prevPayload0, fetched, clubIds, nowEpoch);
  const gotIds = merged.gotIds;
  const data = merged.payload;
  data.failed = fetched.failed;

  // ---- 3. write cache + snapshot rows ----
  // Club-local date, not UTC: the 10pm Eastern run is 02:00–03:00 UTC
  // *tomorrow*, so toISOString() stamped every snapshot one day ahead of
  // the evening it captured. en-CA formats as YYYY-MM-DD directly.
  // One-time effect at changeover: the first club-stamped run lands on
  // the same `day` as the last UTC-stamped one and upserts over it —
  // two evenings merge into one row, once, then history is clean.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rows = buildSnapshotRows(data, steamids, today);
  // Writes must fail LOUDLY — a silent write failure here shows up later
  // as "slow loads + Discord re-announcing everything" with no error.
  // CAS because /api/refresh may be writing concurrently (migration-v11).
  let wrote = await casWriteCache(db, prevCache.data ?? null, data, { touchFetchedAt: true });
  if (!wrote) {
    const again = await db.from("snapshot_cache").select("*").eq("id", 1).maybeSingle();
    const remerged = mergePayload(again.data?.payload ?? null, fetched, clubIds, nowEpoch);
    remerged.payload.announceWatermark = { ...remerged.payload.announceWatermark, ...ann.watermark };
    wrote = await casWriteCache(db, again.data ?? null, remerged.payload, { touchFetchedAt: true });
  }
  if (!wrote)
    return res.status(500).json({ error: "snapshot_cache write failed twice (CAS) — did you run supabase/migration-v11.sql?" });
  if (rows.length) {
    const rowWrite = await db.from("snapshots").upsert(rows);
    if (rowWrite.error)
      return res.status(500).json({ error: `snapshots write failed: ${rowWrite.error.message} — did you run supabase/migration-v4.sql?` });
  }

  // ---- 3.5 discoveries: pioneers + completion/rare embeds ----
  // Shared with /api/refresh: per-game announce watermarks mean a
  // perfect the 2pm refresh already posted is invisible to this run.
  const existingPio = await db.from("pioneers").select("steamid, appid, achid");
  const existingPioneerKeys = new Set((existingPio.data ?? []).map((r) => `${r.steamid}|${r.appid}|${r.achid}`));
  const pioneerFirstScan = !existingPio.error && existingPioneerKeys.size === 0;
  const nameOf = Object.fromEntries((members.data ?? []).map((m) => [m.steamid, m.name]));
  const gameName = Object.fromEntries((gamesList.data ?? []).map((g) => [g.appid, g.name]));
  const ann = diffAnnouncements({
    prevPayload: prevPayload0, fetchedGames: fetched.games, nowEpoch,
    nameOf, gameName,
    rarePct: settingsRow.data?.data?.notifyRarePct ?? 1.0,
    pioneerPct: settingsRow.data?.data?.pioneerPct ?? 1.0,
    existingPioneerKeys, pioneerFirstScan,
  });
  data.announceWatermark = { ...data.announceWatermark, ...ann.watermark };
  if (ann.pioneerInserts.length) {
    const w = await db.from("pioneers").upsert(ann.pioneerInserts);
    if (w.error) return res.status(500).json({ error: `pioneers write failed: ${w.error.message} — run migration-v5.sql?` });
  }
  const embeds = [...ann.embeds];

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
    prevRunAt: prevCache.data?.fetched_at ?? null, firstRun: !prevPayload0,
    notifications: embeds.length, discord: Boolean(webhook),
  });
}
