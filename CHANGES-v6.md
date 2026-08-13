# v6.0 — The Century Club + wheel filters

## Apply
1. Copy over repo, commit, push
2. Supabase SQL Editor → run supabase/migration-v6.sql

## The Century Club (new "Century" page)
Every member curates up to 100 games they intend to 100% in their
lifetime. Yearbook layout: 10×10 wall of Steam cover art, numbered
roll call beside it. Search all of Steam to add games (store-search
proxy — games needn't be club-tracked). Progress against club data:
gold ✓ overlay when perfected, progress bar when started, quiet ○
for untracked picks. Member strip shows everyone's perfected/chosen
count; Common Ground panel lists games on 2+ hundreds (bounty bait).
Hard 100 cap enforced server-side.

## Wheel filters (personal wheel)
- "Owned only" (default ON): skips games the spinner doesn't own,
  via Steam ownership data (auto-disables with a tooltip when the
  profile's game list is private). Now includes never-played free
  games in ownership.
- "My hundred only": restricts the spin to the spinner's Century
  list. Filters stack.
