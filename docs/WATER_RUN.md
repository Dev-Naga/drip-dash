# Drip Dash: Water Run

**Play:** https://dev-naga.github.io/drip-dash/run/ · **Leaderboard:** https://dev-naga.github.io/drip-dash/leaderboard.html?game=wrun

Water Run is a 3D, three-lane endless runner and the newest game in the Drip Dash portal. Drip, the same mascot as the original runner, dashes through five places inspired by real projects from the [inCon-trol gallery](https://incontrolwatersystems.com/gallery).

## The portal
Four games live on one site, with one sign-up and one leaderboard system.

| Game | URL | Leaderboard |
|---|---|---|
| Drip Dash (home) | `/` | best run |
| **Water Run** | `/run/` | best run |
| Bring Back the Flow | `/flow/` | Valley Score |
| Splash Escape | `/splash/` | best run |

Getting to and from Water Run:
- **From Drip Dash:** a highlighted **NEW 3D: Water Run** card on the home screen, plus a "Try Water Run" link on the game-over screen.
- **Back to Drip Dash:** "← Drip Dash games" on the Water Run title screen, plus back links on the pause and game-over screens.

Shared across the games:
- the sign-up (`dripdash.player`)
- the outfit chosen in Drip Dash (Hard Hat, Hi-Vis Vest, Aqua, Golden), which Drip also wears in Water Run
- sound settings
- the backend

## Gallery projects used as environments
The game shows a new zone every 450 m and cycles through all five, so a good run sees every one. The obstacles change their look to match each zone, while their hitboxes stay the same.

| Zone | Inspired by (inCon-trol gallery) | What's recreated |
|---|---|---|
| Splash Park | Melissa Lake Park Splash Pad | Water tower with a red roof and a tipping bucket that dumps water every 6 s, white slides, colourful spray posts, shade umbrellas, teal-and-yellow pad surface |
| Cascade Plaza | 3300 Olympus Drive | Stepped weir cascades with water sheets, striped pavers, rows of trees, a bronze sculpture |
| Koi Court | The Epic East | Red steel columns, swimming koi, an angular fountain basin with a spill edge, planters |
| City Bridge | Chase Tower and the downtown skyline | Bridge deck over a river, railings, lamp posts, skyline towers (including one with an angled crown), a cable arch |
| Fountain Lights | inCon-trol illuminated fountain shows | Night plaza with colour-cycling, glowing jets and lit lane edges |

Everything is built from simple low-poly shapes in code; no photos are copied into the game. The game-over screen shows which places you reached and links to the real gallery. The zone names are stylised; Marketing should confirm it's fine to name those projects.

## Gameplay
| Action | Keyboard | Touch | Mouse |
|---|---|---|---|
| Change lane | ← → / A D | Swipe | Click the left or right 30% of the screen, or drag |
| Jump | ↑ / W / Space | Swipe up or tap the middle | Click the middle |
| Slide | ↓ / S | Swipe down | Drag down |
| Pause | P / Esc | ❚❚ button | ❚❚ button |

### Obstacles

| Obstacle | Looks like | How to get past |
|---|---|---|
| Low | Pipe barricade, weir wall or planter edge | Jump |
| Drain grate | Grate spraying water | Jump |
| High | Water arch, pipe gantry or red beam | Slide |
| Block | Fountain basin, water wall, cascade block or utility vault | Change lane |
| Geyser (from 25 s) | Flashes red, then erupts in a cycle | Change lane, or time it |

Every obstacle row leaves at least one way through.

### Hits
- Clipping the side of an obstacle while changing lanes bounces Drip back once. A second bump within 4 s ends the run.
- A head-on hit ends the run unless you have a shield.

### Speed
Speed goes from 13 to 30 m/s, and obstacle rows get closer together over time. In automated tests:
- good and average bot players lasted 20–115 s, most of them 30–90 s
- standing still lasts about 11 s

### Pickups

| Pickup | What it does |
|---|---|
| Drops | +10 each |
| Golden valves | +100 each, at least 6 s apart |
| Pressure Regulator | Shield: blocks one hit |
| Smart Controller | Drop magnet for 8 s |
| Flow Meter | x2 points for 10 s |
| Jet Boost | x1.5 speed for 3 s, smashes through obstacles |

Each power-up pickup is also worth +25, and power-ups are at least 10 s apart.

**Score** = 1 point per metre + pickups. The game keeps a personal best and the list of zones you've reached on the device. The leaderboard ranks each player's best single run, monthly and all-time, with company and past-winners tabs.

## Technology
| Piece | Choice | Why |
|---|---|---|
| 3D | **Three.js 0.160**, loaded from the jsDelivr CDN with an import map | Best performance-to-effort for low-poly 3D; no build step, so it fits the existing stack. |
| Models | Built in code (boxes, cylinders, a lathe teardrop for Drip), with shared geometry and material caches | ~55 geometries in memory, about 300 draw calls and 25k triangles. Simulation and rendering take about 0.9 ms per frame on the test machine. |
| Rendering | Lambert/Phong materials, fog, one directional light, no real-time shadows (blob shadow under Drip), pixel ratio capped at 1.5 on phones | Smooth on phones |
| Files | `site/run/index.html`, `site/js/run-game.js` (engine, world, Drip in 3D), `site/js/run-main.js` (screens, controls, scores) | Same layout as the other games |
| Fallback | If WebGL or the CDN is unavailable, a message points players to the other games | — |
| Hosting | GitHub Pages, the same deploy | $0 |
| Backend | Supabase, same project: level `WRUN`, function `submit_water_run`, leaderboards with `p_game = 'wrun'`, admin view `admin.water_run_standings`, export column `water_run_best_score` | $0 on the free tier |

### Anti-cheat (`submit_water_run`)
- A one-time server ticket for level `WRUN`. It can't be reused or used for another game.
- Run time is checked against the server clock.
- Distance: at most 46 m/s.
- Drops: at most 9/s + 10.
- Golden valves: at most seconds / 5 + 3.
- Power-ups: at most seconds / 9 + 2.
- Score: at most distance + drops × 20 + valves × 200 + power-ups × 25 + 10.
- Rejected runs are kept for review.

If you change the scoring or spawn rates in `RULES` in `run-game.js`, update the function to match.

## Maintenance
- Nothing to run or renew. Updates are a push to `main` (about 1 minute).
- Three.js is pinned to 0.160.0, so CDN updates can't break the game. To upgrade it, change the version in `run/index.html` and play-test.
- To add a zone, add an entry to `ZONES` and a decor builder in `run-game.js`, and add a track texture in `trackTextures()`.
