// ---------------------------------------------------------------
// lib/gauntlet.js — the Roguelike Gauntlet brain, UI-free.
//
// Everything here is DERIVED from the immutable gauntlet_events log
// (win/loss rows, chronological) — streaks are never stored, so they
// can never desync, and edits to history recompute the world.
//
// The rules, as designed at the kitchen table:
//   · your wheel holds the designated roguelikes you own, minus the
//     ones you've beaten THIS LAP
//   · beat your assignment → streak +1, game leaves your wheel
//   · clear every game you own → the lap rolls: all games return,
//     the streak keeps climbing (🔁 lap badge)
//   · lose → streak dies at 0, every game returns
//
// Lap boundaries are evaluated against the CURRENT designated∩owned
// set — if the catalog shifted mid-history, old laps recount against
// today's world. Harmless for a party feature; derived means honest.
// ---------------------------------------------------------------

// Walk one member's events → { streak, beaten, lap, pool } "now".
//   ownedRogues: Set<number> — designated roguelikes this member owns
export function gauntletNow(events, ownedRogues) {
  let streak = 0, lap = 1;
  let beaten = new Set();
  for (const e of events) {
    if (e.kind === "loss") { streak = 0; lap = 1; beaten = new Set(); continue; }
    streak += 1;
    beaten.add(Number(e.appid));
    if (ownedRogues.size && [...ownedRogues].every((a) => beaten.has(a))) {
      lap += 1; beaten = new Set();          // full clear → the lap rolls
    }
  }
  let pool = [...ownedRogues].filter((a) => !beaten.has(a));
  if (!pool.length && ownedRogues.size) pool = [...ownedRogues];   // defensive: never a dead wheel
  return { streak, beaten, lap, pool };
}

// All streaks in a member's history, oldest first. A streak is a
// maximal run of consecutive wins; a loss ends it (and records what
// killed it), the log's tail leaves it ACTIVE. Zero-win streaks
// (lost the very first spin) don't exist as streaks.
export function memberStreaks(sid, events, ownedRogues) {
  const out = [];
  let wins = [], lap = 1, beaten = new Set();
  const flush = (death) => {
    if (wins.length) out.push({
      sid, len: wins.length, wins,
      start: wins[0].at, end: death ? death.at : wins[wins.length - 1].at,
      active: !death, laps: lap - 1,
      death: death ? { appid: Number(death.appid), route: death.route ?? "" } : null,
    });
    wins = []; lap = 1; beaten = new Set();
  };
  for (const e of events) {
    if (e.kind === "loss") { flush(e); continue; }
    wins.push({ appid: Number(e.appid), route: e.route ?? "", at: e.at });
    beaten.add(Number(e.appid));
    if (ownedRogues.size && [...ownedRogues].every((a) => beaten.has(a))) { lap += 1; beaten = new Set(); }
  }
  flush(null);   // whatever remains is the live streak
  return out;
}

// The Hall of Streaks: every streak from every member, ranked. Longer
// first; ties go to whoever GOT there first (earlier last-win date) —
// records belong to the one who set them. One member may hold many
// spots; that's the point.
export function topStreaks(eventsBySid, ownedRoguesOf, n = 20) {
  const all = [];
  for (const [sid, events] of Object.entries(eventsBySid)) {
    all.push(...memberStreaks(sid, events, ownedRoguesOf(sid)));
  }
  const lastWinAt = (s) => Date.parse(s.wins[s.wins.length - 1].at) || 0;
  all.sort((a, b) => b.len - a.len || lastWinAt(a) - lastWinAt(b));
  return all.slice(0, n);
}

// Group a flat, chronologically-sorted event list by member.
export function eventsBySid(events) {
  const by = {};
  for (const e of events ?? []) (by[e.steamid] ??= []).push(e);
  return by;
}
