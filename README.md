# Drip Dash: inCon-trol Water Systems newsletter games

Two browser games share one site, one sign-up and one backend:

| Game | Where | What it is | Leaderboard |
|---|---|---|---|
| **Drip Dash** (main game) | `/` | One-tap endless runner: Drip races through turf fields, a pump station and a fountain plaza, dodging sprinklers, valve boxes, standpipes, low main lines and geysers | Best single run per player |
| **Bring Back the Flow** | `/flow/` | 7-level story adventure: restore Wellbrook's water systems by operating valves, pumps, VFDs, zones, a rain diverter, a water tower and a fountain show | Valley Score (best score on each level, added up) |

Players switch games from the menus: the Drip Dash title screen has a **NEW: Bring Back the Flow** card and its game-over screen has a link; Flow's title screen links back. The leaderboard page has a tab for each game.

**Character customization (Drip Dash):** *Customize Drip* on the title screen (or *Change outfit* after a run) opens the outfit picker:
- Classic Drip and Hard Hat are available from the start.
- Hi-Vis Vest, 25th Anniversary Aqua and Golden Drip unlock at best runs of 1,000, 2,500 and 5,000.

The chosen outfit is worn in the game and shown on the title screen. Bring Back the Flow keeps its own star-based outfits in its Album.

| | URL |
|---|---|
| Drip Dash (main) | https://dev-naga.github.io/drip-dash/ |
| Bring Back the Flow | https://dev-naga.github.io/drip-dash/flow/ |
| Leaderboards | https://dev-naga.github.io/drip-dash/leaderboard.html (add `?game=flow` for Flow) |
| Rules & privacy | https://dev-naga.github.io/drip-dash/rules.html |
| Flow design document | [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) |

> **Status:** live in **DEMO MODE** (scores saved per browser) until a Supabase project is connected. See [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md), section 1.

## Stack
- **Game:** plain HTML5 Canvas and JavaScript modules on a fixed 960×540 stage that scales to any screen. No framework, no build step, and all art is drawn in code. Portrait phones get a "rotate" prompt with a "play anyway" option.
- **Hosting:** GitHub Pages, deployed automatically by `.github/workflows/deploy-pages.yml` on every push to `main` that touches `site/`.
- **Backend:** Supabase Postgres (free tier). The browser calls 7 locked-down SQL functions. Per-level score limits and minimum durations live in `private.levels`. Schema: [`supabase/schema.sql`](supabase/schema.sql).
- **Keep-alive:** `.github/workflows/supabase-keepalive.yml` pings Supabase daily so the free project doesn't pause.

## Folder map
```
site/
  index.html            Drip Dash (runner): title, outfits, how-to, register, game over, leaderboard
  js/game.js, main.js   runner engine (+ outfits) and runner screens
  flow/index.html       Bring Back the Flow: title, story, register, briefing, results, album, leaderboard
  js/flow-main.js       Flow screens
  js/engine.js          stage scaling, input, loop, particles, Drip + Gauge characters, dialog
  js/kit.js             living-blueprint parts: Pipe, Valve, Pump, Meter, Tank, Slider, Btn
  js/levelbase.js       shared level framework (timer, golden drops, scoring, win/fail)
  js/levels/*.js        one file per level  ← add new levels here (+ index.js)
  js/map.js             Wellbrook Valley map
  js/progress.js        local progress, achievements, outfits
  js/main.js            app controller
  js/api.js, board.js   Supabase calls, demo fallback, leaderboard tabs
  js/config.js          ← Supabase URL + publishable key go here
  assets/projects/      real project photos (resized from Egnyte marketing library)
supabase/schema.sql     tables, level limits, anti-cheat, Valley Score leaderboards, admin views
supabase/tests/         automated database tests (npm test)
docs/                   design doc, admin guide, newsletter snippet
marketing/              newsletter hero images
```

## Run and test locally
```bash
python -m http.server 5173 --directory site
```
Then open http://localhost:5173 (runner) or http://localhost:5173/flow/ (add `?level=L4&dev` to jump to a Flow level).

Database tests:
```bash
cd supabase/tests && npm install && npm test
```

## Anti-cheat summary
- **Run tickets:** each level attempt gets a one-time ticket from the server, timed by the server's clock and bound to that level and player.
- **Per-level limits:** each level has a maximum score and a minimum duration. Repeatable in-level bonuses are capped so honest players can't exceed the maximum.
- **Rejections are kept:** runs that fail a check are stored for review, not silently dropped.
- **Spam protection:** rate limits per player and per network, and a honeypot field on the sign-up form.
- **Human review:** someone checks the top scores before winners are announced.

## Brand placeholders to confirm
| Item | Current | Action |
|---|---|---|
| Logo | `IWS-logo-hozt.png` (Egnyte, Approved Design, 2011) | Confirm it's current |
| Fonts | Zilla Slab and Barlow Condensed, standing in for Clarendon and Univers Condensed | Free web fonts; keep or license the originals |
| Project photos and captions | 6 photos from Egnyte `Project Photos/2024 Portfolio` | Confirm OK to publish and check the captions |
| "Wellbrook", Drip, Gauge | Original fictional town and characters | Marketing sign-off |
| Prizes, eligibility, contact | `[bracketed]` text in `site/rules.html` | Fill in and have it reviewed |
