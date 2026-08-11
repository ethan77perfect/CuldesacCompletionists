// ---------------------------------------------------------------
// /api/cron — the club's nightly heartbeat.
//
// Scheduled by vercel.json (daily, 08:00 UTC ≈ small hours US).
// Manual test: open /api/cron?secret=YOUR_CRON_SECRET in a browser
// (if CRON_SECRET isn't set, any request is allowed — set it!).
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

  // ---- 1. the big fetch ----
  const data = await fetchClubData(key, steamids, appids, { concurrency: 5 });

  // ---- 2. never snapshot garbage ----
  const totalReqs = appids.length * (2 + steamids.length) + steamids.length + 1;
  if (data.failed > Math.max(10, totalReqs * 0.05)) {
    return res.status(502).json({ error: `Steam throttled ${data.failed}/${totalReqs} requests — skipped this run` });
  }

  // ---- 3. write cache + snapshot rows ----
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  for (const g of data.games) {
    for (const sid of steamids) {
      const unlocks = g.players[sid];
      if (!unlocks) continue;
      rows.push({
        day: today, steamid: sid, appid: g.appid,
        unlocked: unlocks.length, total: g.ach.length,
        complete: unlocks.length === g.ach.length && g.ach.length > 0,
      });
    }
  }
  const prevFetchedAt = prevCache.data?.fetched_at ? Date.parse(prevCache.data.fetched_at) / 1000 : Date.now() / 1000 - 86400;
  await db.from("snapshot_cache").upsert({ id: 1, payload: data, fetched_at: new Date().toISOString() });
  if (rows.length) await db.from("snapshots").upsert(rows);

  // ---- 4. the diff ----
  const { data: prevDays } = await db.from("snapshots").select("day").lt("day", today)
    .order("day", { ascending: false }).limit(1);
  const prevDay = prevDays?.[0]?.day;
  const prevRows = prevDay
    ? (await db.from("snapshots").select("*").eq("day", prevDay)).data ?? []
    : [];
  const prevMap = new Map(prevRows.map((r) => [`${r.steamid}|${r.appid}`, r]));
  const nameOf = Object.fromEntries((members.data ?? []).map((m) => [m.steamid, m.name]));
  const gameName = Object.fromEntries((gamesList.data ?? []).map((g) => [g.appid, g.name]));
  const rarePct = settingsRow.data?.data?.notifyRarePct ?? 1.0;

  const embeds = [];
  // completions: complete today, wasn't before
  for (const r of rows) {
    const prev = prevMap.get(`${r.steamid}|${r.appid}`);
    if (r.complete && !(prev?.complete)) {
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
        if (u.t >= prevFetchedAt && a && a.pct <= rarePct) {
          embeds.push({
            title: `💎 ${nameOf[sid]} unlocked "${a.name}"`,
            description: `${g.name} — only **${a.pct.toFixed(2)}%** of players have this.`,
            color: 0xB48CE0,
          });
        }
      }
    }
  }
  // Monday: contract week report + spin-day call
  const isMonday = new Date().getUTCDay() === 1;
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
  if (webhook && embeds.length) await postDiscord(webhook, embeds);

  return res.status(200).json({
    ok: true, snapshotted: rows.length, failedRequests: data.failed,
    notifications: embeds.length, discord: Boolean(webhook),
  });
}
