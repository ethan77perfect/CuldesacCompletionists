// ---------------------------------------------------------------
// /api/db v2.0 — Supabase storage: roster, games, settings, backlog.
//   GET  /api/db → { members, games, settings, backlog }
//   POST /api/db { op, clubKey, ... } → mutations (club key required)
// Ops: addMember, removeMember, addGame, removeGame, setAdjust,
//      toggleRace, setNotes, saveSettings,
//      proposeBacklog, voteBacklog, removeBacklog, promoteBacklog
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

// Real display name from the store API; schema names can be localized
// or placeholder junk (SteamTempHolder / ValveTestApp).
async function lookupGame(appid, steamKey) {
  const [schemaR, storeR] = await Promise.all([
    fetch(`${STEAM}/ISteamUserStats/GetSchemaForGame/v2/?key=${steamKey}&appid=${appid}`),
    fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&filters=basic`),
  ]);
  const j = await schemaR.json().catch(() => null);
  const storeJ = await storeR.json().catch(() => null);
  const schemaName = j?.game?.gameName;
  const storeName = storeJ?.[appid]?.success ? storeJ[appid]?.data?.name : null;
  const isPlaceholder = /steamtempholder|valvetestapp|untitled/i.test(schemaName ?? "");
  return {
    name: storeName ?? (isPlaceholder ? null : schemaName),
    achCount: j?.game?.availableGameStats?.achievements?.length ?? 0,
    known: Boolean(storeName || schemaName),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "STEAM_API_KEY", "CLUB_KEY"]
    .filter((name) => !process.env[name]);
  if (missing.length) {
    return res.status(500).json({
      error: `Missing environment variable(s): ${missing.join(", ")}. ` +
        `Add them in Vercel → Settings → Environment Variables, then Redeploy.`,
    });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    if (req.method === "GET") {
      const [members, games, settings, backlog] = await Promise.all([
        supabase.from("members").select("*").order("added_at"),
        supabase.from("games").select("*").order("added_at"),
        supabase.from("settings").select("data").eq("id", 1).maybeSingle(),
        supabase.from("backlog").select("*").order("added_at"),
      ]);
      const failed = [members, games, settings, backlog].find((r) => r.error);
      if (failed) {
        return res.status(500).json({
          error: `Database read failed: ${failed.error.message}. ` +
            `If tables/columns are missing, run the migration SQL in the Supabase SQL Editor.`,
        });
      }
      return res.status(200).json({
        members: members.data ?? [],
        games: games.data ?? [],
        settings: settings.data?.data ?? {},
        backlog: backlog.data ?? [],
      });
    }

    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    const { op, clubKey, ...body } = req.body ?? {};
    if (clubKey !== process.env.CLUB_KEY)
      return res.status(401).json({ error: "Wrong club key" });

    const steamKey = process.env.STEAM_API_KEY;
    const fail = (code, msg) => res.status(code).json({ error: msg });

    switch (op) {
      case "addMember": {
        const steamid = await resolveSteamId(body.idOrVanity, steamKey);
        if (!steamid) return fail(400, "Couldn't find that Steam profile");
        let name = body.name?.trim();
        if (!name) {
          const r = await fetch(`${STEAM}/ISteamUser/GetPlayerSummaries/v2/?key=${steamKey}&steamids=${steamid}`);
          const j = await r.json();
          name = j?.response?.players?.[0]?.personaname ?? steamid;
        }
        const { error } = await supabase.from("members").upsert({ steamid, name, color: body.color || "#E8B84B" });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true, steamid, name });
      }
      case "removeMember": {
        const { error } = await supabase.from("members").delete().eq("steamid", body.steamid);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "addGame": {
        const appid = parseAppId(body.appidOrUrl);
        if (!appid) return fail(400, "Paste a Steam store URL or an appid number");
        const g = await lookupGame(appid, steamKey);
        if (!g.known) return fail(400, "Steam doesn't recognize that appid");
        if (g.achCount === 0) return fail(400, `${g.name ?? "That game"} has no achievements to track`);
        const { error } = await supabase.from("games").upsert({ appid: Number(appid), name: g.name ?? `App ${appid}` });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true, appid, name: g.name ?? `App ${appid}`, achCount: g.achCount });
      }
      case "removeGame": {
        const { error } = await supabase.from("games").delete().eq("appid", body.appid);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "setAdjust": {
        const adjust = Math.max(-9, Math.min(9, parseInt(body.adjust, 10) || 0));
        const { error } = await supabase.from("games").update({ adjust }).eq("appid", body.appid);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true, adjust });
      }
      case "toggleRace": {
        const { error } = await supabase.from("games").update({ race: Boolean(body.race) }).eq("appid", body.appid);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "setNotes": {
        const notes = String(body.notes ?? "").slice(0, 4000);
        const { error } = await supabase.from("games").update({ notes }).eq("appid", body.appid);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "saveSettings": {
        const { error } = await supabase.from("settings").upsert({ id: 1, data: body.data });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "proposeBacklog": {
        const appid = parseAppId(body.appidOrUrl);
        if (!appid) return fail(400, "Paste a Steam store URL or an appid number");
        const g = await lookupGame(appid, steamKey);
        if (!g.known) return fail(400, "Steam doesn't recognize that appid");
        if (g.achCount === 0) return fail(400, `${g.name ?? "That game"} has no achievements to track`);
        const { error } = await supabase.from("backlog").upsert({
          appid: Number(appid), name: g.name ?? `App ${appid}`,
          proposed_by: body.proposedBy ?? null,
        });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true, name: g.name });
      }
      case "voteBacklog": {
        const { data, error } = await supabase.from("backlog").select("votes").eq("appid", body.appid).single();
        if (error) return fail(500, error.message);
        const votes = new Set(data.votes ?? []);
        votes.has(body.steamid) ? votes.delete(body.steamid) : votes.add(body.steamid);
        const { error: e2 } = await supabase.from("backlog").update({ votes: [...votes] }).eq("appid", body.appid);
        if (e2) return fail(500, e2.message);
        return res.status(200).json({ ok: true, votes: votes.size });
      }
      case "removeBacklog": {
        const { error } = await supabase.from("backlog").delete().eq("appid", body.appid);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "promoteBacklog": {
        const g = await lookupGame(body.appid, steamKey);
        const { error } = await supabase.from("games").upsert({ appid: Number(body.appid), name: g.name ?? `App ${body.appid}` });
        if (error) return fail(500, error.message);
        await supabase.from("backlog").delete().eq("appid", body.appid);
        return res.status(200).json({ ok: true, name: g.name });
      }
      default:
        return fail(400, `Unknown op '${op}'`);
    }
  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
