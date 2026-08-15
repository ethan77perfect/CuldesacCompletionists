---
type: ops
status: live
files: [api/backup.js, src/App.jsx]
---
# Backups & Data Longevity

**The actual risk** — not size: free-tier Supabase keeps **no automatic backups**, so until a file is downloaded, the club's entire history is one copy. Storage itself is a slow, visible problem (500 MB tier; snapshots grow ~40–50 MB/year at current scale → the better part of a decade of headroom, and hitting the cap makes the DB **read-only**, not deleted).

**What's backed up** — Settings → Backups, or hit the URLs:
- **Core** (`/api/backup`) — every human-decision table: members, games, settings, backlog, contracts, hunts, challenges, claims, pioneers, century, covers, bingo. KBs forever. *This is the irreplaceable part* — Steam can regenerate achievement data; nothing regenerates curation.
- **History** (`/api/backup?snapshots=YYYY-MM`) — one month of snapshot rows, day-grouped + steamid-indexed so a month stays well under Vercel's ~4.5 MB response cap even at several-fold club growth. `?manifest=1` lists available months.
- **Not backed up**: `snapshot_cache` — regenerated nightly; a cache, not a record.

**Habit** — download core after big curation sessions (or monthly); grab last month's history when you think of it. Restore = the files are literal row arrays; if disaster strikes, re-inserting is a short scripting session against this exact format.

**Also protecting the data**
- Free projects pause after ~7 days of no activity — the nightly cron is the heartbeat. If cron ever breaks AND nobody visits, expect a "project paused" email; resume promptly.
- The someday lever (not built — not needed): if the dashboard ever shows the DB in the hundreds of MB, roll snapshots older than ~2 years into per-member daily totals (drops per-game granularity for ancient days only). Check the size yearly; that's the whole maintenance plan.
- The money lever: Supabase Pro ($25/mo) adds real daily backups + no pausing, if the club ever wants hands-off.
