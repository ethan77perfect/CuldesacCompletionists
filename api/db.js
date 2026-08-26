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

// Week boundary — mirrors cron.js exactly so "this week" means the
// same thing to spins, expiry, and the Monday report.
const nextMonday = (epoch) => {
  const d = new Date(epoch * 1000);
  const days = ((8 - d.getUTCDay()) % 7) || 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days) / 1000;
};
const drawWeighted = (slices) => {
  const tot = slices.reduce((t, x) => t + x.weight, 0);
  let r = Math.random() * tot;
  for (const x of slices) { r -= x.weight; if (r <= 0) return x; }
  return slices[slices.length - 1];
};
const validSlices = (raw) => Array.isArray(raw) && raw.length >= 1 && raw.length <= 400 &&
  raw.every((x) => Number.isFinite(Number(x.appid)) && Number.isFinite(x.weight) && x.weight > 0);

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
      const [members, games, settings, backlog, contracts, hunts, challenges, claims, pioneers, century, covers, bingoRounds, bingoCards, completions, queue] = await Promise.all([
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
        supabase.from("completions").select("*"),
        supabase.from("queue").select("*").order("position"),
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
        completions: completions.error ? [] : (completions.data ?? []),   // tolerate pre-v13 DBs
        queue: queue.error ? [] : (queue.data ?? []),                     // tolerate pre-v14 DBs
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
        // ROSTER CHANGE: the cron's per-game freshness map is member-blind —
        // a "fresh" game's cached player data predates this member, so the
        // resumable cron would happily carry them-less data for days. Reset
        // the map (NOT fetched_at — that timestamp anchors the diff and
        // rare-unlock windows) so stale-first passes re-crawl the whole
        // library under the new roster. Best-effort: adding the member must
        // never fail on a cache hiccup.
        try {
          const cache = await supabase.from("snapshot_cache").select("*").eq("id", 1).maybeSingle();
          if (cache.data?.payload) {
            await supabase.from("snapshot_cache").upsert({
              id: 1, payload: { ...cache.data.payload, gameFetchedAt: {} }, fetched_at: cache.data.fetched_at,
            });
          }
        } catch { /* best-effort */ }
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
      // ---- binding wheel spins (v12) ----
      // The SERVER draws the winner before the wheel ever animates, and
      // the outcome is persisted immediately — so a refresh mid-spin
      // resumes the commitment instead of erasing it. The client sends
      // the slice list it displayed (appids + weights); yes, a clubKey
      // holder could curl a rigged list, but they could always curl a
      // contract into existence — the enforcement target is refresh-
      // skirting, not cryptography, and this is a club of friends.
      case "spinPersonal": {
        const steamid = String(body.steamid ?? "");
        if (!/^\d{17}$/.test(steamid)) return fail(400, "Bad steamid");
        if (!validSlices(body.slices)) return fail(400, "Bad slices");
        const rows = await supabase.from("contracts").select("*").eq("steamid", steamid).eq("source", "personal");
        if (rows.error) return fail(500, rows.error.message);
        const nowSec = Date.now() / 1000;
        const thisWeek = (rows.data ?? []).filter((c) =>
          nextMonday(Date.parse(c.accepted_at) / 1000) === nextMonday(nowSec));
        if (thisWeek.some((c) => c.status !== "offered"))
          return fail(409, "Already under contract this week — the wheel remembers");
        const winner = drawWeighted(body.slices);
        const offer = thisWeek.find((c) => c.status === "offered");
        if (offer) {
          // the single re-spin: signs itself, no questions asked
          const w = await supabase.from("contracts")
            .update({ appid: Number(winner.appid), status: "signed", respun: true, accepted_at: new Date().toISOString() })
            .eq("id", offer.id).eq("status", "offered").select("id");
          if (w.error) return fail(500, w.error.message);
          if (!(w.data ?? []).length) return fail(409, "Re-spin already resolved — refresh the page");
          return res.status(200).json({ ok: true, phase: "signed", respun: true, appid: Number(winner.appid) });
        }
        const ins = await supabase.from("contracts")
          .insert({ steamid, appid: Number(winner.appid), multiplier: 1.5, source: "personal", status: "offered" })
          .select("id").single();
        if (ins.error) return fail(500, `${ins.error.message} — run supabase/migration-v12.sql?`);
        return res.status(200).json({ ok: true, phase: "offered", appid: Number(winner.appid), contractId: ins.data.id });
      }
      case "acceptSpin": {
        const w = await supabase.from("contracts")
          .update({ status: "signed", accepted_at: new Date().toISOString() })
          .eq("id", Number(body.id)).eq("status", "offered").select("id");
        if (w.error) return fail(500, w.error.message);
        if (!(w.data ?? []).length) return fail(409, "No pending offer to sign — refresh the page");
        return res.status(200).json({ ok: true });
      }
      case "spinBounty": {
        if (!validSlices(body.slices)) return fail(400, "Bad slices");
        const rows = await supabase.from("contracts").select("*").is("steamid", null).eq("source", "public");
        if (rows.error) return fail(500, rows.error.message);
        const nowSec = Date.now() / 1000;
        if ((rows.data ?? []).some((c) => c.status !== "offered" &&
            nextMonday(Date.parse(c.accepted_at) / 1000) === nextMonday(nowSec)))
          return fail(409, "This week's bounty is already posted");
        const winner = drawWeighted(body.slices);
        const ins = await supabase.from("contracts")
          .insert({ steamid: null, appid: Number(winner.appid), multiplier: 2.0, source: "public", status: "signed" })
          .select("id").single();
        if (ins.error) return fail(500, `${ins.error.message} — run supabase/migration-v12.sql?`);
        return res.status(200).json({ ok: true, appid: Number(winner.appid) });
      }
      case "abandonContract": {
        // Two things can't be torn up:
        //  - OFFERS — you sign, or you burn the re-spin (v12).
        //  - anything signed THIS WEEK — spinPersonal/spinBounty only
        //    look for a row in the current week, so deleting the row
        //    handed the spin (and the re-spin) straight back. A binding
        //    spin that the ✕ un-binds isn't binding. Old rows — last
        //    week's expired or fulfilled — can still be cleared.
        const row = await supabase.from("contracts").select("id, status, accepted_at")
          .eq("id", Number(body.id)).maybeSingle();
        if (row.error) return fail(500, row.error.message);
        if (!row.data) return fail(404, "No such contract");
        if (row.data.status === "offered") return fail(409, "Offers can't be torn up — sign it or burn the re-spin");
        const nowSec = Date.now() / 1000;
        if (nextMonday(Date.parse(row.data.accepted_at) / 1000) === nextMonday(nowSec))
          return fail(409, "Signed this week — it's binding until Monday");
        const d = await supabase.from("contracts").delete()
          .eq("id", Number(body.id)).neq("status", "offered").select("id");
        if (d.error) return fail(500, d.error.message);
        if (!(d.data ?? []).length) return fail(409, "Contract already gone — refresh the page");
        return res.status(200).json({ ok: true });
      }
      // ---- the Future page (v14) ----
      case "saveFuture": {
        // One op saves the whole page: the member's play pace AND their
        // queue. The queue is wholesale-replaced — the client sends the
        // full ordered appid list, position = array index. (Ordering by
        // diffing rows is where reorder bugs live; a 12-row delete +
        // insert is nothing.)
        const sid = String(body.steamid || "");
        if (!sid) return fail(400, "steamid required");
        const wd = Math.min(24, Math.max(0, Number(body.weekday) || 0));
        const we = Math.min(24, Math.max(0, Number(body.weekend) || 0));
        const upd = await supabase.from("members")
          .update({ play_weekday: wd, play_weekend: we })
          .eq("steamid", sid).select("steamid");
        if (upd.error) return fail(500, upd.error.message);
        if (!(upd.data ?? []).length) return fail(404, "No such member");
        const appids = [...new Set((body.appids ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
        const del = await supabase.from("queue").delete().eq("steamid", sid);
        if (del.error) return fail(500, del.error.message);
        if (appids.length) {
          const ins = await supabase.from("queue")
            .insert(appids.map((appid, idx) => ({ steamid: sid, appid, position: idx })));
          if (ins.error) return fail(500, ins.error.message);
        }
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
