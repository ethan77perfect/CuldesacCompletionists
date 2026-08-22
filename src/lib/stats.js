// ---------------------------------------------------------------
// stats.js — the club brain. Takes raw /api/club data + /api/db
// meta + settings and derives every feature: leaderboards, monthly crowns,
// first blood, streaks, feed, records, hall of fame, graveyard,
// recommendations, races, challenge standings, badges, timeline.
// ---------------------------------------------------------------

import { pointTable, buildDifficultyCurve } from "./scoring.js";

const DAY = 86400;
const monthKey = (t) => {
  const d = new Date(t * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
// ISO-8601 week label ("2026-W31") — used for streak tracking. The
// UTC+Thursday dance is the standard trick for ISO week numbering.
const isoWeek = (t) => {
  const d = new Date(t * 1000);
  const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((day - y0) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
};
export const monthLabelOf = (date = new Date()) =>
  date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
const monthStart = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), 1).getTime() / 1000;

// The club's recorded era: one crown per finished calendar month, from
// here forward. Unlocks before this still count all-time — there are
// just no retroactive crowns for months the club wasn't keeping score.
const CHAMPIONSHIP_START = "2026-08";

// Rarity tier table — first row whose `min` the percentage meets wins.
// Reorder/rename/recolor freely; TierChip in ui.jsx renders these.
export const RARITY_TIERS = [
  { min: 20, name: "Common", color: "#8FA3BF" },
  { min: 8, name: "Uncommon", color: "#5CB8A6" },
  { min: 2, name: "Rare", color: "#7FB4E6" },
  { min: 0.5, name: "Epic", color: "#B48CE0" },
  { min: 0.1, name: "Legendary", color: "#E8B84B" },
  { min: -1, name: "Mythic", color: "#E05B5B" },
];
export const UNRATED_TIER = { name: "Unrated", color: "#8FA3BF" };
export const tierOf = (pct) => (pct == null || pct <= 0 ? UNRATED_TIER : RARITY_TIERS.find((t) => pct >= t.min));

export function buildClubStats(clubData, meta, settings) {
  const cfg = settings;
  const members = meta.members;
  const byId = Object.fromEntries(members.map((m) => [m.steamid, m]));
  const dbGames = Object.fromEntries(meta.games.map((g) => [g.appid, g]));
  const fbPct = cfg.firstBloodPct ?? 0.1;
  const pioneerBonus = cfg.pioneerBonus ?? 0.25;
  const pioneerSet = new Set((meta.pioneers ?? []).map((p) => `${p.steamid}|${p.appid}|${p.achid}`));
  const profiles = clubData.profiles ?? {};

  // ---- the difficulty curve: built once from ALL rated games ----
  // (percentile-based, so it must see the whole set before any single
  // game can be scored — see scoring.js for the philosophy)
  // Effective hours = the curator's median blended with CLUB completion
  // times, each an equal vote (v13): median 30 + finishes of 40 and 25
  // → 31.7h. A game with no median but club finishes is rated by the
  // club alone — real data beats a blank. The curve is founded on the
  // blended values, so finishing a game can (honestly) re-rate it.
  const clubTimes = {};
  for (const c of meta.completions ?? []) {
    const h = Number(c.hours);
    if (Number.isFinite(h) && h > 0) (clubTimes[Number(c.appid)] ??= []).push(h);
  }
  const hoursOf = (row) => {
    if (!row) return null;
    const votes = [
      ...(row.hours_median != null && Number(row.hours_median) > 0 ? [Number(row.hours_median)] : []),
      ...(clubTimes[Number(row.appid)] ?? []),
    ];
    if (!votes.length) return null;
    return Math.round((votes.reduce((s, h) => s + h, 0) / votes.length) * 10) / 10;
  };
  const clubVotesOf = (row) => (clubTimes[Number(row?.appid)] ?? []).length;
  const allHours = (meta.games ?? []).map(hoursOf);
  const curve = buildDifficultyCurve(allHours);

  // ---- score every game ----
  const games = clubData.games.map((raw) => {
    const db = dbGames[raw.appid] ?? {};
    const table = pointTable(raw.ach, cfg, { hours: hoursOf(db), curve });
    const clubTimeVotes = clubVotesOf(db);
    // keep RAW pcts for display (0 renders as ⏳ Unrated) with a flag
    const achById = Object.fromEntries(raw.ach.map((a) => [a.id, { ...a, provisional: a.pct <= 0 }]));
    const players = {};
    for (const m of members) {
      const unlocks = raw.players[m.steamid];
      if (!unlocks) continue;
      const earned = unlocks.reduce((s, u) => s + (table.per.get(u.id) ?? 0), 0);
      const complete = unlocks.length === raw.ach.length && raw.ach.length > 0;
      const lastUnlock = unlocks.reduce((mx, u) => Math.max(mx, u.t || 0), 0);
      const firstUnlock = unlocks.reduce((mn, u) => (u.t ? Math.min(mn, u.t) : mn), Infinity);
      players[m.steamid] = {
        unlocks,
        basePoints: earned + (complete ? table.bonusPts : 0),
        // cap at 99 unless truly complete: 249/250 rounds to 100, and a
        // "100%" PctBar on an incomplete game reads as a lie
        pct: complete ? 100 : raw.ach.length ? Math.min(99, Math.round((unlocks.length / raw.ach.length) * 100)) : 0,
        complete, lastUnlock,
        firstUnlock: firstUnlock === Infinity ? 0 : firstUnlock,
        missing: raw.ach.filter((a) => !unlocks.some((u) => u.id === a.id)),
      };
    }
    return {
      ...raw,
      name: db.name ?? raw.name,
      race: db.race ?? false, notes: db.notes ?? "",
      diff: table.diff, hours: table.hours, unrated: table.unrated,
      pool: table.pool, table, achById, clubTimeVotes, players,
    };
  });

  // ---- events: the timeline backbone ----
  // Everything time-based (feed, charts, crowns, streaks, records)
  // is built from this one flat list. Each unlock becomes an event
  // carrying its point value; each 100% adds a completion-bonus
  // event; the earliest unlocker of each achievement gets the
  // first-blood multiplier folded into their unlock event.
  const events = []; // { sid, appid, gameName, t, pts, kind, achId?, achName?, pct? }
  for (const g of games) {
    // first blood: earliest unlocker of each achievement gets a bonus
    const firstOf = {};
    for (const [sid, r] of Object.entries(g.players)) {
      for (const u of r.unlocks) {
        if (u.t && (!firstOf[u.id] || u.t < firstOf[u.id].t)) firstOf[u.id] = { sid, t: u.t };
      }
    }
    for (const [sid, r] of Object.entries(g.players)) {
      for (const u of r.unlocks) {
        if (!u.t) continue;
        const a = g.achById[u.id];
        const base = g.table.per.get(u.id) ?? 0;
        const fb = firstOf[u.id]?.sid === sid ? base * fbPct : 0;
        const pio = pioneerSet.has(`${sid}|${g.appid}|${u.id}`) ? base * pioneerBonus : 0;
        events.push({
          sid, appid: g.appid, gameName: g.name, t: u.t, kind: "unlock",
          pts: base + fb + pio, firstBlood: fb > 0, pioneer: pio > 0,
          achId: u.id, achName: a?.name ?? u.id, pct: a ? a.pct : null, provisional: a ? a.provisional : true,
        });
      }
      if (r.complete && r.lastUnlock) {
        events.push({
          sid, appid: g.appid, gameName: g.name, t: r.lastUnlock,
          kind: "complete", pts: g.table.bonusPts,
        });
      }
    }
  }
  // ---- wheel contracts: multiply events earned under contract ----
  // A contract applies to (its player | everyone, if public bounty) for
  // events in that game unlocked AFTER acceptance. Overlapping contracts
  // don't stack — the highest multiplier wins.
  // Contracts live for one week at most: accepted → next Monday 00:00
  // (local). Beating the game fulfills early; Monday expires the rest.
  const nextMonday = (epoch) => {
    const d = new Date(epoch * 1000);
    const days = ((8 - d.getDay()) % 7) || 7;   // accepted on a Monday → next Monday
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    return m.getTime() / 1000;
  };
  // 'offered' rows (v12) are a pending decision, not a live contract:
  // no multiplier, no board presence, no ledger entry. The Wheel reads
  // them straight off meta.contracts.
  const contracts = (meta.contracts ?? []).filter((c) => c.status !== "offered").map((c) => {
    const epoch = Date.parse(c.accepted_at) / 1000;
    return { ...c, epoch, expiry: nextMonday(epoch), multiplier: parseFloat(c.multiplier) };
  });
  // multiplier applies only inside the contract's live window
  const contractMult = (sid, appid, t) => {
    let m = 1;
    for (const c of contracts) {
      if (Number(c.appid) !== Number(appid)) continue;
      if (c.steamid && c.steamid !== sid) continue;
      if (t >= c.epoch && t < c.expiry) m = Math.max(m, c.multiplier);
    }
    return m;
  };
  for (const e of events) {
    const m = contractMult(e.sid, e.appid, e.t);
    if (m > 1) { e.contract = m; e.pts *= m; }
  }

  // ---- custom challenges (honor system) → claim events ----
  // Each claim earns difficulty×100 (+first-blood for the earliest claim).
  // settings.countChallenges === false keeps them out of the main pool.
  const challengeById = Object.fromEntries((meta.challenges ?? []).map((c) => [c.id, c]));
  if (cfg.countChallenges !== false) {
    const claimsByCh = {};
    for (const cl of meta.claims ?? []) (claimsByCh[cl.challenge_id] ??= []).push(cl);
    for (const [chId, list] of Object.entries(claimsByCh)) {
      const ch = challengeById[chId];
      if (!ch) continue;
      const value = ch.difficulty * 100;
      const sorted = [...list].sort((a, b) => Date.parse(a.claimed_at) - Date.parse(b.claimed_at));
      sorted.forEach((cl, i) => {
        events.push({
          sid: cl.steamid, appid: null, gameName: ch.category, t: Date.parse(cl.claimed_at) / 1000,
          kind: "claim", pts: value * (i === 0 ? 1 + fbPct : 1), firstBlood: i === 0,
          achName: ch.title, pct: null, challengeId: ch.id,
        });
      });
    }
  }
  events.sort((a, b) => a.t - b.t);

  // ---- totals, month, streaks ----
  const monthCut = monthStart();
  const perPlayer = Object.fromEntries(members.map((m) => [m.steamid, {
    ...m, avatar: profiles[m.steamid]?.avatar ?? null,
    points: 0, monthPoints: 0, monthUnlocks: 0, perfects: 0, started: 0,
    weeks: new Set(), rarestUnlock: null, spans: [], playtimeMin: 0,
  }]));
  for (const e of events) {
    const p = perPlayer[e.sid];
    if (!p) continue;
    p.points += e.pts;
    if (e.contract) {
      p.contractPts = (p.contractPts ?? 0) + e.pts;
      if (e.kind === "unlock") p.contractKills = (p.contractKills ?? 0) + 1;
    }
    if (e.t >= monthCut) { p.monthPoints += e.pts; if (e.kind === "unlock") p.monthUnlocks += 1; }
    p.weeks.add(isoWeek(e.t));
    if (e.kind === "unlock" && e.pioneer) p.pioneerCount = (p.pioneerCount ?? 0) + 1;
    if (e.kind === "unlock" && !e.provisional && e.pct > 0 && (!p.rarestUnlock || e.pct < p.rarestUnlock.pct)) p.rarestUnlock = e;
  }
  for (const g of games) {
    for (const [sid, r] of Object.entries(g.players)) {
      const p = perPlayer[sid];
      if (!p) continue;
      if (r.unlocks.length > 0) p.started += 1;
      if (r.complete) {
        p.perfects += 1;
        if (r.firstUnlock && r.lastUnlock > r.firstUnlock)
          p.spans.push({ appid: g.appid, name: g.name, days: (r.lastUnlock - r.firstUnlock) / DAY, diff: g.diff });
      }
      p.playtimeMin += profiles[sid]?.playtime?.[g.appid] ?? 0;
    }
  }
  // streak: consecutive ISO weeks with >=1 unlock, ending this or last week
  const streakOf = (weeks) => {
    const sorted = [...weeks].sort();
    let best = 0, cur = 0, prev = null, current = 0;
    const weekIndex = (w) => { const [y, k] = w.split("-W").map(Number); return y * 53 + k; };
    for (const w of sorted) {
      cur = prev !== null && weekIndex(w) - weekIndex(prev) === 1 ? cur + 1 : 1;
      best = Math.max(best, cur); prev = w;
    }
    if (prev) {
      const nowIdx = weekIndex(isoWeek(Date.now() / 1000));
      current = nowIdx - weekIndex(prev) <= 1 ? cur : 0;
    }
    return { best, current };
  };
  for (const p of Object.values(perPlayer)) {
    Object.assign(p, { streak: streakOf(p.weeks) });
    p.points = Math.round(p.points);
    p.contractPts = Math.round(p.contractPts ?? 0);
    p.contractKills = p.contractKills ?? 0;
    p.monthPoints = Math.round(p.monthPoints);
    p.avgSpanDays = p.spans.length ? p.spans.reduce((s, x) => s + x.days, 0) / p.spans.length : null;
    p.closerRate = p.started ? p.perfects / p.started : 0;
    p.hardestClear = games.filter((g) => g.players[p.steamid]?.complete)
      .reduce((m, g) => (g.diff > (m?.diff ?? 0) ? g : m), null);
  }

  // ---- monthly championship ----
  // One crown per FINISHED calendar month, scored in the main points
  // economy — the same event pts that feed the all-time board (unlocks,
  // completion bonuses, first blood, pioneer, contracts, claims). Hunt
  // points stay their own economy, as ever. Ties = co-champions.
  const nowMonth = monthKey(Date.now() / 1000);
  const monthTotals = new Map();   // "YYYY-MM" -> { sid: { pts, unlocks } }
  for (const e of events) {
    const k = monthKey(e.t);
    if (k < CHAMPIONSHIP_START) continue;
    if (!monthTotals.has(k)) monthTotals.set(k, {});
    const row = (monthTotals.get(k)[e.sid] ??= { pts: 0, unlocks: 0 });
    row.pts += e.pts;
    if (e.kind === "unlock") row.unlocks += 1;
  }
  const monthHistory = [];
  {
    let [y, m] = CHAMPIONSHIP_START.split("-").map(Number);
    const [ny, nm] = nowMonth.split("-").map(Number);
    while (y < ny || (y === ny && m <= nm)) {   // every era month, even silent ones
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const bucket = monthTotals.get(key) ?? {};
      const standings = members.map((mm) => ({
        sid: mm.steamid,
        pts: Math.round(bucket[mm.steamid]?.pts ?? 0),
        unlocks: bucket[mm.steamid]?.unlocks ?? 0,
      })).sort((a, b) => b.pts - a.pts || b.unlocks - a.unlocks);
      const top = standings[0]?.pts ?? 0;
      const winners = top > 0 ? standings.filter((x) => x.pts === top).map((x) => x.sid) : [];
      monthHistory.push({
        month: key,
        label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        done: key < nowMonth, standings, winners,
      });
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  for (const p of Object.values(perPlayer)) p.monthWins = 0;
  for (const mo of monthHistory) {
    if (!mo.done) continue;
    for (const w of mo.winners) if (perPlayer[w]) perPlayer[w].monthWins += 1;
  }
  const finishedMonths = monthHistory.filter((mo) => mo.done && mo.winners.length);
  const lastCrowned = finishedMonths[finishedMonths.length - 1];
  const reigning = lastCrowned
    ? { month: lastCrowned.month, label: lastCrowned.label, sids: lastCrowned.winners }
    : null;

  // ---- races ----
  const races = games.filter((g) => g.race).map((g) => {
    const finishers = Object.entries(g.players)
      .filter(([, r]) => r.complete && r.lastUnlock)
      .map(([sid, r]) => ({ sid, t: r.lastUnlock }))
      .sort((a, b) => a.t - b.t);
    return { appid: g.appid, name: g.name, diff: g.diff, winner: finishers[0]?.sid ?? null, finishers };
  });
  const raceWinners = new Set(races.map((r) => r.winner).filter(Boolean));

  // ---- monthly challenge ----
  let challenge = null;
  if (cfg.challenge?.appid) {
    const g = games.find((x) => x.appid === Number(cfg.challenge.appid));
    const month = cfg.challenge.month ?? monthKey(Date.now() / 1000);
    if (g) {
      const standings = members.map((m) => {
        const pts = events.filter((e) => e.sid === m.steamid && e.appid === g.appid && monthKey(e.t) === month)
          .reduce((s, e) => s + e.pts, 0);
        return { sid: m.steamid, pts: Math.round(pts), pct: g.players[m.steamid]?.pct ?? 0 };
      }).sort((a, b) => b.pts - a.pts);
      challenge = { game: g, month, standings };
    }
  }

  // ---- feed, hall of fame, records, graveyard ----
  const feed = [...events].reverse().slice(0, 40);
  const hallOfFame = events.filter((e) => e.kind === "unlock" && !e.provisional && e.pct > 0)
    .sort((a, b) => a.pct - b.pct).slice(0, 15);
  const now = Date.now() / 1000;
  const graveyard = [];
  for (const g of games) {
    for (const [sid, r] of Object.entries(g.players)) {
      if (r.unlocks.length > 0 && !r.complete && now - r.lastUnlock > 180 * DAY)
        graveyard.push({ sid, appid: g.appid, name: g.name, pct: r.pct, daysDead: Math.floor((now - r.lastUnlock) / DAY) });
    }
  }
  graveyard.sort((a, b) => b.daysDead - a.daysDead);

  const allSpans = Object.values(perPlayer).flatMap((p) => p.spans.map((s) => ({ ...s, sid: p.steamid })));
  const unlocksByDay = {};
  for (const e of events) {
    if (e.kind !== "unlock") continue;
    const k = `${e.sid}|${new Date(e.t * 1000).toDateString()}`;
    unlocksByDay[k] = (unlocksByDay[k] ?? 0) + 1;
  }
  const bestDay = Object.entries(unlocksByDay).sort((a, b) => b[1] - a[1])[0] ?? null;
  const completions = events.filter((e) => e.kind === "complete").sort((a, b) => a.t - b.t);
  const biggestUnlock = events.filter((e) => e.kind === "unlock").sort((a, b) => b.pts - a.pts)[0] ?? null;
  const records = {
    fastest: allSpans.length ? allSpans.reduce((m, s) => (s.days < m.days ? s : m)) : null,
    longest: allSpans.length ? allSpans.reduce((m, s) => (s.days > m.days ? s : m)) : null,
    bestDay: bestDay ? { sid: bestDay[0].split("|")[0], date: bestDay[0].split("|")[1], count: bestDay[1] } : null,
    firstPerfect: completions[0] ?? null,
    biggestUnlock,
  };

  // ---- recommendations: "closest finish" = remaining effort ÷ progress ----
  // remaining: rarity-weighted work left (√ tames extreme outliers)
  // progress: rarity-weighted fraction already done — dividing by it means
  // a 95%-done game beats a barely-started one even if the barely-started
  // game's achievements are individually common (the Elden Ring problem).
  const recs = [];
  for (const g of games) {
    const wOf = (a) => 1 / Math.sqrt(Math.max(a.pct, 0.05));
    const totalW = g.ach.reduce((s, a) => s + wOf(a), 0);
    for (const [sid, r] of Object.entries(g.players)) {
      if (r.unlocks.length === 0 || r.complete) continue;
      const remaining = r.missing.reduce((s, a) => s + wOf(a), 0);
      const progress = Math.max((totalW - remaining) / totalW, 0.05);
      const effort = remaining / progress;
      const ptsLeft = Math.round(g.pool - r.basePoints);
      recs.push({ sid, appid: g.appid, name: g.name, diff: g.diff, pct: r.pct, missingCount: r.missing.length, effort, ptsLeft });
    }
  }
  recs.sort((a, b) => a.effort - b.effort);

  // ---- badges ----
  // TO ADD A BADGE: add one line here — [display name, test function].
  // The test receives a perPlayer object (see fields assembled above:
  // points, perfects, spans, streak, rarestUnlock, hardestClear...).
  // That's it; player pages render whatever this list produces.
  const badgeDefs = [
    ["First Perfect", (p) => p.perfects >= 1],
    ["Shelf of Five", (p) => p.perfects >= 5],
    ["Double Digits", (p) => p.perfects >= 10],
    ["Giant Slayer", (p) => p.hardestClear?.diff >= 8],
    ["Legend", (p) => p.hardestClear?.diff >= 9],
    ["Race Winner", (p) => raceWinners.has(p.steamid)],
    ["Millennium", (p) => p.points >= 1000],
    ["Rare Air", (p) => p.rarestUnlock && p.rarestUnlock.pct < 1],
    ["Mythic Hunter", (p) => p.rarestUnlock && p.rarestUnlock.pct < 0.1],
    ["Iron Streak", (p) => p.streak.best >= 8],
    ["Speedrunner", (p) => p.spans.some((s) => s.days <= 7)],
    ["Marathoner", (p) => p.spans.some((s) => s.days >= 365)],
    ["Month Champion", (p) => (p.monthWins ?? 0) >= 1],
    ["Dynasty", (p) => (p.monthWins ?? 0) >= 3],
    ["Pioneer", (p) => (p.pioneerCount ?? 0) >= 1],
    ["Trailblazer", (p) => (p.pioneerCount ?? 0) >= 10],
  ];
  for (const p of Object.values(perPlayer))
    p.badges = badgeDefs.filter(([, fn]) => fn(p)).map(([name]) => name);

  // ---- timeline (cumulative points per month) ----
  let timeline = [];
  if (events.length) {
    const start = new Date(events[0].t * 1000);
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date();
    while (cursor <= end) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const totals = Object.fromEntries(members.map((m) => [m.steamid, 0]));
    const byMonth = new Map();
    for (const e of events) {
      const k = monthKey(e.t);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(e);
    }
    timeline = months.map((m) => {
      for (const e of byMonth.get(m) ?? []) totals[e.sid] += e.pts;
      const row = { month: m.slice(2) };
      for (const mem of members) row[mem.name] = Math.round(totals[mem.steamid]);
      return row;
    });
  }

  const board = Object.values(perPlayer).sort((a, b) => b.points - a.points);
  const monthBoard = [...board].sort((a, b) => b.monthPoints - a.monthPoints);
  const contractBoard = [...board].sort((a, b) => b.contractPts - a.contractPts);

  // enriched contract list for the Wheel page: fulfilled if the game hit
  // 100% at/after acceptance (for public bounties: any member)
  const nowSec = Date.now() / 1000;
  const contractView = contracts.map((c) => {
    const g = games.find((x) => Number(x.appid) === Number(c.appid));
    const holders = c.steamid ? [c.steamid] : members.map((m) => m.steamid);
    const fulfilledBy = holders.filter((sid) => {
      const r = g?.players[sid];
      return r?.complete && r.lastUnlock >= c.epoch && r.lastUnlock < c.expiry;
    });
    const status = fulfilledBy.length ? "fulfilled" : nowSec < c.expiry ? "active" : "expired";
    return { ...c, gameName: g?.name ?? `App ${c.appid}`, diff: g?.diff, fulfilledBy, status };
  });
  const histogram = Array.from({ length: 11 }, (_, i) => ({   // 0–10: eleven buckets now
    diff: i, games: games.filter((g) => g.diff != null && Math.round(g.diff) === i).length,
  }));
  const scatter = events.filter((e) => e.kind === "unlock" && e.t).map((e) => ({
    t: e.t, pct: Math.max(e.pct, 0.05), sid: e.sid, achName: e.achName, gameName: e.gameName,
  }));
  const clubTotals = {
    perfects: board.reduce((s, p) => s + p.perfects, 0),
    points: board.reduce((s, p) => s + p.points, 0),
    unlocks: events.filter((e) => e.kind === "unlock").length,
  };

  const profilesPlaytime = Object.fromEntries(
    Object.entries(profiles).map(([sid, p]) => [sid, p.playtime ?? {}])
  );
  const profilesLastPlayed = Object.fromEntries(
    Object.entries(profiles).map(([sid, p]) => [sid, p.lastPlayed ?? {}])
  );

  return {
    games, byId, board, monthBoard, contractBoard, contractView,
    monthLabel: monthLabelOf(), monthHistory, reigning, events, feed,
    hallOfFame, graveyard, records, recs, races, challenge, timeline,
    histogram, scatter, clubTotals, perPlayer, profilesPlaytime, profilesLastPlayed,
  };
}


// ---------------------------------------------------------------
// computeHunt — standings for one monthly hunt.
// hunt.achievements: [{appid, id, name, pct, base}]
// games: stats.games (carry every player's unlocks with timestamps)
//
// Rules: within the hunt month, finish order per achievement earns
// base × [1, .8, .6, .4, then .2 for everyone after]. Anyone who
// already had the achievement BEFORE the month gets flat veteran
// credit (base × veteranCredit, default 0.6) and does not occupy
// a place slot — history is rewarded, the podium stays live.
// ---------------------------------------------------------------
export function computeHunt(hunt, games, members, cfg = {}) {
  const PLACE = [1, 0.8, 0.6, 0.4];
  const vet = cfg.veteranCredit ?? 0.6;
  const [y, m] = hunt.month.split("-").map(Number);
  const start = new Date(y, m - 1, 1).getTime() / 1000;
  const end = new Date(y, m, 1).getTime() / 1000;

  const gameById = Object.fromEntries(games.map((g) => [Number(g.appid), g]));
  const totals = Object.fromEntries(members.map((mm) => [mm.steamid, { pts: 0, captures: 0, veteran: 0 }]));

  const board = hunt.achievements.map((a) => {
    const g = gameById[Number(a.appid)];
    const rows = [];
    for (const mm of members) {
      const u = g?.players[mm.steamid]?.unlocks.find((x) => x.id === a.id);
      if (u?.t) rows.push({ sid: mm.steamid, t: u.t });
    }
    const veterans = rows.filter((r) => r.t < start);
    const racers = rows.filter((r) => r.t >= start && r.t < end).sort((x, z) => x.t - z.t);
    const results = [];
    for (const v of veterans) {
      const pts = Math.round(a.base * vet);
      totals[v.sid].pts += pts; totals[v.sid].veteran += 1;
      results.push({ sid: v.sid, place: "vet", pts, t: v.t });
    }
    racers.forEach((r, i) => {
      const mult = PLACE[i] ?? 0.2;
      const pts = Math.round(a.base * mult);
      totals[r.sid].pts += pts;
      if (i === 0) totals[r.sid].captures += 1;
      results.push({ sid: r.sid, place: i + 1, pts, t: r.t });
    });
    return { ...a, gameName: g?.name ?? `App ${a.appid}`, results };
  });

  const standings = members
    .map((mm) => ({ sid: mm.steamid, ...totals[mm.steamid] }))
    .sort((x, z) => z.pts - x.pts);
  return { board, standings, start, end, winner: standings[0]?.pts > 0 ? standings[0].sid : null };
}

// Suggested hunt slate: mostly "important" (rarity as proxy — big
// milestones trend rare), a few wildcards. Curate before locking in.
export function suggestHuntAchievements(games, appids, perGame = 20) {
  const picks = [];
  for (const appid of appids) {
    const g = games.find((x) => Number(x.appid) === Number(appid));
    if (!g) continue;
    const sorted = [...g.ach].filter((a) => a.pct > 0).sort((a, b) => a.pct - b.pct); // rarest first, never unrated
    const n = Math.min(perGame, sorted.length);
    const nRare = Math.round(n * 0.6), nMid = Math.round(n * 0.25);
    const half = sorted.slice(0, Math.ceil(sorted.length / 2));
    const mid = sorted.slice(Math.ceil(sorted.length / 4), Math.ceil(sorted.length * 3 / 4));
    const chosen = new Set();
    const draw = (pool, count) => {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (const a of shuffled) {
        if (chosen.size >= n) return;
        if (count-- <= 0) return;
        if (![...chosen].some((c) => c.id === a.id)) chosen.add(a);
      }
    };
    draw(half, nRare); draw(mid, nMid); draw(sorted, n); // fill remainder randomly
    for (const a of chosen) {
      picks.push({ appid: Number(appid), id: a.id, name: a.name, pct: a.pct,
        base: Math.max(5, Math.round(30 / Math.sqrt(Math.max(a.pct, 0.05)))) });
    }
  }
  return picks;
}
