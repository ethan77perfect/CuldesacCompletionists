---
type: feature
status: live
files: [src/components/Challenges.jsx, src/lib/stats.js, api/db.js]
---
# Custom Challenges

**What it does** — honor-system goals Steam can't see (Celeste mod maps, self-imposed runs). Claim = difficulty×100 on the MAIN leaderboard, 🎯 in feed, first claim gets first blood, optional proof links.

**How it works** — challenges + claims tables → claim events in stats.js. `settings.countChallenges=false` excludes them from main points. Strawberry Jam lobby ≈ dial mapping documented in the page footer.

## Tweak ideas
- [ ] Club vote on difficulty instead of proposer-sets
- [ ] HUNT/HORSE mode built on this
