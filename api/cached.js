// /api/cached — last night's full club payload, for instant page loads.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db.from("snapshot_cache").select("*").eq("id", 1).maybeSingle();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(200).json({ payload: null });
  return res.status(200).json({ payload: data.payload, fetched_at: data.fetched_at });
}
