// ---------------------------------------------------------------
// /api/club — live raw achievement data for a batch of games.
// The heavy lifting lives in lib/steamFetch.js (shared with the
// nightly cron). Called in small batches by the frontend for the
// background refresh; first paint comes from /api/cached.
// ---------------------------------------------------------------

export const config = { maxDuration: 60 };

import { fetchClubData } from "../lib/steamFetch.js";

export default async function handler(req, res) {
  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: "STEAM_API_KEY not set" });

  const steamids = (req.query.steamids || "").split(",").filter((s) => /^\d{17}$/.test(s));
  const appids = (req.query.appids || "").split(",").filter((s) => /^\d+$/.test(s));
  const withProfiles = req.query.profiles !== "0";
  if (!steamids.length || !appids.length)
    return res.status(400).json({ error: "steamids and appids are required" });

  const { games, profiles, failed } = await fetchClubData(key, steamids, appids, { withProfiles, concurrency: 5 });

  res.setHeader("Cache-Control", failed === 0 ? "s-maxage=300, stale-while-revalidate=600" : "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({ games, profiles, failed });
}
