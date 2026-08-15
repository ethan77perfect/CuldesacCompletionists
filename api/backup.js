// ---------------------------------------------------------------
// /api/backup — download the club's data as JSON files.
//
// Why this exists: the free Supabase tier has NO automatic backups —
// the club's entire history lives as exactly one copy. This endpoint
// turns "one copy" into "as many copies as you download."
//
// Two kinds of file, because two kinds of data:
//   /api/backup                     → CORE: every human-decision table
//       (members, games, settings, contracts, century picks, covers,
//       challenges, claims, hunts, backlog, pioneers, bingo). This is
//       the irreplaceable part — Steam can regenerate achievement
//       data, but nothing can regenerate your curation. Stays tiny
//       (KBs) forever.
//   /api/backup?snapshots=YYYY-MM   → HISTORY: that month's snapshot
//       rows, compact array-of-arrays. Chunked monthly so responses
//       stay far under Vercel's ~4.5 MB body limit at any club size.
//   /api/backup?manifest=1          → which months exist, so you know
//       what to grab.
//
// snapshot_cache is deliberately NOT backed up: the cron regenerates
// it nightly from Steam — it's a cache, not a record.
//
// Restore story: these files are literal row arrays. If disaster ever
// strikes, re-inserting them is a short scripting session against
// this exact format — the hard part (having the data at all) is done.
//
// Auth: none, matching the site's read posture — GET /api/db and
// /api/history already serve this data unauthenticated. Backups add
// no new exposure; they just add download headers.
// ---------------------------------------------------------------

export const config = { maxDuration: 60 };

import { createClient } from "@supabase/supabase-js";

// PostgREST silently caps any single select at 1000 rows — the same
// cap that nearly ate the Burndown chart. Page with .range() until a
// short page. Takes a query FACTORY: builders are single-use.
async function allRows(makeQuery, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await makeQuery().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < page) break;
  }
  return out;
}

const CORE_TABLES = [
  "members", "games", "settings", "backlog", "contracts", "hunts",
  "challenges", "claims", "pioneers", "century", "covers",
  "bingo_rounds", "bingo_cards",
];

const monthWindow = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    since: `${y}-${pad(m)}-01`,
    until: m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`,
  };
};

const monthsBetween = (a, b) => {   // "YYYY-MM-DD" → ["YYYY-MM", ...] inclusive
  const out = [];
  let [y, m] = a.slice(0, 7).split("-").map(Number);
  const [ey, em] = b.slice(0, 7).split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
};

export default async function handler(req, res) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  res.setHeader("Access-Control-Allow-Origin", "*");
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    // ---- manifest: which snapshot months exist ----
    if (req.query.manifest) {
      const first = await db.from("snapshots").select("day").order("day", { ascending: true }).limit(1);
      const last = await db.from("snapshots").select("day").order("day", { ascending: false }).limit(1);
      if (first.error || last.error)
        return res.status(500).json({ error: (first.error ?? last.error).message });
      const months = first.data?.length ? monthsBetween(first.data[0].day, last.data[0].day) : [];
      return res.status(200).json({
        months,
        core: "/api/backup",
        month_url: "/api/backup?snapshots=YYYY-MM",
        note: "Core is the irreplaceable part — grab it after big curation sessions. Months are history chunks.",
      });
    }

    // ---- one month of snapshot history, compact ----
    if (req.query.snapshots) {
      const ym = String(req.query.snapshots);
      if (!/^\d{4}-\d{2}$/.test(ym))
        return res.status(400).json({ error: "snapshots must be YYYY-MM" });
      const { since, until } = monthWindow(ym);
      const rows = await allRows(() =>
        db.from("snapshots").select("day, steamid, appid, unlocked, total, complete")
          .gte("day", since).lt("day", until).order("day"));
      // Compact on purpose: day-grouped, steamids indexed once. A flat
      // array-of-objects month brushes Vercel's ~4.5 MB response limit
      // at only ~3× this club's size; this format keeps several-fold
      // growth headroom. Restore = walk days, map index → steamid.
      const steamids = [...new Set(rows.map((r) => r.steamid))];
      const idx = new Map(steamids.map((s, i) => [s, i]));
      const days = {};
      for (const r of rows)
        (days[r.day] ??= []).push([idx.get(r.steamid), r.appid, r.unlocked, r.total, r.complete]);
      res.setHeader("Content-Disposition", `attachment; filename="club-backup-snapshots-${ym}.json"`);
      return res.status(200).json({
        kind: "snapshots", month: ym, generated_at: new Date().toISOString(), row_count: rows.length,
        steamids,
        format: "days: { 'YYYY-MM-DD': [[steamidIndex, appid, unlocked, total, complete], ...] }",
        days,
      });
    }

    // ---- core: every human-decision table ----
    const tables = {}, missing = [];
    for (const t of CORE_TABLES) {
      try {
        tables[t] = await allRows(() => db.from(t).select("*"));
      } catch (e) {
        missing.push(t);   // pre-migration DBs lack newer tables — note it, don't fail the backup
      }
    }
    res.setHeader("Content-Disposition", `attachment; filename="club-backup-core-${stamp}.json"`);
    return res.status(200).json({
      kind: "core", generated_at: new Date().toISOString(),
      row_counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
      ...(missing.length ? { missing_tables: missing } : {}),
      tables,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
