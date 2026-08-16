// ---------------------------------------------------------------
// Scoring engine v2 — TIME IS THE MEASURE.
//
// v1 derived difficulty from global rarity, which had a blind spot
// big enough to need a manual ±3 slider: hard games attract hardcore
// players, deflating their rarity numbers. v2 scraps all of it —
// the rarity difficulty, the slider, the steepness/rarest-weight
// knobs — and replaces the foundation:
//
//   1. The club enters each game's MEDIAN HOURS TO COMPLETE
//      (Settings → Tracked games). This is the one human input.
//   2. DIFFICULTY IS GRADED ON A CURVE. A game's difficulty is its
//      percentile among all rated club games, pushed through the
//      inverse normal CDF and centered on 5.5. That forces a bell
//      shape no matter how skewed the raw hours are: the mid-pack
//      clusters at 5–6, and 9s/10s are rare BY CONSTRUCTION. The
//      curve re-flows every time a game is added or re-timed —
//      every game's percentile moves, so every difficulty can.
//      With ~80 rated games, expect a couple of 1s and 10s, a
//      handful of 2s and 9s, and a big hump in the middle.
//   3. POINTS COME FROM TIME. pool = hours × ptsPerHour (a club
//      rule, default 10 — one point per six minutes of median
//      effort). The pool is then divided among the game's
//      achievements by global rarity exactly as before (inverse-
//      sqrt weighting), and the 100% bonus is still a % slice of
//      the pool. Rarity decides WHERE the points sit inside a
//      game; hours decide HOW MANY points the game is worth.
//
// Games with no hours yet are UNRATED: difficulty null (UI shows ⏱),
// and their pool uses a neutral fallback (the median hours of rated
// games, or cfg.defaultHours before any exist) so the site keeps
// working while the data gets entered. Enter the hours and both
// numbers snap to truth on the next load.
//
// Everything reprices retroactively on every load — that's the
// site's compute-from-source design, and it's what makes the curve
// "fluid" for free.
// ---------------------------------------------------------------

export const DEFAULT_SETTINGS = { bonus: 0.4, ptsPerHour: 10, defaultHours: 20 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;
const FLOOR = 0.05;   // clamp global % to avoid weight blowups

/**
 * Steam reports EXACTLY 0.0% for achievements whose global stats it
 * hasn't computed yet (brand-new ones). That is "unknown", not
 * "rarest thing alive" — so provisional achievements are weighted at
 * the game's own typical (geometric-mean) rarity. They graduate to
 * real values automatically once Steam's data arrives.
 */
export function effectiveAch(ach) {
  const known = ach.filter((a) => a.pct > 0);
  const geo = known.length
    ? Math.exp(known.reduce((s, a) => s + Math.log(Math.max(a.pct, FLOOR)), 0) / known.length)
    : 20;
  return ach.map((a) => (a.pct > 0 ? a : { ...a, pct: geo, provisional: true }));
}

// Inverse standard-normal CDF — Acklam's rational approximation,
// |relative error| < 1.15e-9 across (0,1). Overkill for a game club,
// which is the correct amount of kill.
function invNorm(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
          ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

const SCALE = 2.0;   // 5.5 ± 2σ: ~38% of games land at 5–6, ~7% at 9–10

/**
 * Build the club's difficulty curve from every rated game's hours.
 * Returns a mapper: hours → difficulty (1–10, one decimal), or null
 * for unrated input. Ties share a midrank — identical hours always
 * mean identical difficulty.
 */
export function buildDifficultyCurve(allHours) {
  const rated = allHours.filter((h) => Number.isFinite(h) && h > 0).sort((x, y) => x - y);
  if (!rated.length) return () => null;
  return (hours) => {
    if (!Number.isFinite(hours) || hours <= 0) return null;
    let below = 0, equal = 0;
    for (const h of rated) {
      if (h < hours) below++;
      else if (h === hours) equal++;
      else break;
    }
    const rank = below + (equal + 1) / 2;          // midrank; a new value sits between neighbors
    const p = rank / (rated.length + 1);           // strictly inside (0,1) → invNorm-safe
    return clamp(round1(5.5 + SCALE * invNorm(p)), 1, 10);
  };
}

/**
 * Point value of each achievement in a game, plus the 100% bonus.
 * opts.hours         — this game's median completion hours (null = unrated)
 * opts.curve         — mapper from buildDifficultyCurve (club-wide)
 * opts.fallbackHours — neutral pool stand-in for unrated games
 */
export function pointTable(ach, cfg, { hours = null, curve = () => null, fallbackHours = null } = {}) {
  ach = effectiveAch(ach);
  const rated = Number.isFinite(hours) && hours > 0;
  const effHours = rated ? hours : (fallbackHours ?? cfg.defaultHours ?? 20);
  const pool = Math.round(effHours * (cfg.ptsPerHour ?? 10));
  const earnable = pool * (1 - cfg.bonus);
  const weights = ach.map((a) => 1 / Math.sqrt(Math.max(a.pct, FLOOR)));
  const totalW = weights.reduce((s, w) => s + w, 0) || 1;
  const per = new Map(ach.map((a, i) => [a.id, (weights[i] / totalW) * earnable]));
  return { diff: curve(hours), pool, per, bonusPts: pool * cfg.bonus, hours: rated ? hours : null, unrated: !rated };
}

/** Score one player's progress in one game. */
export function scoreGame(ach, unlocks, cfg, opts = {}) {
  const table = pointTable(ach, cfg, opts);
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
