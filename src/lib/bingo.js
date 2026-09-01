// ---------------------------------------------------------------
// lib/bingo.js — the bingo brain, UI-free.
// dealCards + deriveBingoWinners live here (not in Bingo.jsx) so the
// Trophy Room can import winner derivation and the node test suite
// can exercise the deal without a JSX transform. See Bingo.jsx for
// the design commentary; this file is the mechanism.
// ---------------------------------------------------------------

// 12 possible lines on a 5×5 board (slot 12 = FREE center)
export const LINES = [];
for (let r = 0; r < 5; r++) LINES.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
for (let c = 0; c < 5; c++) LINES.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
LINES.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);

export const keyOf = (c) => `${c.appid}|${c.achid}`;
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ---- the deal: 24 uncompleted achievements from 5 games YOU own ----
// v2 deal: pick a handful of games FIRST, then fill the card inside
// them — a card you can chase without juggling a dozen installs.
//   · CARD_GAMES owned, unfinished games with a workable pool (5+
//     eligible achievements); fewer qualifying games → a chunkier
//     card from what exists, padded from small-pool games if needed
//   · difficulty-balanced pick: at most one 7+ bruiser, and at least
//     one ≤3 comfort game when the library has one (unrated = mid)
//   · per-game quotas split 24 as evenly as the pick allows (5 games
//     → 5+5+5+5+4); rarity bands 2/6/16 still shape the draw inside
//     the chosen games; quotas relax only as a last resort
export const CARD_GAMES = 5;

export function dealCards(stats, meta) {
  const cards = [], benched = [];
  for (const m of meta.members) {
    const pt = stats.profilesPlaytime?.[m.steamid] ?? {};
    const known = Object.keys(pt).length > 0;   // empty map = fetch failed, not "owns nothing"
    const perGame = [];                          // { appid, game, diff, pool: [cells] }
    for (const g of stats.games) {
      const mine = g.players[m.steamid] || (known && pt[g.appid] !== undefined);
      if (!mine) continue;
      const p = g.players[m.steamid];
      if (p?.complete) continue;
      const have = new Set((p?.unlocks ?? []).map((u) => u.id));
      const pool = [];
      for (const a of g.ach) {
        if (a.pct <= 0 || have.has(a.id)) continue;   // provisional or already earned
        pool.push({ appid: g.appid, achid: a.id, ach: a.name, game: g.name, pct: a.pct });
      }
      if (pool.length) perGame.push({ appid: g.appid, game: g.name, diff: g.diff, pool });
    }

    // ---- pick the games: qualifying first, difficulty-balanced ----
    const qualifying = shuffle(perGame.filter((e) => e.pool.length >= 5));
    const small = shuffle(perGame.filter((e) => e.pool.length < 5));
    const isHigh = (e) => (e.diff ?? 5) >= 7;
    const isLow = (e) => (e.diff ?? 5) <= 3;
    const chosen = [];
    const lows = qualifying.filter(isLow);
    if (lows.length) chosen.push(lows[0]);                       // reserve one comfort game
    for (const e of qualifying) {                                // fill, capping bruisers at one
      if (chosen.length >= CARD_GAMES) break;
      if (chosen.includes(e)) continue;
      if (isHigh(e) && chosen.some(isHigh)) continue;
      chosen.push(e);
    }
    for (const e of qualifying) {                                // relax the bruiser cap if short
      if (chosen.length >= CARD_GAMES) break;
      if (!chosen.includes(e)) chosen.push(e);
    }
    let totalPool = chosen.reduce((s, e) => s + e.pool.length, 0);
    for (const e of small) {                                     // pad from small pools if still short
      if (totalPool >= 24) break;
      chosen.push(e); totalPool += e.pool.length;
    }
    if (totalPool < 24) { benched.push(m.steamid); continue; }

    // ---- per-game quotas: split 24 as evenly as the pools allow ----
    const quota = new Map();
    let remaining = 24;
    const order = shuffle([...chosen]);                          // who eats the remainder is luck
    order.forEach((e, i) => {
      const even = Math.ceil(remaining / (order.length - i));
      const q = Math.min(even, e.pool.length);
      quota.set(e.appid, q); remaining -= q;
    });
    for (const e of order) {                                     // spill any shortfall to spare pools
      if (remaining <= 0) break;
      const spare = e.pool.length - quota.get(e.appid);
      const add = Math.min(spare, remaining);
      quota.set(e.appid, quota.get(e.appid) + add); remaining -= add;
    }

    // ---- the draw: rarity bands inside the chosen games, quotas held ----
    const pool = chosen.flatMap((e) => e.pool);
    const rare = shuffle(pool.filter((c) => c.pct < 2));
    const mid = shuffle(pool.filter((c) => c.pct >= 2 && c.pct < 8));
    const common = shuffle(pool.filter((c) => c.pct >= 8));
    const picked = [], counts = new Map();
    const take = (bucket, n, relax = false) => {
      for (const c of bucket) {
        if (picked.length >= 24 || n <= 0) return;
        const cap = relax ? 99 : (quota.get(c.appid) ?? 0);
        if (picked.includes(c) || (counts.get(c.appid) ?? 0) >= cap) continue;
        picked.push(c); counts.set(c.appid, (counts.get(c.appid) ?? 0) + 1); n--;
      }
    };
    take(rare, 2); take(mid, 6); take(common, 16);
    take(shuffle([...pool]), 24 - picked.length);         // backfill, quotas held
    take(shuffle([...pool]), 24 - picked.length, true);   // last resort: quotas can make 24 unreachable
    if (picked.length < 24) { benched.push(m.steamid); continue; }

    // rarest two on corners; everything else shuffled into the rest
    picked.sort((a, b) => a.pct - b.pct);
    const [r1, r2, ...rest] = picked;
    const cells = new Array(24);
    const corners = shuffle([0, 4, 19, 23]);             // cell indices of the grid corners
    cells[corners[0]] = r1; cells[corners[1]] = r2;
    const open = shuffle([...Array(24).keys()].filter((i) => cells[i] === undefined));
    shuffle(rest).forEach((c, k) => { cells[open[k]] = c; });
    cards.push({ steamid: m.steamid, cells });
  }
  return { cards, benched };
}

