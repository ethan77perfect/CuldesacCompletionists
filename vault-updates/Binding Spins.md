---
type: feature
status: live
files: [src/components/Wheel.jsx, api/db.js, api/cron.js, src/lib/stats.js, src/App.jsx, supabase/migration-v12.sql]
---
# Binding Spins

**The rule** — Personal wheel: spin 1 is an *offer* (sign it, or burn your single re-spin — the re-spin signs itself, no questions asked). Public wheel: the week's first spin auto-signs for the whole club, behind a two-click arming step so nobody fat-fingers the law. Casual wheel unchanged: free, infinite, stakeless.

**Why refreshing can't skirt it** — the SERVER draws the winner and persists it *before* the wheel animates; the animation is a reveal, not a decision. Refresh mid-spin and the offer greets you from `meta.contracts` on reload. Offers live as contracts rows with `status='offered'` (v12): no multiplier, no ledger, invisible to scoring — but the wheel is locked to sign-or-burn until resolved. `abandonContract` refuses offers; a partial unique index prevents a two-tab race from opening two offers. Stale never-signed offers die silently at the Monday sweep.

**Honesty clause** — a clubKey holder could always curl a contract into existence; the enforcement target is casual refresh-skirting, not cryptography. Signed contracts keep the existing tear-up rule — say the word if auto-signed should mean un-tear-uppable too.
