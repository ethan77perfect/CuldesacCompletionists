// test-ownership.mjs — proves the flicker fixes.
// Run: node test-ownership.mjs   (no framework, exits 1 on any failure)
import { fetchClubData } from "./lib/steamFetch.js";
import { mergePayload, buildSnapshotRows, diffAnnouncements, OWNED_DROP_AFTER } from "./lib/clubSync.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n      got  ${g}\n      want ${w}`); }
};

// ---------------------------------------------------------------
// T1: fetchClubData against a mocked Steam.
//   A: healthy everywhere.
//   B: owned → 403 (throttle-style), player call on 1001 → 500s (hard miss).
//   C: owned → 500s (hard miss), player call on 1001 → clean 400 (never played).
//   Game 1002: schema → 500s → must NOT be emitted (carried instead).
// ---------------------------------------------------------------
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const err = (status) => ({ ok: false, status, json: async () => ({}) });
globalThis.fetch = async (url) => {
  if (url.includes("GetPlayerSummaries")) return ok({ response: { players: [
    { steamid: "A", personaname: "Aye", avatarfull: "a.png" },
    { steamid: "B", personaname: "Bee", avatarfull: "b.png" },
    { steamid: "C", personaname: "Sea", avatarfull: "c.png" },
  ] } });
  if (url.includes("GetOwnedGames")) {
    if (url.includes("steamid=A")) return ok({ response: { games: [
      { appid: 1001, playtime_forever: 300, rtime_last_played: 111 },
      { appid: 1002, playtime_forever: 40, rtime_last_played: 99 },
    ] } });
    if (url.includes("steamid=B")) return err(403);   // data null, hardMiss FALSE — still must not wipe
    return err(500);                                   // C: hard miss after retries
  }
  if (url.includes("GetGlobalAchievementPercentagesForApp"))
    return ok({ achievementpercentages: { achievements: [
      { name: "a1", percent: "50.0" }, { name: "a2", percent: "40.0" },
    ] } });
  if (url.includes("GetSchemaForGame")) {
    if (url.includes("appid=1002")) return err(500);   // hard miss → game not emitted
    return ok({ game: { gameName: "Testy", availableGameStats: { achievements: [
      { name: "a1", displayName: "One" }, { name: "a2", displayName: "Two" },
    ] } } });
  }
  if (url.includes("GetPlayerAchievements")) {
    if (url.includes("appid=1002")) return ok({ playerstats: { achievements: [] } });
    if (url.includes("steamid=A")) return ok({ playerstats: { achievements: [
      { apiname: "a1", achieved: 1, unlocktime: 100 }, { apiname: "a2", achieved: 1, unlocktime: 200 },
    ] } });
    if (url.includes("steamid=B")) return err(500);    // hard miss → reported hole
    return err(400);                                   // C never launched — legitimate absence
  }
  throw new Error(`unmocked url: ${url}`);
};

console.log("T1 fetchClubData failure reporting");
const fetched = await fetchClubData("k", ["A", "B", "C"], ["1001", "1002"], { concurrency: 5 });
eq("profileMeta ownedFetched", {
  A: fetched.profileMeta.A.ownedFetched, B: fetched.profileMeta.B.ownedFetched, C: fetched.profileMeta.C.ownedFetched,
}, { A: true, B: false, C: false });
eq("playerMisses reports B on 1001 only", fetched.playerMisses, { 1001: ["B"] });
eq("schema hard-miss game not emitted", fetched.games.map((g) => g.appid), [1001]);
eq("emitted game: A complete, B absent (hole), C absent (never played)",
  Object.keys(fetched.games[0].players), ["A"]);
eq("failed counts hard misses only (C-owned, B-player, 1002-schema)", fetched.failed, 3);
eq("A's playtime landed", fetched.profiles.A.playtime, { 1001: 300, 1002: 40 });
eq("B's summary still landed despite owned 403", fetched.profiles.B.persona, "Bee");

// ---------------------------------------------------------------
// T2: failed ownership fetch carries the previous library wholesale.
// ---------------------------------------------------------------
console.log("T2 ownership carry on failed fetch");
const prev2 = { games: [], profiles: { B: {
  persona: "Bee", avatar: "b.png", playtime: { 2001: 120 }, lastPlayed: { 2001: 5 }, ownedAt: 1000, ownedStrikes: {},
} } };
const m2 = mergePayload(prev2, {
  games: [], failed: 0,
  profiles: { B: { persona: null, avatar: null, playtime: {}, lastPlayed: {} } },
  profileMeta: { B: { ownedFetched: false } }, playerMisses: {},
}, new Set([2001]), 5000);
eq("library carried", m2.payload.profiles.B.playtime, { 2001: 120 });
eq("persona carried through summary failure", m2.payload.profiles.B.persona, "Bee");
eq("ownedAt NOT advanced (the health signal)", m2.payload.profiles.B.ownedAt, 1000);
eq("carried.owned reports B", m2.carried.owned, ["B"]);

