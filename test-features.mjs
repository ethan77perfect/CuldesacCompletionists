// test-features.mjs — hunt focus scoring, the 5-game bingo deal, and
// retroactive bingo winners. Run: node test-features.mjs
import { computeHunt, HUNT_FOCUS_WEIGHTS } from "./src/lib/stats.js";
import { dealCards, deriveBingoWinners, CARD_GAMES } from "./src/lib/bingo.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n      got  ${g}\n      want ${w}`); }
};
const sept = (d, h = 12) => Date.UTC(2026, 8, d, h) / 1000;   // club September

// ---------------------------------------------------------------
// Focus scoring
// ---------------------------------------------------------------
console.log("Hunt: focus scoring");
const mk = (appid, ids) => ({ appid, name: `G${appid}`, players: {}, ach: [] });
const g1 = mk(1), g2 = mk(2), g3 = mk(3), g4 = mk(4), g5 = mk(5), g6 = mk(6);
const games = [g1, g2, g3, g4, g5, g6];
// A concentrates: 300 raw in g1 (3×100), 100 in g2. B grazes: 80 in each of five.
g1.players.A = { unlocks: [{ id: "a1", t: sept(2) }, { id: "a2", t: sept(3) }, { id: "a3", t: sept(4) }] };
g2.players.A = { unlocks: [{ id: "a4", t: sept(5) }] };
for (const [g, id] of [[g1, "b1"], [g2, "b2"], [g3, "b3"], [g4, "b4"], [g5, "b5"]])
  g.players.B = { unlocks: [{ id, t: sept(6) }] };
const hunt = { month: "2026-09", achievements: [
  ...["a1", "a2", "a3"].map((id) => ({ appid: 1, id, name: id, pct: 5, base: 100 })),
  { appid: 2, id: "a4", name: "a4", pct: 5, base: 100 },
  { appid: 1, id: "b1", name: "b1", pct: 5, base: 80 }, { appid: 2, id: "b2", name: "b2", pct: 5, base: 80 },
  { appid: 3, id: "b3", name: "b3", pct: 5, base: 80 }, { appid: 4, id: "b4", name: "b4", pct: 5, base: 80 },
  { appid: 5, id: "b5", name: "b5", pct: 5, base: 80 },
] };
const members = [{ steamid: "A" }, { steamid: "B" }];
const h1 = computeHunt(hunt, games, members);
const by = Object.fromEntries(h1.standings.map((s) => [s.sid, s]));
eq("concentrated 400 raw → 385 (steeper curve)", by.A.pts, 385);
eq("scattered 400 raw → 280", by.B.pts, 280);
eq("winner is the focused player", h1.winner, "A");
eq("board chips keep RAW place points", h1.board.find((a) => a.id === "a1").results[0].pts, 100);
eq("portfolio rows sorted desc with weights", by.A.portfolio.map((r) => [r.raw, r.weight]), [[300, 1], [100, 0.85]]);

// monotonicity: B captures 50 more in g3 → total can only rise
const hunt2 = { ...hunt, achievements: [...hunt.achievements, { appid: 3, id: "b6", name: "b6", pct: 5, base: 50 }] };
g3.players.B.unlocks.push({ id: "b6", t: sept(7) });
const h2 = computeHunt(hunt2, games, members);
eq("capturing never lowers the total", Object.fromEntries(h2.standings.map((s) => [s.sid, s.pts])).B > 280, true);
g3.players.B.unlocks.pop();

// veteran credit runs through the weights; rank 6 clamps to the last weight
const g7 = mk(7); g7.players.C = { unlocks: [{ id: "v1", t: Date.UTC(2026, 7, 10) / 1000 }] };
const hv = computeHunt({ month: "2026-09", achievements: [{ appid: 7, id: "v1", name: "v1", pct: 5, base: 100 }] },
  [g7], [{ steamid: "C" }]);
eq("veteran unlock → 0.6 × base × top weight", [hv.standings[0].pts, hv.standings[0].veteran], [60, 1]);
for (const [g, id] of [[g6, "b7"]]) g.players.B = { unlocks: [{ id, t: sept(8) }] };
const hunt6 = { month: "2026-09", achievements: [1, 2, 3, 4, 5, 6].map((n) => ({ appid: n, id: `s${n}`, name: `s${n}`, pct: 5, base: 100 })) };
for (const [i, g] of [g1, g2, g3, g4, g5, g6].entries()) g.players.D = { unlocks: [{ id: `s${i + 1}`, t: sept(9) }] };
const h6 = computeHunt(hunt6, games, [{ steamid: "D" }]);
eq("6th game clamps to the last weight (390)", h6.standings[0].pts, 390);
const hOverride = computeHunt(hunt, games, members, { huntFocusWeights: [1, 1, 1, 1, 1] });
eq("cfg can flatten the curve", Object.fromEntries(hOverride.standings.map((s) => [s.sid, s.pts])).B, 400);

