---
type: ops
status: live
files: [lib/steamFetch.js, lib/clubSync.js, api/refresh.js]
---
# Steam Refusal Handling

**The failure it fixes** — the carry-forward fix ([[Ownership Carry-Forward]]) only listened for *hard* misses (retries exhausted). But Steam speaks 400/403 in **two dialects**: an *answer* with a JSON body ("Requested app has no stats" = never played; private profile) and a bare *refusal* (throttle page, empty body, no answer at all). The old code lumped both into `data: null, hardMiss: false` — so a throttle-403 on a player call bypassed the hole patch, silently dropped that player from a freshly-fetched game, and the hole overwrote good cache. That was the 9→8 perfect drop, a day after the "fix."

**How it works now, three layers deep:**

1. **The body is the signal, not the status.** On 400/403, `steamJSON` parses the body: valid JSON → an answered negative, flows through as data (the games loop already treats `success:false` as legitimate absence). Unparseable → a refusal → retried with backoff, `hardMiss` on exhaustion. After this, `data: null` means exactly one thing everywhere: **unanswered**.
2. **Every null is a miss.** Player calls: null → `playerMisses` → cached unlocks patched in. Global/schema: null → game not emitted, cached copy carries. Owned: already guarded by the games-array check. No status code can punch a hole anymore — only an *answer* can change data.
3. **The downgrade guard** (belt-and-suspenders for dialects not yet met): Steam unlocks are effectively append-only, so a "successful" response with **fewer unlocks than the cache, on an unchanged achievement list**, is a partial answer — cached unlocks win, counted in `playersCarried`. When the ach list changed, the fetch is trusted (schemas evolve; the rare dev-side reset rewrites the list too).

**The force lever** — corrupted entries are stamped *fresh* by the pass that broke them, so staleness never revisits them. Now:
`/api/refresh?force=all&secret=CRON_SECRET` (or `force=appid,appid`) puts forced games at the head of the queue, oldest stamp first, under the normal slice budget. Loop until `forcedRemaining: 0`; games re-fetched in the last 10 min count as done, so `force=all` converges. Secret-gated — it burns real Steam quota.

**Recovery drill for "my number is wrong":** deploy → `force=all` loop → watch `playersCarried`/`ownedCarried` in the responses → the count self-corrects; crowns and every derived stat follow automatically since nothing is stored. If a specific game misbehaves, force just its appid.

**Tests** — T9/T10 in `test-ownership.mjs` (suite now 35): bodiless-403 → miss → patch (owned + player), answered-403 still legitimate, downgrade guard both directions.
