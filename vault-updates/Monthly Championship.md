---
type: feature
status: live
files: [src/lib/stats.js, src/App.jsx, src/components/Home.jsx, src/components/PlayerPage.jsx, src/components/Compare.jsx]
---
# Monthly Championship

**What it does** — the quarterly "This season" tab is now **This month** (calendar month, main points economy), with an **Achievements** column instead of Streak (a 4-week streak is meaningless). A fourth board tab, **🏆 History**, records the club's era month by month starting **August 2026**: finished months show their champion 👑 (ties = co-champions; silent months = "the club slept — no crown awarded"), the current month shows live standings clearly badged *in progress — crown at month's end*, and a **Banners** strip tallies who's won the most months. The reigning champ (winner of the latest *finished* month) also shows on **Home** and earns badges: **Month Champion** (1+) and **Dynasty** (3+).

**How it works** — all client-computed from the events stream in stats.js; zero schema, zero cron. `CHAMPIONSHIP_START = "2026-08"` gates the era: older unlocks still score all-time, but no retroactive crowns. Crowns use the same event pts as the all-time board (unlocks, completion bonuses, first blood, pioneer, contracts, claims); Hunt stays its own economy. First crown lands **Sept 1** — until then Home shows no champion strip and History shows August in progress, both by design.

## Tweak ideas
- [ ] Discord digest crown announcement on the 1st ("👑 August belongs to Alex")
- [ ] Crown emoji next to the reigning champ's name in the activity feed
- [ ] A "title defenses" stat (consecutive months held)
