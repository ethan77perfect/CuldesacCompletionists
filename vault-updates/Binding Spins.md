---
type: feature
status: live
files: [src/components/Wheel.jsx, api/db.js, api/cron.js, src/lib/stats.js, src/App.jsx, supabase/migration-v12.sql]
---
# Binding Spins

**The rule** — Personal wheel: spin 1 is an *offer* (sign it, or burn your single re-spin — the re-spin signs itself, no questions asked). Public wheel: the week's first spin auto-signs for the whole club, behind a two-click arming step so nobody fat-fingers the law. Casual wheel unchanged: free, infinite, stakeless.

**Why refreshing can't skirt it** — the SERVER draws the winner and persists it *before* the wheel finishes animating; the animation is a reveal, not a decision. Refresh mid-spin and the offer greets you from `meta.contracts` on reload. Offers live as contracts rows with `status='offered'` (v12): no multiplier, no ledger, invisible to scoring — but the wheel is locked to sign-or-burn until resolved. A partial unique index prevents a two-tab race from opening two offers. Stale never-signed offers die silently at the Monday sweep.

**Why the ✕ can't skirt it either** — `spinPersonal`/`spinBounty` only look for a contract row in the *current week*, so tearing up a signed contract used to hand the spin (and the re-spin) straight back. Now `abandonContract` refuses anything whose week hasn't ended — offered *or* signed — and the ledger shows a 🔒 instead of the ✕ for this week's rows. Last week's expired/fulfilled entries can still be cleared. (Same rule for the club bounty: posted is posted until Monday.)

## The spin itself

**Two-phase animation** — the wheel no longer waits for the server before moving. Hitting the hub starts a `requestAnimationFrame` loop in a *free* phase (constant velocity `OMEGA = 1.75°/ms`, ≈4.9 rev/s) while the spin request is in flight. When the reply lands, `landOn()` hands off to the friction curve `θ(t) = total·(1−(1−t)⁴)` with `D = 4·total/OMEGA`, so the curve's initial velocity equals the free-phase velocity — the wheel simply starts running out of spin. The target is the first rotation ≥ 4.5–5.5 turns ahead that is ≡ (360 − landing) mod 360, so it is always whole turns plus the landing offset. The handoff re-anchors on the last painted frame's time and angle, so no degrees go missing between "reply arrived" and "next frame". A server error brakes the wheel in 0.9 s with no result (`fizzle()`); the error banner explains. Casual mode draws locally and goes straight to the friction curve.

**The panel never lies** — `verdict` is the server's answer for the spin that just landed (offer with its contract id, or signed + bound). It overrides `meta.contracts` / `contractView` from the moment the wheel stops until meta reloads with the same truth (`useEffect(() => setVerdict(null), [meta])`). Before this, the re-spin's landing panel showed the *previous* offer — Burn button included — for the 1–2 s the meta reload took, and pressing it earned a 409.

**Reload timing** — `mutate(op, body, msg, { quiet, reloadAfter })`: the Wheel passes a promise it settles on landing; App races it against a 12 s cap (leave the page mid-spin and the reload still happens). Replaced the old fixed 6600 ms timer. The result/drum reset is keyed on the wheel's *shape* (`appid:sweep` string), not array identity, so the reload that follows every contract spin no longer un-highlights the winning slice.

**Honesty clause** — a clubKey holder could always curl a contract into existence; the enforcement target is casual skirting (refresh, ✕), not cryptography.
