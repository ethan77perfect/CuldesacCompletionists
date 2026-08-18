// ---------------------------------------------------------------
// /api/refresh — read-through sync: the page's live layer.
//
// The old model made every visitor's BROWSER fetch anything the
// nightly cache lacked — and browsers can't write the cache, so the
// same games were re-fetched by every visitor, on every visit,
// forever (the "96 missing games" era). This endpoint inverts that:
// the SERVER fetches whatever is stale, merges it into
// snapshot_cache once, and every subsequent visitor reads it for
// free. New games and new members appear site-wide on the first
// page view after the change, with no nightly wait and no manual
// cron runs.
//
// Contract per call:
//   nothing stale       → { ok, fresh: true, staleRemaining: 0 }   (cheap no-op)
//   something stale     → fetch up to GAME_BUDGET stalest games,
//                         merge, CAS-write, announce discoveries,
//                         upsert today's snapshot rows, return the
//                         merged payload + staleRemaining
//   Steam throttled     → 502 { throttled: true } — nothing written
//
// The client polls until staleRemaining hits 0 (a few calls after a
// roster change; zero calls when everything is fresh). Concurrency:
// writes are compare-and-swap on the version column (migration-v11);
// a losing writer re-reads, re-merges its fetched games into the
// winner's payload, and drops any announcements the winner already
// watermarked. Discord announcements (💯 / 💎 / 🚩) fire from here
// too — the club hears about a 2pm perfect at 2pm, and the per-game
// watermark keeps the 10pm cron from repeating it.
// ---------------------------------------------------------------

export const config = { maxDuration: 60 };

import { createClient } from "@supabase/supabase-js";
import { fetchClubData, fetchRecentAppids } from "../lib/steamFetch.js";
import { computeTargets, mergePayload, buildSnapshotRows, diffAnnouncements, casWriteCache } from "../lib/clubSync.js";

const CLUB_TZ = "America/New_York";
const GAME_BUDGET = 36;          // ≈ 440 Steam calls at 10 members — fast, throttle-safe
const STALE_AFTER = 6 * 3600;    // dormant games: touched within 6h don't refetch
const HOT_STALE = 12 * 60;       // actively-played games go stale in minutes — unlocks surface fast
const RECENT_EVERY = 5 * 60;     // re-ask Steam "who's playing what" at most every 5 min (1 call/member)