// ---------------------------------------------------------------
// The 5-game deal
// ---------------------------------------------------------------
console.log("Bingo: 5-game difficulty-balanced deal");
const mkGame = (appid, diff, n = 8) => ({
  appid, name: `G${appid}`, diff, players: {},
  ach: Array.from({ length: n }, (_, i) => ({ id: `x${i}`, name: `x${i}`, pct: i === 0 ? 1 : i < 3 ? 4 : 20 })),
});
const libGames = [mkGame(11, 8), mkGame(12, 8), mkGame(13, 8), mkGame(14, 2), mkGame(15, 2),
  mkGame(16, 5), mkGame(17, 5), mkGame(18, 5), mkGame(19, 5), mkGame(20, 2)];
const statsM = { games: libGames, profilesPlaytime: { M: Object.fromEntries(libGames.map((g) => [g.appid, 60])) } };
const d1 = dealCards(statsM, { members: [{ steamid: "M" }] });
const card = d1.cards[0];
const perGame = new Map();
for (const c of card.cells) perGame.set(c.appid, (perGame.get(c.appid) ?? 0) + 1);
eq("24 cells dealt", card.cells.length, 24);
eq(`exactly ${CARD_GAMES} games on the card`, perGame.size, CARD_GAMES);
eq("no game exceeds its even quota", Math.max(...perGame.values()) <= 5, true);
const chosenDiffs = [...perGame.keys()].map((a) => libGames.find((g) => g.appid === a).diff);
eq("at most one bruiser (diff ≥7)", chosenDiffs.filter((d) => d >= 7).length <= 1, true);
eq("at least one comfort game (diff ≤3)", chosenDiffs.some((d) => d <= 3), true);
const [rar1, rar2] = [...card.cells].sort((a, b) => a.pct - b.pct);
const cornerSlots = new Set([0, 4, 19, 23]);
eq("two rarest sit on corners", [card.cells.indexOf(rar1), card.cells.indexOf(rar2)].every((i) => cornerSlots.has(i)), true);

const statsSmall = { games: libGames.slice(0, 3), profilesPlaytime: { M: { 11: 5, 12: 5, 13: 5 } } };
const d2 = dealCards(statsSmall, { members: [{ steamid: "M" }] });
eq("3 qualifying games → chunkier 3-game card, still 24 cells",
  [new Set(d2.cards[0].cells.map((c) => c.appid)).size, d2.cards[0].cells.length], [3, 24]);

const statsTiny = { games: [mkGame(30, 5, 10), mkGame(31, 5, 10)], profilesPlaytime: { M: { 30: 5, 31: 5 } } };
const d3 = dealCards(statsTiny, { members: [{ steamid: "M" }] });
eq("total pool under 24 → benched", d3.benched, ["M"]);

const statsOwn = { games: libGames, profilesPlaytime: { N: { 16: 9, 17: 9 } } };
const d4 = dealCards(statsOwn, { members: [{ steamid: "N" }] });
eq("cards only draw from owned games", [...new Set(d4.cards[0]?.cells.map((c) => c.appid) ?? [])].every((a) => [16, 17].includes(a)), true);

// ---------------------------------------------------------------
// Retroactive bingo winners
// ---------------------------------------------------------------
console.log("Bingo: winner derivation from timestamps");
const cellsFor = (appid) => Array.from({ length: 24 }, (_, i) => ({ appid, achid: `c${i}`, ach: `c${i}`, game: `G${appid}`, pct: 10 }));
const roundMeta = {
  bingoRounds: [{ id: 1, label: "Sept", created_at: "2026-09-01T00:00:00Z" }],
  bingoCards: [
    { round_id: 1, steamid: "A", cells: cellsFor(41) },
    { round_id: 1, steamid: "B", cells: cellsFor(42) },
  ],
};
const dealt = Date.parse(roundMeta.bingoRounds[0].created_at) / 1000;
// A completes the top row (cells 0-4), slowest at dealt+500.
// B completes the center column (cells 2,7,16,21 — 4 cells + FREE), slowest at dealt+300 → B wins.
const unlocksA = [0, 1, 2, 3, 4].map((i) => ({ id: `c${i}`, t: dealt + 100 * (i + 1) }));
const unlocksB = [2, 7, 16, 21].map((i, k) => ({ id: `c${i}`, t: dealt + 100 * (k === 3 ? 3 : k + 1) }));
const bingoStats = { games: [
  { appid: 41, players: { A: { unlocks: unlocksA } } },
  { appid: 42, players: { B: { unlocks: unlocksB } } },
] };
const w1 = deriveBingoWinners(bingoStats, roundMeta)[0];
eq("center-free column beats the full row", [w1.winner.sid, w1.winner.at], ["B", dealt + 300]);
eq("no blackout recorded when cards aren't full", w1.blackout, null);
// blackout: B unlocks everything, slowest at dealt+2400; a zero-timestamp cell floors to deal time
const unlocksBAll = Array.from({ length: 24 }, (_, i) => ({ id: `c${i}`, t: i === 5 ? 0 : dealt + 100 * (i + 1) }));
bingoStats.games[1].players.B.unlocks = unlocksBAll;
const w2 = deriveBingoWinners(bingoStats, roundMeta)[0];
eq("blackout detected with slowest-cell time", [w2.blackout.sid, w2.blackout.at], ["B", dealt + 2400]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
