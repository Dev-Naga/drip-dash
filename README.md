# Drip Run: the inCon-trol Water Systems newsletter game

**Drip Run** is the site's one and only game: an endless 3D three-lane runner (Three.js) along the Water Trail. Each **world** is a real inCon-trol gallery project; the run loops through the worlds that are live this month for as long as Drip survives. A new world opens on the 1st of each month (see *Worlds* in [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)). Details: [docs/WATER_RUN.md](docs/WATER_RUN.md).

The earlier games (Drip Dash runner, Bring Back the Flow, Splash Escape) are retired: their pages and code are removed from the site, their old addresses redirect to Drip Run, and the database refuses to start, score or rank them. Their past runs stay in the database for the record. They can be recovered from git history (before commit "Drip Run only").

| | URL |
|---|---|
| **Game link (share this one)** | **https://drip-dash-nine.vercel.app/** |
| Leaderboard | https://drip-dash-nine.vercel.app/leaderboard.html |
| Rules & privacy | https://drip-dash-nine.vercel.app/rules.html |

> **Status: LIVE** with the shared Supabase leaderboard.
> - Site (Vercel): https://drip-dash-nine.vercel.app. Old addresses `/run/`, `/flow/` and `/splash/` redirect to `/` (permanent redirects in `vercel.json`).
> - Old address https://dev-naga.github.io/drip-dash/ only redirects here (`?query` and `#hash` kept). Its files are in `redirect/`.
> - Database: Supabase project "Games" (`kkhjnjwmhpzxnqjtprzw`). Admin views (`admin.*`) are in the Supabase SQL editor; see [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).

## Stack
- **Game:** plain JavaScript modules, Three.js 0.160 from the jsDelivr CDN (pinned), no framework and no build step.
- **Hosting:** Vercel (project `drip-dash`, connected to this repo, redeploys on every push to `main`; config, redirects and security headers in `vercel.json`, which publishes the `site/` folder as-is). GitHub Pages only publishes the redirect pages in `redirect/`.
- **Backend:** Supabase Postgres (free tier). `site/js/config.js` holds the project URL and the *publishable* key, which is meant to be public: the tables have RLS on with no policies, so the key can only call these functions: `register_player`, `lookup_company`, `check_display_name`, `fix_display_name`, `get_worlds`, `start_run`, `submit_water_run`, `get_player_summary`, `get_leaderboard`, `get_company_board`, `get_monthly_winners`. Never put the `service_role` / secret key in the site. Schema: [`supabase/schema.sql`](supabase/schema.sql).
- **Scores:** every run needs a one-time server ticket (`start_run`); `submit_water_run` checks the run against the server clock and the game's physics (distance, drops, valves, power-ups and water deliveries possible in that time), accepts each ticket once, and ties it to one player. The leaderboard is each player's best accepted run.
- **Display names:** 3–24 characters, unique (ignoring case, accents, spaces and punctuation), letters/numbers/spaces and `. ' - _` only, with a blocklist for offensive or reserved words (`private.blocked_names`). Checked live on the form and enforced by the database (unique index).
- **Keep-alive:** `.github/workflows/supabase-keepalive.yml` pings Supabase daily so the free project doesn't pause.

## Files
```
site/index.html         Drip Run: title, how-to, sign-up, new-name prompt, results, leaderboard, pause, worlds list
site/leaderboard.html   full-page Drip Run leaderboard
site/rules.html         contest rules and privacy notice
site/js/run-game.js     game engine: Three.js world, worlds (setWorlds), endless laps, obstacles, Drip in 3D
site/js/run-main.js     screens, controls, live worlds from get_worlds, run tickets and score saving
site/js/run-projects.js the inCon-trol projects behind each world (verified gallery info) and photo sources
site/js/names.js        display-name rules for instant feedback (mirrors private.name_problem)
site/js/company.js      business email, company detection and confirmation on sign-up
site/js/api.js, board.js  Supabase calls, demo fallback, leaderboard tabs and states
site/js/config.js       Supabase URL + publishable key
supabase/schema.sql     tables, worlds, name rules, anti-cheat, leaderboards, admin views
supabase/tests/         automated database tests (npm test): Drip Run scoring, worlds, names, security, companies
redirect/               the pages GitHub Pages serves (redirects to Vercel)
docs/                   admin guide, Drip Run notes, newsletter snippet
```

## Run and test locally
```bash
python -m http.server 5173 --directory site
```
Then open http://localhost:5173 (add `?dev&d=600` to jump 600 m into a run for screenshots; never submitted).

Database tests:
```bash
cd supabase/tests && npm install && npm test
```

## Anti-cheat summary
- **Run tickets:** each run gets a one-time ticket from the server, timed by the server's clock and tied to Drip Run and the player. A ticket can be submitted once.
- **Physics limits:** distance, drops, valves, power-ups and water deliveries must be possible in the run's time, the run can't be longer than the server clock says, and the score can't exceed what those pickups are worth.
- **Rejections are kept:** runs that fail a check are stored for review (`admin.rejected_runs`), not silently dropped.
- **Spam protection:** rate limits per player and per network, and a honeypot field on the sign-up form.
- **Human review:** someone checks the top scores before winners are announced.

## Brand placeholders to confirm
| Item | Current | Action |
|---|---|---|
| Logo | `IWS-logo-hozt.png` (Egnyte, Approved Design, 2011) | Confirm it's current |
| Fonts | Zilla Slab and Barlow Condensed, standing in for Clarendon and Univers Condensed | Free web fonts; keep or license the originals |
| Project photos and captions | 6 photos from Egnyte `Project Photos/2024 Portfolio` | Confirm OK to publish and check the captions |
| "Wellbrook", Drip, Gauge, Spritz | Original fictional town and characters | Marketing sign-off |
| Prizes, eligibility, contact | `[bracketed]` text in `site/rules.html` | Fill in and have it reviewed |
