# ARCHITECTURE — how this thing actually works

Written for someone comfortable with programming (you) who is newer to web
stacks. Read this once and the codebase should stop feeling like magic.

## The 30-second version

```
Browser (React app, src/)
   │
   ├── GET /api/db      ──►  Supabase (roster, game list, rules, backlog)
   ├── GET /api/club    ──►  Steam Web API (achievements, rarity, unlocks)
   └── POST /api/db     ──►  Supabase writes (gated by CLUB_KEY)

All scoring/derived stats happen IN THE BROWSER (src/lib/), on raw data.
The api/ functions are thin: fetch, sanitize, cache, return JSON.
```

Why score in the browser? So the settings sliders are instant — dragging
one re-runs the math over data already in memory instead of re-fetching.

## The pieces

**Vercel** hosts two different things from one repo:
- `src/` + `index.html` → built by Vite into static files (the website)
- `api/*.js` → each file becomes a serverless function at `/api/<name>`.
  "Serverless" = the function spins up per request, runs, dies. No server
  to maintain; the tradeoff is a time limit per invocation and no memory
  between calls (which is why nothing is stored in api/ code — state
  lives in Supabase or the browser).

**Supabase** is hosted Postgres. Four tables: `members`, `games`,
`settings` (a single JSON row), `backlog`. Only the api/ functions talk
to it, using the service key from env vars. Row Level Security is ON with
no policies = the anon public key can read nothing; only our backend can.

**Steam Web API**: three endpoints do the real work —
`GetPlayerAchievements` (per player per game: what's unlocked, when),
`GetGlobalAchievementPercentagesForApp` (rarity), `GetSchemaForGame`
(achievement names). Plus `GetPlayerSummaries` (avatars) and
`GetOwnedGames` (playtime). Quirks we've learned the hard way: schema
game names are unreliable (we use the store API instead at add-time);
rate limiting kicks in on bursts (hence batching + retry + the
concurrency pool); 403 means a private profile.

## Data flow on page load

1. `App.jsx → loadAll()` fetches `/api/db` → members, games, settings.
2. It then fetches `/api/club` in batches of 12 appids (big clubs =
   ~1000 Steam calls; batching keeps each serverless invocation small
   and lets the UI render progressively). A batch reporting `failed > 0`
   (Steam throttled) is retried after a cool-off and never CDN-cached.
3. Raw results land in React state (`meta`, `clubData`).
4. `buildClubStats()` (src/lib/stats.js) computes EVERYTHING derived:
   difficulty, points, leaderboards, seasons, streaks, badges, feed,
   records, recommendations. It re-runs automatically when settings
   change (see the useMemo in App.jsx).
5. Page components render slices of that one `stats` object. They do
   no math and no fetching — display only.

## Writes

Every mutation goes through `mutate()` in App.jsx → `POST /api/db` with
`{ op, clubKey, ...payload }`. The function checks `clubKey` against the
CLUB_KEY env var, does the Supabase write, and the frontend reloads.
One door for all writes = one place to debug.

## File map

```
api/db.js        all database reads/writes (the op switch)
api/club.js      Steam data fetcher (pool, retries, batching)
api/steam.js     legacy debug proxy — unused by the site, deletable
src/lib/scoring.js   pure math: rarity → difficulty, points, pools
src/lib/stats.js     the brain: raw data → every derived feature
src/App.jsx          data owner, router, 4 inline pages, settings
src/components/ui.jsx        design system + shared widgets
src/components/*.jsx         one file per page
supabase/*.sql       schema + migrations (run in Supabase SQL editor)
```

## "How do I…" recipes

**Change scoring math** → src/lib/scoring.js. Difficulty curve is
`difficultyFromRarity`; point distribution is `pointTable`. Test in
isolation: `node --input-type=module -e "import {...} from './src/lib/scoring.js'; ..."`.

**Add a badge** → stats.js, `badgeDefs` array, one line. See comment there.

**Add a stat/record/widget** → compute it in stats.js (add to the return
object), then render it in the relevant component. Follow the pattern of
any existing one.

**Add a database field** → (1) SQL migration adding the column,
(2) api/db.js: accept it in the relevant op, (3) it flows to the
frontend automatically via the GET (which selects *).

**Add a new page** → NAV array + page-switch line in App.jsx, new file in
components/. Its props come from what App passes (stats, meta, mutate, nav).

**Add a whole new API route** → new file api/whatever.js exporting a
default `handler(req, res)`. It's live at /api/whatever on next deploy.

**Change colors/fonts** → the `S` object in ui.jsx (plus index.html for
the font imports and App.jsx's small `<style>` block for hover states).

**Debug production** → Vercel → your deployment → Logs shows server-side
errors; browser DevTools (F12) → Network tab shows every request/response;
visiting /api/db or /api/club?... directly shows raw JSON.

**Local development** → `npm install` once, then `npm run dev`
(frontend only, at localhost:5173) or `vercel dev` with a filled-in
`.env` (frontend + api functions together).

## React in five bullets (enough for this codebase)

- A component = a function returning JSX. It RE-RUNS entirely whenever
  its state or props change; the framework diffs the output into the DOM.
- `useState(init)` → `[value, setValue]`. Never assign to value directly;
  call the setter, which schedules a re-render.
- Props flow parent → child as function arguments. Data down, callbacks up.
- `useMemo(fn, deps)` caches a computation until deps change. `useEffect(fn,
  [])` runs side effects (like our initial fetch) after first render.
- Lists need a stable `key` prop so React can track items across renders.

## Gotchas we've already hit (so you don't re-hit them)

- Env var changes on Vercel do nothing until you REDEPLOY.
- Steam schema names lie; store API names don't.
- Steam rate-limits bursts; batch and back off.
- Never cache a throttled response (it poisons the CDN for 5 min).
- Achievements' "global %" is relative to owners who launched the game —
  hard games attract hardcore players, so rarity understates their
  difficulty (that's why club adjustments exist).
