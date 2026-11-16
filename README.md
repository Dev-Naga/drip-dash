# Drip Dash: *Bring Back the Flow*
**inCon-trol Water Systems newsletter game**

A lightning storm has knocked out the **Heartboard**, the master control panel of the small Texas town of Wellbrook, and every water system has gone still. Players help **Drip** the droplet and **Gauge**, a gruff old pressure gauge, restore the valley one system at a time.

Each level is a *living blueprint*: a pale schematic that fills with color, motion and sound as the player operates real equipment.

| # | Level | What the player does | Real-world concept |
|---|---|---|---|
| 1 | Wake the Water | Open valves in order, start the pump, fill the ground storage tank into the band | Valves, pumps, tank levels, intake screens |
| 2 | The Pressure Dance | Drag a VFD dial to hold 55–70 PSI; bring a second pump online for the demand spike | VFDs, lead/lag pump stations |
| 3 | Before Sunrise | Schedule six field zones before dawn; max two at a time; dodge wind gusts | Irrigation zones and station capacity |
| 4 | Catch the Storm | Divert the dirty first flush, catch clean rain, clear the gutter, water the garden | Rainwater harvesting, first-flush diversion |
| 5 | Lift to the Sky | Pulse a booster to beat rising head, survive the dinner rush, close the main slowly | Head vs. elevation, overheating, water hammer |
| 6 | The Grand Show | Dose and backwash in the equipment vault, then play the fountain show on the beat | Water features, fiberglass vaults, chemical injection |
| 7 | Evening Rush | Run every system at once from the rebuilt Heartboard | UL 508A control panels, HMI/SCADA |

Each level also has:
- 1–3 stars
- 3 hidden golden drops
- a bonus challenge
- a **Field Note**: a real inCon-trol project photo (Prosper MS 4, Denton HS, Sandbrock Ranch Elementary, Melissa TxDOT, American Airlines HQ, Chase Tower)

Across the game there are 13 achievements and 5 unlockable outfits. The leaderboard ranks the **Valley Score**, which is the sum of each player's best score on every level, per month and all-time, plus a company board.

| | URL |
|---|---|
| Game | https://dev-naga.github.io/drip-dash/ |
| Leaderboard | https://dev-naga.github.io/drip-dash/leaderboard.html |
| Rules & privacy | https://dev-naga.github.io/drip-dash/rules.html |
| Design document | [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) |

> **Status:** the game is live in **DEMO MODE**, so scores are saved in each player's browser only, until a Supabase project is connected. See [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md), section 1.

## Stack
- **Game:** plain HTML5 Canvas and JavaScript modules on a fixed 960×540 stage that scales to any screen. No framework, no build step, and all art is drawn in code. Portrait phones get a "rotate" prompt with a "play anyway" option.
- **Hosting:** GitHub Pages, deployed automatically by `.github/workflows/deploy-pages.yml` on every push to `main` that touches `site/`.
- **Backend:** Supabase Postgres (free tier). The browser calls 7 locked-down SQL functions. Per-level score limits and minimum durations live in `private.levels`. Schema: [`supabase/schema.sql`](supabase/schema.sql).
- **Keep-alive:** `.github/workflows/supabase-keepalive.yml` pings Supabase daily so the free project doesn't pause.

## Folder map
```
site/
  index.html            screens: title, story, register, briefing, results, album, leaderboard, pause
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
Then open http://localhost:5173. Add `?level=L4&dev` to jump straight to a level.

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
