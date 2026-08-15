// /api/history — daily per-player aggregates from snapshots (last 120 days).
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  // .limit matters: Supabase/PostgREST silently caps un-limited selects at
  // 1000 rows. snapshot_daily emits (members × days) rows — at 10 members
  // that's a 100-day ceiling, and with .order("day") ascending the rows
  // silently dropped would be the NEWEST. 5000 covers 41 members × 120 days.
  const { data, error } = await db.from("snapshot_daily").select("*").gte("day", since).order("day").limit(5000);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ rows: data ?? [] });
}
