# Splash Escape: design and technical notes

**Play:** https://dev-naga.github.io/drip-dash/splash/ · **Leaderboard:** https://dev-naga.github.io/drip-dash/leaderboard.html?game=splash

Splash Escape is the third game on the Drip Dash site. It's a 30–90 second arcade survival game set on a circular splash pad, **inCon-trol Water World**. It shares the site, the sign-up and the Supabase backend with Drip Dash and Bring Back the Flow.

## Concept
- **Mascot: Spritz.** An original water-drop character with a sun-yellow swim floatie and coral goggles. Spritz is drawn in code and changes expression as you play:

  | Expression | When |
  |---|---|
  | Smile | Normal play |
  | Wide-eyed "o" | A hazard warning is close |
  | Squint | Dashing |
  | Happy | Picking something up |
  | X-eyes | Getting hit |

  Spritz is new and separate from Drip (Drip Dash's mascot), so Marketing needs to sign it off.
- **Arena.** A top-down circular pad, painted in brand blues with sun-yellow and coral accents, with:
  - a central fountain, rim nozzles, rotor sprinklers, three drain grates and a trench drain
  - a paver deck printed with "INCON-TROL WATER WORLD • SPLASH ESCAPE"
  - mushroom fountains, trees, flower beds and patio umbrellas around the deck
  - the inCon-trol logo plate in the corner
- **Tone.** Friendly and readable for all ages. Every hazard is warned before it fires.

## How it plays
| Input | Move | Dash (invulnerable for 0.2 s, recharges in 2.2 s) | Pause |
|---|---|---|---|
| Keyboard | Arrows / WASD | Space or Shift | P / Esc |
| Mouse | Hold the button and point | Right-click | ❚❚ button |
| Touch | Drag anywhere (floating joystick) | DASH button | ❚❚ button |

Health is 3 drops. A hit makes you invulnerable for a moment, and a Bubble Shield absorbs one hit.

### Hazards (unlock as you survive, each with a warning first)
| From | Hazard | Warning |
|---|---|---|
| 0 s | Falling drops | Shadow grows with a red countdown ring |
| 6 s | Pop-up geysers | Bubbling yellow ring |
| 12 s | The Big Fountain: rotating spray arm(s), 2 arms from 40 s, 3 from 75 s, can reverse after 50 s | Yellow dotted arm |
| 20 s | High-pressure jets across the pad from rim nozzles | Red dashed line and a flashing nozzle |
| 28 s | Drain grates: suction pulls you in, and touching the grate hurts | Swirling rings |
| 38 s | Fountain cart roaming the pad and pulsing spray rings (2 carts from 70 s) | Cart flashes before each pulse |
| 50 s | Rotor sprinklers sweeping droplet spray | Red ring on the sprinkler head |
| 62 s | Splash waves: an expanding ring with one gap | Slow and visible: find the gap or dash |

Spawn rates and speeds keep ramping, so even good runs end. In automated tests:
- a simple dodging bot survived 49–66 s
- standing still lasts about 10–12 s

### Helpers
- **Umbrella safe zones**, every 14 s, lasting 7 s. Falling drops and sprinkler spray can't reach you under one.
- **Golden drops**, up to 3 on the pad. Each is worth +25 × combo; collect them within 3 s of each other to build the combo up to x5.
- **Power-ups**, every 11 s, each worth +50:

  | Power-up | Effect |
  |---|---|
  | Bubble Shield | Blocks one hit |
  | Smart Controller | Slows all water for 5 s |
  | Drop Magnet | Pulls golden drops to you for 8 s |
  | Refill | +1 health; only appears when you're hurt |

### Scoring, bests and achievements
- Score = 10 per second survived + golden drops + power-ups.
- The leaderboard ranks each player's **best single run** this month and all-time.
- Personal best and longest run are saved on the device. There are 10 achievements, also saved on the device:

  | Achievement | How to earn it |
  |---|---|
  | First Splash | Finish a run |
  | Splash Survivor | Survive 30 s |
  | Minute in the Mist | Survive 60 s |
  | Water World Legend | Survive 90 s |
  | Bone Dry | Go 30 s without a hit |
  | Combo Fountain | Reach a x5 combo |
  | Golden Collector | Collect 25 golden drops in one run |
  | Shade Seeker | Have umbrellas block 5 splashes in one run |
  | Close Call | Dash through a hazard |
  | 2,000 Club | Score 2,000 points |

## Architecture
| Piece | What | Cost |
|---|---|---|
| Game | `site/splash/index.html`, `site/js/splash-game.js` (engine and art), `site/js/splash-main.js` (screens and controls). Plain JS + Canvas, no build step. | — |
| Hosting | GitHub Pages, the same site and deploy workflow as the other games | $0 |
| Backend | Supabase, same project. Uses level `SPLASH` and the function `submit_splash`; leaderboards are called with `p_game = 'splash'`. | $0 (free tier) |
| Sign-up | Shared with the other games: one registration covers all three | — |

### Anti-cheat (server-side, `submit_splash`)
- **One-time ticket:** the server issues a ticket with a server timestamp, bound to Splash Escape and the player, and it can't be reused.
- **Run time:** at least 3 s, and no longer than the server's own clock allows.
- **Score bound:** at most 10 × seconds + golden drops × 125 + power-ups × 50 (+20 rounding slack).
- **Pickup limits:** golden drops at most seconds + 6, power-ups at most seconds / 6 + 2. These match the spawn timers in `RULES` in `splash-game.js`.
- **Shared protections:** rate limits, honeypot, blocked-player list and the rejected-runs review view work the same as the other games.
- If you change the scoring or spawn rates in `splash-game.js`, update `submit_splash` in `supabase/schema.sql` to match.

### Future: our own CRM and newsletter platform
All game data is already in a portable shape, so a future inCon-trol CRM can take it over without changing the games:
- `players`: email, company, consent, opt-in, source
- `runs`: game, score, time, month

When that CRM exists, the options are:
1. Point it at the Supabase tables, or replicate them nightly with `admin.player_export`.
2. Move the 9 SQL functions into the CRM's own database. The browser only calls these functions, so the games' API calls stay the same.

## Assets used
- **Logo:** `IWS-logo-hozt.png` from Egnyte (Approved Design), the same file as the other games.
- **Brand colours:** #005695, #5D85B7, #A4B7D7, aqua #00C1D5.
- **Placeholders, marked as such:**
  - Spritz the mascot (original, needs Marketing sign-off)
  - the sun-yellow (#FFC845) and coral (#FF7A59) "water park" accents
  - the Zilla Slab and Barlow Condensed fonts, standing in for the brand fonts
- **HubSpot / CRM:** not connected. The CRM tools available in this session can't reach HubSpot. Player data reaches HubSpot through the monthly CSV export in the admin guide.