// ---- retroactive glory: derive each round's winners from timestamps ----
// Cards persist in Supabase and every mark is a real Steam unlock with a
// real unlock time, so "who completed a line first, and when" is pure
// computation — no honor system, works for any round still in the DB.
// A line's completion time is its slowest cell; a card's first line is
// the fastest of its 12; the round winner is the earliest first-line
// across members. Cells with no timestamp (Steam sometimes reports 0)
// floor to the deal time — a mark can't predate its card.
export function deriveBingoWinners(stats, meta) {
  const unlockAt = new Map();   // sid -> Map("appid|achid" -> t)
  for (const g of stats.games) {
    for (const [sid, r] of Object.entries(g.players)) {
      if (!unlockAt.has(sid)) unlockAt.set(sid, new Map());
      const mm = unlockAt.get(sid);
      for (const u of r.unlocks) mm.set(`${g.appid}|${u.id}`, u.t);
    }
  }
  return (meta.bingoRounds ?? []).map((round) => {
    const dealtAt = Date.parse(round.created_at) / 1000;
    const rows = (meta.bingoCards ?? []).filter((c) => c.round_id === round.id).map((card) => {
      const tOf = (slot) => {   // grid slot -> unlock time; 12 = FREE; undefined = unmarked
        if (slot === 12) return 0;
        const cell = card.cells[slot < 12 ? slot : slot - 1];
        const t = unlockAt.get(card.steamid)?.get(keyOf(cell));
        return t === undefined ? undefined : Math.max(t, dealtAt);
      };
      let lineAt = null;
      for (const L of LINES) {
        const ts = L.map(tOf);
        if (ts.some((t) => t === undefined)) continue;
        const done = Math.max(...ts);
        if (lineAt === null || done < lineAt) lineAt = done;
      }
      const all = [...Array(25).keys()].map(tOf);
      const blackoutAt = all.some((t) => t === undefined) ? null : Math.max(...all);
      return { sid: card.steamid, lineAt, blackoutAt };
    });
    const lined = rows.filter((r) => r.lineAt !== null).sort((a, b) => a.lineAt - b.lineAt);
    const blacked = rows.filter((r) => r.blackoutAt !== null).sort((a, b) => a.blackoutAt - b.blackoutAt);
    return {
      round,
      winner: lined[0] ? { sid: lined[0].sid, at: lined[0].lineAt } : null,
      blackout: blacked[0] ? { sid: blacked[0].sid, at: blacked[0].blackoutAt } : null,
      lined,
    };
  }).reverse();   // newest first
}
