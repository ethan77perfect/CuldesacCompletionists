// ---------------------------------------------------------------
// /api/db — everything stored in Supabase: the club roster, the
// tracked game list, and the saved scoring rules.
//
//   GET  /api/db                      → { members, games, settings }
//   POST /api/db  { op, clubKey, ...} → mutations (club key required)
//
// Ops: addMember { idOrVanity, name, color }
//      removeMember { steamid }
//      addGame { appidOrUrl }
//      removeGame { appid }
//      saveSettings { data }
// ---------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const STEAM = "https://api.steampowered.com";

async function resolveSteamId(idOrVanity, key) {
  const raw = idOrVanity.trim().replace(/\/+$/, "");
  const tail = raw.split("/").pop();
  if (/^\d{17}$/.test(tail)) return tail;
  const r = await fetch(
    `${STEAM}/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(tail)}`
  );
  const j = await r.json();
  return j?.response?.success === 1 ? j.response.steamid : null;
}

function parseAppId(appidOrUrl) {
  const raw = String(appidOrUrl).trim();
  if (/^\d+$/.test(raw)) return raw;
  const m = raw.match(/\/app\/(\d+)/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ---- fail loudly and readably if setup is incomplete ----
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "STEAM_API_KEY", "CLUB_KEY"]
    .filter((name) => !process.env[name]);
  if (missing.length) {
    return res.status(500).json({
      error: `Missing environment variable(s): ${missing.join(", ")}. ` +
        `Add them in Vercel → Settings → Environment Variables, then Redeploy.`,
    });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    if (req.method === "GET") {
      const [members, games, settings] = await Promise.all([
        supabase.from("members").select("*").order("added_at"),
        supabase.from("games").select("*").order("added_at"),
        supabase.from("settings").select("data").eq("id", 1).maybeSingle(),
      ]);
      const failed = [members, games, settings].find((r) => r.error);
      if (failed) {
        return res.status(500).json({
          error: `Database read failed: ${failed.error.message}. ` +
            `If tables are missing, run supabase/schema.sql in the Supabase SQL Editor.`,
        });
      }
      return res.status(200).json({
        members: members.data ?? [],
        games: games.data ?? [],
        settings: settings.data?.data ?? {},
      });
    }

    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    const { op, clubKey, ...body } = req.body ?? {};
    if (clubKey !== process.env.CLUB_KEY)
      return res.status(401).json({ error: "Wrong club key" });

    const steamKey = process.env.STEAM_API_KEY;

    switch (op) {
      case "addMember": {
        const steamid = await resolveSteamId(body.idOrVanity, steamKey);
        if (!steamid)
          return res.status(400).json({ error: "Couldn't find that Steam profile" });
        let name = body.name?.trim();
        if (!name) {
          const r = await fetch(
            `${STEAM}/ISteamUser/GetPlayerSummaries/v2/?key=${steamKey}&steamids=${steamid}`
          );
          const j = await r.json();
          name = j?.response?.players?.[0]?.personaname ?? steamid;
        }
        const { error } = await supabase.from("members").upsert({
          steamid, name, color: body.color || "#E8B84B",
        });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true, steamid, name });
      }
      case "removeMember": {
        const { error } = await supabase.from("members").delete().eq("steamid", body.steamid);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
      }
      case "addGame": {
        const appid = parseAppId(body.appidOrUrl);
        if (!appid)
          return res.status(400).json({ error: "Paste a Steam store URL or an appid number" });
        const r = await fetch(
          `${STEAM}/ISteamUserStats/GetSchemaForGame/v2/?key=${steamKey}&appid=${appid}`
        );
        const j = await r.json();
        const name = j?.game?.gameName;
        const achCount = j?.game?.availableGameStats?.achievements?.length ?? 0;
        if (!name)
          return res.status(400).json({ error: "Steam doesn't recognize that appid" });
        if (achCount === 0)
          return res.status(400).json({ error: `${name} has no achievements to track` });
        const { error } = await supabase.from("games").upsert({ appid: Number(appid), name });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true, appid, name, achCount });
      }
      case "removeGame": {
        const { error } = await supabase.from("games").delete().eq("appid", body.appid);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
      }
      case "setAdjust": {
        const adjust = Math.max(-3, Math.min(3, parseInt(body.adjust, 10) || 0));
        const { error } = await supabase.from("games").update({ adjust }).eq("appid", body.appid);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true, adjust });
      }
      case "saveSettings": {
        const { error } = await supabase.from("settings").upsert({ id: 1, data: body.data });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
      }
      default:
        return res.status(400).json({ error: `Unknown op '${op}'` });
    }
  } catch (err) {
    // Whatever happens, the frontend gets JSON — never a crash page.
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
