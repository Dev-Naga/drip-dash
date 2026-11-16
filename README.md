# Drip Dash: inCon-trol Water Systems newsletter game

A one-tap endless runner for the monthly customer newsletter. Drip the water droplet races through a **Turf Field**, a **Pump Station** and a **Fountain Plaza**, dodging sprinkler heads, valve boxes, standpipes, low main lines and geysers. Players collect drops, golden valves and power-ups, and compete on a monthly leaderboard and an all-time board.

| | URL |
|---|---|
| Game | https://dev-naga.github.io/drip-dash/ |
| Leaderboard | https://dev-naga.github.io/drip-dash/leaderboard.html |
| Rules & privacy | https://dev-naga.github.io/drip-dash/rules.html |

> **Status:** live in **DEMO MODE** (scores are saved per browser) until a Supabase project is connected. See [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md), section 1.

## Stack
- **Game:** plain HTML5 Canvas and JavaScript modules. No framework, no build step, about 100 KB plus fonts. All art is drawn in code or SVG, so it stays sharp on retina screens.
- **Hosting:** GitHub Pages (free), deployed automatically by `.github/workflows/deploy-pages.yml` on every push to `main` that touches `site/`.
- **Backend:** Supabase Postgres (free tier). The browser calls 7 locked-down SQL functions; tables are not readable by the public. Schema: [`supabase/schema.sql`](supabase/schema.sql).
- **Keep-alive:** `.github/workflows/supabase-keepalive.yml` pings Supabase daily so the free project doesn't pause.

## Folder map
```
site/                  ← everything that is published
  index.html           game shell and screens
  leaderboard.html     standalone leaderboard page
  rules.html           contest rules and privacy notice (contains [placeholders])
  css/style.css        brand styles
  js/config.js         ← put Supabase URL and publishable key here
  js/game.js           engine: physics, obstacles, mascot, scenery
  js/main.js           screens, registration, score submission
  js/api.js            Supabase calls and demo-mode fallback
  js/board.js          leaderboard tabs (month / all-time / companies / past winners)
  js/audio.js          synthesized sound effects
  assets/              logo, mascot SVG, social share image
supabase/schema.sql    database tables, anti-cheat checks, leaderboards, admin views
docs/ADMIN_GUIDE.md    setup, monthly winner routine, HubSpot, costs
docs/newsletter-snippet.html  email-safe block for HubSpot
marketing/             newsletter hero images and their source card
```

## Run locally
```bash
python -m http.server 5173 --directory site
```
Then open http://localhost:5173.

## Anti-cheat summary
- One-time **run tickets** issued by the server when a game starts, and timed by the server's clock.
- Submissions are checked against the game's physical limits: distance per second, drops and valves per second, maximum bonus points, and run length versus server time. Failures are stored as `rejected` for review.
- Each ticket can be used only once and only by its owner. Players are rate-limited per player and per network, and the registration form has a honeypot field.
- Only each player's best score per month counts. Emails are never exposed publicly.
- A human reviews the top scores before winners are announced (see the guide).

## Brand placeholders to confirm
| Item | Current | Replace / confirm |
|---|---|---|
| Logo | `IWS-logo-hozt.png` from Egnyte `Marketing/Logos/Approved Design` (2011 file) | Confirm it's the current approved artwork |
| Fonts | Zilla Slab (stands in for Clarendon), Barlow Condensed (stands in for Univers Condensed) | Licensed web fonts aren't available on free hosting; these are close free matches |
| Accent aqua | `#00C1D5` (PANTONE 3115 C, the 2026 anniversary accent) | Remove after the anniversary year if desired |
| Prizes, eligibility, contact email | `[bracketed]` text in `site/rules.html` | Fill in and have it reviewed |
| Mascot "Drip" | Original design in `site/assets/drip-mascot.svg` | Marketing sign-off |
