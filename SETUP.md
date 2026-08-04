# The 100% Club — setup guide (from zero)

You'll end up with a real website at a URL like `https://the-100-club.vercel.app`
that you and your friends can open on any device. Total cost: $0. Time: ~30–45
minutes the first time. No prior hosting experience assumed.

## The mental model (read this first)

Three free services each do one job:

- **GitHub** stores your code. When you change the code, Vercel notices and
  redeploys automatically.
- **Vercel** runs the website AND the small server functions in the `api/`
  folder. The functions exist so your Steam API key stays secret — browsers
  are never allowed to see it.
- **Supabase** is your database. It remembers the club roster, the tracked
  game list, and your saved scoring rules.

The site itself talks only to your Vercel functions; the functions talk to
Steam and Supabase.

## Part 1 — Accounts and keys (10 min)

1. Make a **GitHub** account at github.com (skip if you have one).
2. Make a **Vercel** account at vercel.com — choose "Continue with GitHub"
   so they're linked.
3. Make a **Supabase** account at supabase.com (also can use GitHub login).
4. Get your **Steam Web API key** at https://steamcommunity.com/dev/apikey
   (any domain name is fine in the form, e.g. `example.com`). Copy the key
   somewhere — treat it like a password.

## Part 2 — Set up the database (5 min)

1. In Supabase, click **New project**. Name it anything, pick a region near
   you, and let it generate a database password (you won't need it directly).
2. Once it finishes provisioning, open **SQL Editor** in the left sidebar,
   click **New query**, paste the entire contents of `supabase/schema.sql`
   from this project, and click **Run**. That creates your three tables.
3. Go to **Project Settings → API** and copy two things:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **service_role key** (under "Project API keys" — click reveal).
     This one is powerful; it never goes anywhere except Vercel's settings.

## Part 3 — Put the code on GitHub (5 min)

Easiest path, no command line needed:

1. On github.com click **+ → New repository**. Name it `steam-100-club`,
   set it to **Private**, and create it.
2. On the empty repo page, click **"uploading an existing file"**.
3. Drag in everything from this project folder EXCEPT `node_modules` and
   `dist` if they exist (the `.gitignore` file covers you if you use git
   later). Make sure the `api/`, `src/`, and `supabase/` folders and
   `package.json`, `vite.config.js`, `index.html` all made it.
4. Click **Commit changes**.

(If you'd rather learn git: install it, then `git init`, `git add .`,
`git commit -m "first"`, and push following GitHub's instructions. Worth
learning eventually, not required today.)

## Part 4 — Deploy on Vercel (10 min)

1. On vercel.com click **Add New → Project**, and **Import** your
   `steam-100-club` repo.
2. Vercel auto-detects Vite. Don't change the build settings.
3. Before clicking Deploy, expand **Environment Variables** and add four:

   | Name | Value |
   |---|---|
   | `STEAM_API_KEY` | your key from Part 1 |
   | `SUPABASE_URL` | your Project URL from Part 2 |
   | `SUPABASE_SERVICE_KEY` | your service_role key from Part 2 |
   | `CLUB_KEY` | a password you invent — this is what lets people edit the club |

4. Click **Deploy**. A minute later you get your URL. Open it — you should
   see "The club is empty."

## Part 5 — Set up the club (5 min)

1. Everyone joining must set their Steam profile to public:
   Steam → Profile → **Edit Profile → Privacy Settings** →
   set **My profile** AND **Game details** to Public. (Without this, the
   Steam API returns nothing for that person.)
2. On your site, open **Club settings**, enter your `CLUB_KEY` in the
   Club key box.
3. Add members: paste each person's Steam profile URL (like
   `steamcommunity.com/id/theirname`) and pick their color.
4. Add games: paste a Steam store URL (like
   `store.steampowered.com/app/1145360/Hades/`) or just the appid number.
   Games without achievements are rejected automatically.
5. Check the Leaderboard tab. Real data. You're live.

## Everyday use

- New achievement unlocks show up within ~5 minutes (there's a short cache).
- Anyone with the URL can view; anyone with the CLUB_KEY can edit.
- The scoring sliders in Club settings preview live for you; **Save as club
  rules** makes them official for everyone.

## Changing the code later

Edit files in your GitHub repo (even directly in the browser via the pencil
icon) and commit — Vercel redeploys automatically in about a minute. To work
locally like a developer: install Node.js from nodejs.org, then in the
project folder run `npm install` once and `npm run dev` to get a local
preview at localhost:5173. For local API functions too, install the Vercel
CLI (`npm i -g vercel`), copy `.env.example` to `.env` with your real
values, and run `vercel dev`.

## If something breaks

- **"Database read failed"** → the two Supabase env vars are wrong or the
  schema wasn't run. Recheck Part 2 and Part 4 step 3, then redeploy
  (Deployments → ⋯ → Redeploy) — env var changes need a redeploy.
- **"Wrong club key"** → what you typed on the site doesn't match the
  `CLUB_KEY` env var on Vercel.
- **A member shows no progress in any game** → their Steam "Game details"
  privacy setting isn't Public.
- **"Steam doesn't recognize that appid"** → double-check the store URL;
  some editions/DLC pages have different appids than the base game.
