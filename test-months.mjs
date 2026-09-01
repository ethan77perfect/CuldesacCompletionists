// test-months.mjs — the club clock: month buckets must not depend on the
// viewer's timezone. Run me under several TZs and I must pass identically:
//   TZ=UTC node test-months.mjs
//   TZ=America/New_York node test-months.mjs
//   TZ=Pacific/Kiritimati node test-months.mjs   (UTC+14, the far edge)
import { monthKey, computeHunt } from "./src/lib/stats.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n      got  ${g}\n      want ${w}`); }
};
console.log(`viewer TZ: ${process.env.TZ ?? "(system)"}`);

// Aug 31 2026, 11:30pm EDT — the contested pull-ahead window (= Sep 1 03:30 UTC)
const lateAug = Date.UTC(2026, 8, 1, 3, 30) / 1000;
// Sep 1 2026, 00:15am EDT — just across the club midnight
const earlySep = Date.UTC(2026, 8, 1, 4, 15) / 1000;
eq("11:30pm Aug 31 club time is August, for every viewer", monthKey(lateAug), "2026-08");
eq("00:15am Sep 1 club time is September, for every viewer", monthKey(earlySep), "2026-09");
// DST edges: 1:30am EST after fallback (Nov 1), 3:30am EDT after springforward (Mar 8)
eq("DST fallback instant buckets by club wall clock", monthKey(Date.UTC(2026, 10, 1, 6, 30) / 1000), "2026-11");
eq("DST springforward instant buckets by club wall clock", monthKey(Date.UTC(2026, 2, 8, 7, 30) / 1000), "2026-03");

// Hunt boundaries follow the same clock: X races at 11:30pm Aug 31,
// Y is a July veteran, Z unlocked 30min into club September — no credit.
const hunt = { month: "2026-08", achievements: [{ appid: 1, id: "a1", name: "A", pct: 5, base: 100 }] };
const games = [{ appid: 1, name: "G", players: {
  X: { unlocks: [{ id: "a1", t: lateAug }] },
  Y: { unlocks: [{ id: "a1", t: Date.UTC(2026, 6, 15, 12) / 1000 }] },
  Z: { unlocks: [{ id: "a1", t: Date.UTC(2026, 8, 1, 4, 30) / 1000 }] },
} }];
const h = computeHunt(hunt, games, [{ steamid: "X" }, { steamid: "Y" }, { steamid: "Z" }]);
const bySid = Object.fromEntries(h.standings.map((s) => [s.sid, { pts: s.pts, captures: s.captures, veteran: s.veteran }]));
eq("late-night racer takes 1st place points", bySid.X, { pts: 100, captures: 1, veteran: 0 });
eq("July unlock = veteran credit", bySid.Y, { pts: 60, captures: 0, veteran: 1 });
eq("club-September unlock earns nothing in the August hunt", bySid.Z, { pts: 0, captures: 0, veteran: 0 });
eq("winner is the racer, for every viewer", h.winner, "X");

// memo perf smoke: 100k keys must be effectively free
const s = Date.now();
for (let i = 0; i < 100000; i++) monthKey(1756000000 + i * 60);
const ms = Date.now() - s;
eq(`memoized monthKey is fast (${ms}ms for 100k)`, ms < 500, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
