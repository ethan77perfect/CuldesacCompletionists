// ---------------------------------------------------------------
// /api/db v2.0 — Supabase storage: roster, games, settings, backlog.
//   GET  /api/db → { members, games, settings, backlog }
//   POST /api/db { op, clubKey, ... } → mutations (club key required)
// Ops: addMember, removeMember, addGame, removeGame, setHours,
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
      const [members, games, settings, backlog, contracts, hunts, challenges, claims, pioneers, century, covers, bingoRounds, bingoCards] = await Promise.all([
        supabase.from("members").select("*").order("added_at"),
        supabase.from("games").select("*").order("added_at"),
        supabase.from("settings").select("data").eq("id", 1).maybeSingle(),
        supabase.from("backlog").select("*").order("added_at"),
        supabase.from("contracts").select("*").order("accepted_at"),
        supabase.from("hunts").select("*").order("month", { ascending: false }),
        supabase.from("challenges").select("*").order("created_at"),
        supabase.from("claims").select("*").order("claimed_at"),
        supabase.from("pioneers").select("*"),
        supabase.from("century").select("*").order("added_at"),
        supabase.from("covers").select("*"),
        supabase.from("bingo_rounds").select("*").order("created_at"),
        supabase.from("bingo_cards").select("*"),
      ]);
      const failed = [members, games, settings, backlog, contracts, hunts, challenges, claims].find((r) => r.error);
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
        contracts: contracts.data ?? [],
        hunts: hunts.data ?? [],
        challenges: challenges.data ?? [],
        claims: claims.data ?? [],
        pioneers: pioneers.error ? [] : (pioneers.data ?? []),   // tolerate pre-v5 DBs
        century: century.error ? [] : (century.data ?? []),       // tolerate pre-v6 DBs
        covers: covers.error ? [] : (covers.data ?? []),          // tolerate pre-v7 DBs
        bingoRounds: bingoRounds.error ? [] : (bingoRounds.data ?? []),   // tolerate pre-v9 DBs
        bingoCards: bingoCards.error ? [] : (bingoCards.data ?? []),      // tolerate pre-v9 DBs
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
      case "setHours": {
        // Median hours-to-complete: the ONE human input the v2 scoring
        // engine needs. null clears it (game returns to ⏱ unrated).
        const raw = body.hours;
        const hours = raw === null || raw === "" || raw === undefined
          ? null
          : Math.max(0.1, Math.min(2000, Number(raw)));
        if (hours !== null && !Number.isFinite(hours))
          return fail(400, "hours must be a number (or null to clear)");
        const { error } = await supabase.from("games").update({ hours_median: hours }).eq("appid", body.appid);
        if (error) return fail(500, `${error.message} — run supabase/migration-v10.sql?`);
        return res.status(200).json({ ok: true, hours });
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
      // ---- wheel contracts ----
      case "addCentury": {
        // hard cap: a century is exactly 100 dreams, no more
        const { count, error: cErr } = await supabase.from("century")
          .select("*", { count: "exact", head: true }).eq("steamid", body.steamid);
        if (cErr) return fail(500, cErr.message + " — run migration-v6.sql?");
        if ((count ?? 0) >= 100) return fail(400, "That century is full (100/100) — remove something first.");
        const { error } = await supabase.from("century").upsert({
          steamid: body.steamid, appid: Number(body.appid), name: String(body.name ?? `App ${body.appid}`).slice(0, 120),
        });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "setCover": {
        const appid = Number(body.appid);
        const url = String(body.url ?? "").trim();
        if (!url) {   // empty = back to Steam's default art
          const { error } = await supabase.from("covers").delete().eq("appid", appid);
          if (error) return fail(500, error.message);
          return res.status(200).json({ ok: true });
        }
        if (!/^https?:\/\//.test(url)) return fail(400, "Cover must be a full http(s) image URL");
        const { error } = await supabase.from("covers").upsert({ appid, url: url.slice(0, 500), updated_at: new Date().toISOString() });
        if (error) return fail(500, error.message + " — run migration-v7.sql?");
        return res.status(200).json({ ok: true });
      }
      case "setCenturyFun": {
        const fun = Math.max(0, Math.min(5, Number(body.fun) || 0));
        const { error } = await supabase.from("century").update({ fun })
          .eq("steamid", body.steamid).eq("appid", Number(body.appid));
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "removeCentury": {
        const { error } = await supabase.from("century").delete()
          .eq("steamid", body.steamid).eq("appid", Number(body.appid));
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "createContract": {
        const { error } = await supabase.from("contracts").insert({
          steamid: body.steamid ?? null,                 // null = public bounty
          appid: Number(body.appid),
          multiplier: body.source === "public" ? 2.0 : 1.5,
          source: body.source === "public" ? "public" : "personal",
        });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "abandonContract": {
        const { error } = await supabase.from("contracts").delete().eq("id", body.id);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      // ---- monthly hunts ----
      case "createHunt": {
        if (!/^\d{4}-\d{2}$/.test(body.month ?? "")) return fail(400, "month must be YYYY-MM");
        if (!Array.isArray(body.achievements) || !body.achievements.length)
          return fail(400, "No achievements selected");
        const { error } = await supabase.from("hunts").upsert({
          month: body.month, appids: body.appids, achievements: body.achievements, status: "active",
        });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "finishHunt": {
        const { error } = await supabase.from("hunts")
          .update({ status: "finished", final: body.final ?? null }).eq("month", body.month);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "deleteHunt": {
        const { error } = await supabase.from("hunts").delete().eq("month", body.month);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      // ---- custom challenges (honor system) ----
      case "addChallenge": {
        if (!body.title?.trim()) return fail(400, "Challenge needs a title");
        const difficulty = Math.max(1, Math.min(10, parseInt(body.difficulty, 10) || 5));
        const { error } = await supabase.from("challenges").insert({
          title: body.title.trim().slice(0, 200),
          description: String(body.description ?? "").slice(0, 2000),
          category: (body.category?.trim() || "General").slice(0, 100),
          difficulty, proposed_by: body.proposedBy ?? null,
        });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "removeChallenge": {
        const { error } = await supabase.from("challenges").delete().eq("id", body.id);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "claimChallenge": {
        const { error } = await supabase.from("claims").upsert({
          challenge_id: Number(body.id), steamid: body.steamid,
          proof: body.proof ? String(body.proof).slice(0, 500) : null,
        });
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "unclaimChallenge": {
        const { error } = await supabase.from("claims").delete()
          .eq("challenge_id", body.id).eq("steamid", body.steamid);
        if (error) return fail(500, error.message);
        return res.status(200).json({ ok: true });
      }
      case "dealBingo": {
        // Cards are generated CLIENT-side (the browser holds the freshest
        // achievement data); this op just validates and persists the deal.
        const label = String(body.label ?? "").trim().slice(0, 60) || "Untitled round";
        const cards = Array.isArray(body.cards) ? body.cards : [];
        if (!cards.length) return fail(400, "No cards to deal");
        for (const c of cards) {
          if (!/^\d{17}$/.test(String(c.steamid ?? ""))) return fail(400, "Bad steamid in a card");
          if (!Array.isArray(c.cells) || !c.cells.length || c.cells.length > 24)
            return fail(400, "Cards must have 1-24 cells");
        }
        const round = await supabase.from("bingo_rounds").insert({ label }).select().single();
        if (round.error)
          return fail(500, `bingo_rounds insert failed: ${round.error.message} — run supabase/migration-v9.sql?`);
        const rows = cards.map((c) => ({ round_id: round.data.id, steamid: c.steamid, cells: c.cells }));
        const w = await supabase.from("bingo_cards").insert(rows);
        if (w.error) return fail(500, `bingo_cards insert failed: ${w.error.message}`);
        return res.status(200).json({ ok: true, roundId: round.data.id, dealt: rows.length });
      }

      case "deleteBingo": {
        const id = Number(body.roundId);
        if (!id) return fail(400, "roundId required");
        const d = await supabase.from("bingo_rounds").delete().eq("id", id);   // cards cascade
        if (d.error) return fail(500, d.error.message);
        return res.status(200).json({ ok: true });
      }

      default:
        return fail(400, `Unknown op '${op}'`);
    }
  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
