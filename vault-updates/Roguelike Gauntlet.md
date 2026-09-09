---
type: feature
status: live
files: [src/lib/gauntlet.js, src/components/Gauntlet.jsx, src/components/Trophies.jsx, src/App.jsx, api/db.js, migration-v15.sql]
---
# Roguelike Gauntlet

**The game** (`#/gauntlet`): the wheel decides your fate twice — first WHICH designated roguelike you own runs next, then the route/character/deck you must win with. Beat it → streak +1, that game leaves your wheel, spin again. Clear every roguelike you own → the **lap rolls** (🔁 badge), the pool refills, the streak keeps climbing. Fall → the streak dies at zero and everything returns. Honor system by design (run outcomes aren't Steam-verifiable) and **glory-only** — the main points economy is untouched, same policy as bingo.

**Mechanics that matter:**
- One pending assignment per member (`gauntlet_state`), enforced server-side — spin, seal, then the 🏆/💀 buttons take over. The resolve op writes the event **from the state row**, not the request: the server remembers what fate assigned.
- Everything else is DERIVED from the immutable `gauntlet_events` win/loss log (`lib/gauntlet.js`) — streaks, laps, pools, the Hall. Nothing stored means nothing desyncs; the events fetch pages past PostgREST's 1000-row cap (the Burndown lesson, pre-learned this time).
- Routeless roguelikes assign **"Win a run"** — designation without curation still works.
- The pool is defensive: designation changes can never strand a member with a dead wheel.
- Ownership from the club playtime maps; unknown ownership (private profile) shows all designated games with a ⚠ note, Wheel-page style.

**Hall of Streaks**: every streak ever, ranked — top 20, one member may hold half the board. Longer first; ties go to whoever got there first. Each entry: cover-art chain with route + date under every win, 🔁 lap badges, **💀 + the game that ended it** (faded) on finished streaks, pulsing → … on active ones. Covers use the club's overrides, falling back to Steam capsule art.

**Designate tab**: mark club games as roguelikes, routes one-per-line (≤40 routes, ≤60 chars). Removing a designation dissolves any pending runs on it. Club-key gated like every mutation.

**Trophy Room**: ⚔️ Gauntlet legends panel — top 3 streaks with ACTIVE/ended status.

**Deploy**: run `migration-v15.sql` in the Supabase SQL Editor, push the deltas. Pre-migration payloads tolerate as empty.

**Tests** — `node test-gauntlet.mjs` (13): pool shrink/lap-roll/loss-reset, dead-wheel defense, streak walking (finished + active, death game, lap counting, lost-first-spin excluded), Hall ranking (multi-entry, first-to-the-record tiebreak, top-N cap).
