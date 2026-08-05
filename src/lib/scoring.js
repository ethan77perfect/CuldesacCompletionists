// ---------------------------------------------------------------
// Scoring engine — runs in the browser so settings sliders
// recalculate everything live. Mirrors the design documented
// in the project README.
// ---------------------------------------------------------------

export const DEFAULT_SETTINGS = { bonus: 0.4, steepness: 3.0, rarestWeight: 0.65 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const FLOOR = 0.05; // clamp global % to avoid log blowups

/** Difficulty 1–10 from a game's global achievement rarity percentages. */
export function difficultyFromRarity(pcts, cfg) {
  const floored = pcts.map((p) => Math.max(p, FLOOR));
  const rarest = Math.min(...floored);
  const geo = Math.exp(floored.reduce((s, p) => s + Math.log(p), 0) / floored.length);
  const score = (p) => 1 + cfg.steepness * Math.log10(50 / p);
  const blended = cfg.rarestWeight * score(rarest) + (1 - cfg.rarestWeight) * score(geo);
  return clamp(Math.round(blended), 1, 10);
}

/** Point value of each achievement in a game, plus the 100% bonus. */
export function pointTable(ach, cfg) {
  const diff = difficultyFromRarity(ach.map((a) => a.pct), cfg);
  const pool = diff * 100;
  const earnable = pool * (1 - cfg.bonus);
  const weights = ach.map((a) => 1 / Math.sqrt(Math.max(a.pct, FLOOR)));
  const totalW = weights.reduce((s, w) => s + w, 0);
  const per = new Map(ach.map((a, i) => [a.id, (weights[i] / totalW) * earnable]));
  return { diff, pool, per, bonusPts: pool * cfg.bonus };
}

/**
 * Score one player's progress in one game.
 * @param {{id, name, pct}[]} ach       game's achievements with rarity
 * @param {{id, t}[]} unlocks           player's unlocked achievements
 */
export function scoreGame(ach, unlocks, cfg) {
  const table = pointTable(ach, cfg);
  const earned = unlocks.reduce((s, u) => s + (table.per.get(u.id) ?? 0), 0);
  const complete = unlocks.length === ach.length && ach.length > 0;
  const lastUnlock = unlocks.reduce((m, u) => Math.max(m, u.t || 0), 0);
  return {
    diff: table.diff,
    pool: table.pool,
    points: Math.round(earned + (complete ? table.bonusPts : 0)),
    pct: ach.length ? Math.round((unlocks.length / ach.length) * 100) : 0,
    complete,
    lastUnlock,
  };
}

/**
 * Cumulative points per player per month, for the timeline chart.
 * Each unlock contributes its point value at its unlock date; the
 * 100% bonus lands at the date of the final unlock.
 */
export function buildTimeline(games, members, cfg) {
  const events = []; // { sid, t, pts }
  for (const g of games) {
    const table = pointTable(g.ach, cfg);
    for (const [sid, unlocks] of Object.entries(g.players)) {
      for (const u of unlocks) {
        if (u.t) events.push({ sid, t: u.t, pts: table.per.get(u.id) ?? 0 });
      }
      if (unlocks.length === g.ach.length && g.ach.length > 0) {
        const last = Math.max(...unlocks.map((u) => u.t || 0));
        if (last) events.push({ sid, t: last, pts: table.bonusPts });
      }
    }
  }
  if (!events.length) return [];

  const monthKey = (t) => {
    const d = new Date(t * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const start = new Date(Math.min(...events.map((e) => e.t)) * 1000);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const now = new Date();
  while (cursor <= now) {
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

  return months.map((m) => {
    for (const e of byMonth.get(m) ?? []) {
      if (e.sid in totals) totals[e.sid] += e.pts;
    }
    const row = { month: m.slice(2) };
    for (const mem of members) row[mem.name] = Math.round(totals[mem.steamid]);
    return row;
  });
}
