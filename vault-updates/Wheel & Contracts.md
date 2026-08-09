---
type: feature
status: live
files: [src/components/Wheel.jsx, src/lib/stats.js, api/db.js]
---
# Wheel & Contracts

**What it does** — personal wheel (your unfinished games, fat slices = closest to 100%) signs a 1.5× contract; public wheel (whole library, equal slices) posts a 2× club bounty. Contract points/kills feed a third leaderboard mode.

**How it works** — winner picked by weight first, wheel rotated to land on it. Contracts table; multiplier applies to unlocks after acceptance; max wins on overlap, no stacking. Fulfillment derived (100% at/after acceptance).

## Tweak ideas
- [ ] Contract expiry / penalty for abandoning
- [ ] Daily deterministic club spin posted to the feed
