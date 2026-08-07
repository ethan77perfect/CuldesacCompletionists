// ---------------------------------------------------------------
// stats.js — the club brain. Takes raw /api/club data + /api/db
// meta + settings and derives every feature: leaderboards, seasons,
// first blood, streaks, feed, records, hall of fame, graveyard,
// recommendations, races, challenge standings, badges, timeline.
// ---------------------------------------------------------------

import { difficultyFromRarity, pointTable } from "./scoring.js";

const DAY = 86400;
const monthKey = (t) => {
  const d = new Date(t * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const isoWeek = (t) => {
  const d = new Date(t * 1000);
  const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((day - y0) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
};
export const quarterOf = (date = new Date()) =>
  `${date.getFullYear()} Q${Math.floor(date.getMonth() / 3) + 1}`;
const quarterStart = (date = new Date()) =>
  new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1).getTime() / 1000;

export const RARITY_TIERS = [
  { min: 20, name: "Common", color: "#8FA3BF" },
  { min: 8, name: "Uncommon", color: "#5CB8A6" },
  { min: 2, name: "Rare", color: "#7FB4E6" },
  { min: 0.5, name: "Epic", color: "#B48CE0" },
  { min: 0.1, name: "Legendary", color: "#E8B84B" },
  { min: -1, name: "Mythic", color: "#E05B5B" },
];
export const tierOf = (pct) => RARITY_TIERS.find((t) => pct >= t.min);

export function buildClubStats(clubData, meta, settings) {
  const cfg = settings;
  const members = meta.members;
  const byId = Object.fromEntries(members.map((m) => [m.steamid, m]));
  const dbGames = Object.fromEntries(meta.games.map((g) => [g.appid, g]));
  const fbPct = cfg.firstBloodPct ?? 0.1;
  const profiles = clubData.profiles ?? {};

  // ---- score every game ----
  const games = clubData.games.map((raw) => {
    const db = dbGames[raw.appid] ?? {};
    const adjust = db.adjust ?? 0;
    const table = pointTable(raw.ach, cfg, adjust);
    const achById = Object.fromEntries(raw.ach.map((a) => [a.id, a]));
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
        pct: raw.ach.length ? Math.round((unlocks.length / raw.ach.length) * 100) : 0,
        complete, lastUnlock,
        firstUnlock: firstUnlock === Infinity ? 0 : firstUnlock,
        missing: raw.ach.filter((a) => !unlocks.some((u) => u.id === a.id)),
      };
    }
    return {
      ...raw,
      name: db.name ?? raw.name,
      adjust, race: db.race ?? false, notes: db.notes ?? "",
      diff: table.diff, pool: table.pool, table, achById, players,
    };
  });

  // ---- events (unlocks + completions + first blood) ----
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
        events.push({
          sid, appid: g.appid, gameName: g.name, t: u.t, kind: "unlock",
          pts: base + fb, firstBlood: fb > 0,
          achId: u.id, achName: a?.name ?? u.id, pct: a?.pct ?? 0,
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
  events.sort((a, b) => a.t - b.t);

  // ---- totals, season, streaks ----
  const seasonCut = quarterStart();
  const perPlayer = Object.fromEntries(members.map((m) => [m.steamid, {
    ...m, avatar: profiles[m.steamid]?.avatar ?? null,
    points: 0, seasonPoints: 0, perfects: 0, started: 0,
    weeks: new Set(), rarestUnlock: null, spans: [], playtimeMin: 0,
  }]));
  for (const e of events) {
    const p = perPlayer[e.sid];
    if (!p) continue;
    p.points += e.pts;
    if (e.t >= seasonCut) p.seasonPoints += e.pts;
    p.weeks.add(isoWeek(e.t));
    if (e.kind === "unlock" && (!p.rarestUnlock || e.pct < p.rarestUnlock.pct)) p.rarestUnlock = e;
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
    p.seasonPoints = Math.round(p.seasonPoints);
    p.avgSpanDays = p.spans.length ? p.spans.reduce((s, x) => s + x.days, 0) / p.spans.length : null;
    p.closerRate = p.started ? p.perfects / p.started : 0;
    p.hardestClear = games.filter((g) => g.players[p.steamid]?.complete)
      .reduce((m, g) => (g.diff > (m?.diff ?? 0) ? g : m), null);
  }

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
  const hallOfFame = events.filter((e) => e.kind === "unlock")
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
  const seasonBoard = [...board].sort((a, b) => b.seasonPoints - a.seasonPoints);
  const histogram = Array.from({ length: 10 }, (_, i) => ({
    diff: i + 1, games: games.filter((g) => g.diff === i + 1).length,
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

  return {
    games, byId, board, seasonBoard, season: quarterOf(), events, feed,
    hallOfFame, graveyard, records, recs, races, challenge, timeline,
    histogram, scatter, clubTotals, perPlayer, profilesPlaytime,
  };
}
