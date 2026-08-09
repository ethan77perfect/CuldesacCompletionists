---
type: feature
status: live
files: [src/components/Hunt.jsx, src/lib/stats.js, api/db.js]
---
# Monthly Hunt & Hall of Fame

**What it does** — 5 games, ~100 achievements, race mode: place multipliers 1/.8/.6/.4/.2×. Pre-month owners: flat 0.6× veteran credit, no podium slot. Own economy, never touches main points. Hall of Fame banners per month.

**How it works** — hunts table stores the slate; computeHunt() derives standings from unlock timestamps in the month window; finishing freezes standings (`final` jsonb). Slate generator: 60% rarer-half / 25% mid / 15% wildcard, then human curation.

## Tweak ideas
- [ ] Capture mode variant (first-only scoring) as per-hunt setting
- [ ] Auto-finish when the month ends