// ---------------------------------------------------------------
// T3: strike counter on SUCCESSFUL fetches that omit a game.
// ---------------------------------------------------------------
console.log(`T3 removal strikes (drop after ${OWNED_DROP_AFTER})`);
const fetchNoisy = () => ({   // successful fetch: 3002 present, 3001 mysteriously absent
  games: [], failed: 0,
  profiles: { A: { persona: "Aye", avatar: "a", playtime: { 3002: 60 }, lastPlayed: { 3002: 9 } } },
  profileMeta: { A: { ownedFetched: true } }, playerMisses: {},
});
let p3 = { games: [], profiles: { A: { persona: "Aye", avatar: "a", playtime: { 3001: 50, 3002: 60 }, lastPlayed: {}, ownedAt: 1, ownedStrikes: {} } } };
p3 = mergePayload(p3, fetchNoisy(), new Set([3001, 3002]), 10).payload;
eq("strike 1: carried", [p3.profiles.A.playtime[3001], p3.profiles.A.ownedStrikes[3001]], [50, 1]);
p3 = mergePayload(p3, fetchNoisy(), new Set([3001, 3002]), 20).payload;
eq("strike 2: carried", [p3.profiles.A.playtime[3001], p3.profiles.A.ownedStrikes[3001]], [50, 2]);
const reappear = fetchNoisy(); reappear.profiles.A.playtime[3001] = 55;
const p3b = mergePayload(p3, reappear, new Set([3001, 3002]), 25).payload;
eq("reappearance clears the strike", [p3b.profiles.A.playtime[3001], p3b.profiles.A.ownedStrikes[3001]], [55, undefined]);
p3 = mergePayload(p3, fetchNoisy(), new Set([3001, 3002]), 30).payload;
eq("strike 3: really gone", p3.profiles.A.playtime[3001], undefined);
eq("ownedAt advanced on the successful fetches", p3.profiles.A.ownedAt, 30);

// ---------------------------------------------------------------
// T4: player-hole patch keeps the perfect on the board.
// ---------------------------------------------------------------
console.log("T4 player-hole carry");
const bUnlocks = [{ id: "a1", t: 100 }, { id: "a2", t: 200 }];
const prev4 = { games: [{ appid: 1001, name: "Testy", ach: [{ id: "a1", pct: 50 }, { id: "a2", pct: 40 }],
  players: { B: bUnlocks } }], profiles: {} };
const m4 = mergePayload(prev4, {
  games: [{ appid: 1001, name: "Testy", ach: [{ id: "a1", pct: 50 }, { id: "a2", pct: 40 }],
    players: { A: [{ id: "a1", t: 900 }] } }],
  failed: 1, profiles: {}, profileMeta: {}, playerMisses: { 1001: ["B"] },
}, new Set([1001]), 5000);
const g4 = m4.payload.games.find((g) => g.appid === 1001);
eq("B's unlocks carried into the fetched game", g4.players.B, bUnlocks);
eq("A's fresh unlocks untouched", g4.players.A, [{ id: "a1", t: 900 }]);
eq("playersCarried counted", m4.carried.players, 1);
const m4b = mergePayload(prev4, {
  games: [{ appid: 1001, name: "Testy", ach: [{ id: "a1", pct: 50 }], players: {} }],
  failed: 0, profiles: {}, profileMeta: {}, playerMisses: {},
}, new Set([1001]), 5000);
eq("no reported miss → legitimate absence stays absent", m4b.payload.games[0].players.B, undefined);

// ---------------------------------------------------------------
// T5: the ghost 💯 — a hole followed by a good fetch used to
// re-announce an old perfect. With the patched cache it stays quiet.
// ---------------------------------------------------------------
console.log("T5 ghost re-announce prevention");
const run2game = { appid: 1001, name: "Testy", ach: [{ id: "a1", pct: 50 }, { id: "a2", pct: 40 }], players: { B: bUnlocks } };
const annArgs = (prevPayload) => ({
  prevPayload, fetchedGames: [run2game], nowEpoch: 6000,
  nameOf: { B: "Bee" }, gameName: { 1001: "Testy" }, rarePct: 1.0, pioneerPct: 1.0,
  existingPioneerKeys: new Set(), pioneerFirstScan: false,
  profiles: {}, existingCompletionKeys: new Set(),
});
const holePrev = { games: [{ ...run2game, players: {} }], announceWatermark: { 1001: 5900 } };   // the OLD world's cache
const patchedPrev = { games: [run2game], announceWatermark: { 1001: 5900 } };                    // the NEW world's cache
eq("old world: hole → ghost 💯 fires", diffAnnouncements(annArgs(holePrev)).embeds.length, 1);
eq("new world: patched cache → silence", diffAnnouncements(annArgs(patchedPrev)).embeds.length, 0);

// ---------------------------------------------------------------
// T6: history rows stop dipping — carried library keeps snapshot scope.
// ---------------------------------------------------------------
console.log("T6 snapshot-row stability");
const game6 = { appid: 4001, ach: [{ id: "a1" }], players: {} };   // owned, never started
const rowsCarried = buildSnapshotRows({ games: [game6], profiles: { B: { playtime: { 4001: 10 } } } }, ["B"], "2026-08-31");
const rowsWiped = buildSnapshotRows({ games: [game6], profiles: { B: { playtime: {} } } }, ["B"], "2026-08-31");
eq("carried library → row present", rowsCarried.length, 1);
eq("wiped library (old behavior) → row lost", rowsWiped.length, 0);

// ---------------------------------------------------------------
// T7/T8: edges — brand-new member with a failed first fetch; legacy
// fetch shape without profileMeta.
// ---------------------------------------------------------------
console.log("T7/T8 edges");
const m7 = mergePayload({ games: [], profiles: {} }, {
  games: [], failed: 1,
  profiles: { D: { persona: null, avatar: null, playtime: {}, lastPlayed: {} } },
  profileMeta: { D: { ownedFetched: false } }, playerMisses: {},
}, new Set(), 100);
eq("new member, failed first fetch → empty but sane", [m7.payload.profiles.D.ownedAt, m7.carried.owned], [0, ["D"]]);
const m8 = mergePayload(prev2, {
  games: [], failed: 0,
  profiles: { B: { persona: "Bee", avatar: "b", playtime: {}, lastPlayed: {} } },   // no profileMeta at all
}, new Set([2001]), 7000);
eq("legacy shape: empty map treated as not-fetched → carried", m8.payload.profiles.B.playtime, { 2001: 120 });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