async function postDiscord(webhook, embeds) {
  for (let i = 0; i < embeds.length; i += 10) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "The 100% Club", embeds: embeds.slice(i, i + 10) }),
    }).catch(() => {});
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: "STEAM_API_KEY not set" });
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const [members, gamesList, settingsRow, cacheRow] = await Promise.all([
    db.from("members").select("*"),
    db.from("games").select("*"),
    db.from("settings").select("data").eq("id", 1).maybeSingle(),
    db.from("snapshot_cache").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (members.error || gamesList.error)
    return res.status(500).json({ error: "DB read failed — run migration-v4.sql?" });

  const steamids = (members.data ?? []).map((m) => m.steamid);
  const appids = (gamesList.data ?? []).map((g) => String(g.appid));
  if (!steamids.length || !appids.length)
    return res.status(200).json({ ok: true, fresh: true, staleRemaining: 0 });

  const nowEpoch = Math.floor(Date.now() / 1000);
  let prevRow = cacheRow.data ?? null;
  let prevPayload = prevRow?.payload ?? null;

  // ---- who's actively playing? (cached in the payload, 5-min TTL) ----
  let recentAppids = prevPayload?.recentAppids ?? [];
  let recentCheckedAt = prevPayload?.recentCheckedAt ?? 0;
  let recentUpdated = false;
  if (nowEpoch - recentCheckedAt >= RECENT_EVERY) {
    try {
      recentAppids = await fetchRecentAppids(key, steamids);
      recentCheckedAt = nowEpoch; recentUpdated = true;
    } catch { /* keep the stale set — hot games degrade to the slow clock, nothing breaks */ }
  }
  const clubIdSet = new Set(appids.map(String));
  const hotIds = new Set(recentAppids.map(String).filter((a) => clubIdSet.has(a)));

  const { targets, staleCount } = computeTargets(prevPayload?.gameFetchedAt ?? {}, appids,
    { budget: GAME_BUDGET, staleAfterSec: STALE_AFTER, nowEpoch, hotIds, hotStaleAfterSec: HOT_STALE });

  if (!targets.length) {
    // nothing to fetch — but persist a refreshed recent-set so the next
    // caller inside the TTL doesn't re-ask Steam (best-effort CAS; a
    // lost race just means someone else wrote something newer)
    if (recentUpdated && prevRow) {
      await casWriteCache(db, prevRow, { ...prevPayload, recentAppids, recentCheckedAt });
    }
    return res.status(200).json({ ok: true, fresh: true, staleRemaining: 0, hot: hotIds.size,
      payloadFetchedAt: prevRow?.fetched_at ?? null });
  }

  // ---- fetch just the stale slice ----
  const fetched = await fetchClubData(key, steamids, targets, { concurrency: 5 });
  const totalReqs = targets.length * (2 + steamids.length) + steamids.length + 1;
  if (!fetched.games.length || fetched.failed > Math.max(10, totalReqs * 0.15)) {
    return res.status(502).json({ throttled: true,
      error: `Steam throttled ${fetched.failed}/${totalReqs} requests — try again shortly` });
  }

  const clubIds = new Set(appids.map(Number));
  let { payload, gotIds } = mergePayload(prevPayload, fetched, clubIds, nowEpoch);
  payload.recentAppids = recentAppids; payload.recentCheckedAt = recentCheckedAt;

  // ---- discoveries: pioneers + announcements, per-game watermarks ----
  const existingPio = await db.from("pioneers").select("steamid, appid, achid");
  const existingPioneerKeys = new Set((existingPio.data ?? []).map((r) => `${r.steamid}|${r.appid}|${r.achid}`));
  const pioneerFirstScan = !existingPio.error && existingPioneerKeys.size === 0;
  const cfg = settingsRow.data?.data ?? {};
  let ann = diffAnnouncements({
    prevPayload, fetchedGames: fetched.games, nowEpoch,
    nameOf: Object.fromEntries((members.data ?? []).map((m) => [m.steamid, m.name])),
    gameName: Object.fromEntries((gamesList.data ?? []).map((g) => [g.appid, g.name])),
    rarePct: cfg.notifyRarePct ?? 1.0, pioneerPct: cfg.pioneerPct ?? 1.0,
    existingPioneerKeys, pioneerFirstScan,
  });
  payload.announceWatermark = { ...payload.announceWatermark, ...ann.watermark };

  // ---- persist: CAS, one retry on a lost race ----
  let wrote = await casWriteCache(db, prevRow, payload);
  if (!wrote) {
    const again = await db.from("snapshot_cache").select("*").eq("id", 1).maybeSingle();
    prevRow = again.data ?? null;
    const winnersMark = prevRow?.payload?.announceWatermark ?? {};
    // drop announcements + pioneer inserts the winning writer already covered
    const covered = new Set(fetched.games.filter((g) => (winnersMark[g.appid] ?? 0) >= nowEpoch).map((g) => Number(g.appid)));
    if (covered.size) {
      ann = { ...ann, embeds: [], pioneerInserts: ann.pioneerInserts.filter((p) => !covered.has(Number(p.appid))) };
    }
    ({ payload } = mergePayload(prevRow?.payload ?? null, fetched, clubIds, nowEpoch));
    payload.announceWatermark = { ...payload.announceWatermark, ...ann.watermark };
    payload.recentAppids = recentAppids; payload.recentCheckedAt = recentCheckedAt;
    wrote = await casWriteCache(db, prevRow, payload);
  }

  if (ann.pioneerInserts.length) await db.from("pioneers").upsert(ann.pioneerInserts);
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook && ann.embeds.length && wrote) await postDiscord(webhook, ann.embeds);

  // ---- keep today's history row live-accurate, not 10pm-only ----
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rows = buildSnapshotRows(payload, steamids, today);
  if (rows.length) await db.from("snapshots").upsert(rows);

  const staleRemaining = Math.max(0, staleCount - gotIds.size);
  return res.status(200).json({
    ok: true, fetchedGames: gotIds.size, staleRemaining, hot: hotIds.size,
    persisted: wrote, payload, payloadFetchedAt: prevRow?.fetched_at ?? null,
  });
}
