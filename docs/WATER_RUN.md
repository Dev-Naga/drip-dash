# Drip Dash: Water Run

**Play:** https://dev-naga.github.io/drip-dash/run/ · **Leaderboard:** https://dev-naga.github.io/drip-dash/leaderboard.html?game=wrun

Water Run is a 3D, three-lane runner in the Drip Dash portal. Players run Drip along **the Water Trail**: eight real projects from the [inCon-trol gallery](https://incontrolwatersystems.com/gallery), in a row, from sunrise to evening.

## Story
> The fountains on the Water Trail are running dry. Drip, the last drop out of Melissa Lake Park's tipping bucket, has until nightfall to reach **Commons at Agora** and switch on the evening show, waking every water feature on the way.

- **Start:** the countdown camera swoops down from the Melissa Lake Park play tower and its tipping bucket to Drip.
- **Progression:** each stop has a welcome gateway ("STOP 3 OF 8 · McKinney City Hall"), and a banner shows the stop, the time of day and a story line.
  - The sky and sunlight move from sunrise to noon, sunset and night as Drip runs.
  - Water features further ahead are dry. They switch on as Drip arrives: pools fill, cascades and curtains start falling, jets rise.
  - A flowing stream runs alongside the walkway through every stop. It's the trail Drip follows.
  - A progress bar shows the metres left to Commons at Agora.
- **Destination:** at 2,400 m, Commons at Agora lights up with glowing ground jets and a finale fountain, and a "The show is ON" celebration plays.
- **Replay:** the run doesn't end at the destination. The Trail loops as encore laps for a high score.
- **Game over:** the screen says how far along the Trail the player got ("stop 4 of 8 … 1,050 m short of Commons at Agora"), or that they arrived.

## The eight stops (all real gallery projects)
Each stop is 300 m. Each scene is a stylised low-poly version of the gallery photo, with no copied 3D assets. Obstacles change their look per stop but keep the same hitboxes.

| # | Project | Recreated from the photo |
|---|---|---|
| 1 | Melissa Lake Park Splash Pad | Play tower with a red roof and a tipping bucket that dumps every 7 s, white slide, spray hoops, ground jets with kids playing, colourful surfacing, shade sails |
| 2 | The Epic East | Raised koi pond with swimming koi, dark angular basin spilling over its edge, red-orange steel columns, planters, brick and glass building |
| 3 | McKinney City Hall | Steel hopper on a steel frame, pouring into a basin; brick and glass civic building; gravel beds with grasses |
| 4 | 3300 Olympus Drive | Stepped cascades with falling water on both sides, striped pavers, trees in planters, bronze sculpture |
| 5 | Aggie Park | Wooden pedestrian bridge with railings and arches over a boulder-edged pond, stepping stones with people, stadium beyond |
| 6 | Dallas Arboretum – Rory Meyers Children's Adventure Garden | Elevated walkway with a water curtain falling into a stone-edged stream, shade trees |
| 7 | Chase Tower | Long reflecting basins with rows of bubbler jets, domed building, agaves (at sunset) |
| 8 | **Commons at Agora** (destination) | Evening splash pad of green-lit in-ground jets, kids playing, lamp posts |

## Billboards
- **Branded billboards:** 2 per stop. They show the inCon-trol logo and four messages:
  - "Water features, designed & built"
  - "Every drop, under control."
  - "Play Drip Dash!" (with Drip)
  - "Water harvesting & reuse"

  Service and product lines are taken from the inCon-trol website's own navigation. The boards are slightly weathered to look like real signs.
- **Project billboard:** 1 per stop, the only interactive object. It shows the real gallery photo, the project name and "Tap for project info", with a pulsing outline and a pin. Players can open it in three ways:
  - tap or click the sign itself (3D picking)
  - the **ⓘ project nearby** button that appears while the sign is in view (easier on phones)
  - the <kbd>I</kbd> key
- **Pausing:** opening a sign pauses the run safely. Closing it resumes with a 1.5 s 3-2-1 count-in.
- **Project panel** contents:
  - name and gallery photo
  - "In the photo", which describes only what the gallery photo shows
  - location and gallery summary, for Commons at Agora only (Corinth, TX)
  - "Architect / designer: Not listed in the inCon-trol gallery"
  - a link to the gallery

  The gallery publishes only names and photos, apart from the Commons at Agora teaser, so **no architects, dates or descriptions were invented.** To add verified details later, edit `site/js/run-projects.js`.
- **Projects discovered:** opened signs are saved on the device ("📍 Projects discovered 3/8" on the title screen). Every stop's panel can also be opened from the game-over screen.

### Photos
The eight gallery photos are stored on the site in `site/assets/gallery/` (downloaded from the inCon-trol gallery on 17 Nov 2026 and resized to 1,000 px wide, 115–335 KB each). Billboards and panels use these copies, so they don't depend on Google's image host, which rate-limited the gallery links during testing (HTTP 429).
- **Fallbacks:** if a stored photo is missing, the game tries the gallery link, then a branded title card.
- **Adding or replacing a photo:** put the file in `site/assets/gallery/` and list it in `LOCAL` in `site/js/run-projects.js`.

## Billboards: rendering and stability
- Sign faces are unlit (`MeshBasicMaterial`, no tone mapping), so logos and photos look the same in every light.
- Each face sits 8 cm in front of its frame and uses a depth offset, so it can't z-fight (flicker) with the frame. The camera's near plane is 0.3 m for better depth precision.
- Each sign texture repaints from a clean canvas, and only when its own inputs change: logo loaded, fonts ready, or photo loaded. Project photos preload when the game starts. In testing, no sign texture changed during a 90-second run (23 tracked).
- Billboards don't animate. The project sign has a fixed gold border and an "i" badge; earlier versions used a pulsing ring.
- In testing, tapping a visible project sign opened the right project 82 times out of 83 (one tap missed). Opening a sign pauses the game, and closing it resumes after a 3-2-1 count.

## Designed surroundings (no random scenery)
Each stop has a hand-planned layout (`LAYOUTS` in `run-game.js`): a left and a right park scene for every 30 m section, beyond the project's own water feature. The scenes are:

| Scene | What's in it |
|---|---|
| `splashKids` | Mini splash pad with ground jets, kids playing, a parent on a bench |
| `playground` | Play tower and slide, swings with a swinging kid, a parent on a bench, a shade tree |
| `picnic` | Family on a checked blanket under a shade tree, a kid running round, picnic table |
| `benches` | Paved rest area with benches, lamp, bin, flower bed, people strolling |
| `pavilion` | Shade pavilion with families at tables, restroom building with a sign |
| `kiosk` | Snack kiosk with a striped awning and a queue, patio tables with umbrellas |
| `garden` | Hedges, flower beds, ornamental tree, someone walking a dog |
| `grove` | Shade trees with seat walls and people resting |
| `fountain` | Round civic fountain with people sitting on the rim |

- Every position, size and person is fixed, so a stop looks the same on every visit, like a real place.
- Aggie Park has lawns and boulder banks beyond the pond. The Arboretum uses autumn trees.
- People are posed: seated people are frozen in place, while walkers, runners, swingers and splashing kids move.

## Atmosphere
- **Light and time of day:** sunrise at Melissa, bright noon at Olympus, a golden-hour autumn at the Arboretum, sunset downtown at Chase Tower, and evening at Agora with lit buildings, glowing jets, lamps and stars.
- **Horizon:** each stop has distant scenery that follows the camera: rolling hills, a tree line, and a skyline, stadium or autumn woods.
- **Sky:** a soft sun or moon disc, and drifting clouds tinted for sunset.
- **Floating particles:** sparkles, pollen, mist by the cascades, falling autumn leaves, golden motes at sunset, and fireflies at night. They stay clear of the lanes.
- **Water:** reflective, normal-mapped surfaces; flowing falling water; water features switch on as Drip arrives. Drip splashes through puddles on wet walkways.
- **Sound** (all synthesized, no audio files): a fountain-water bed whose level depends on the stop, birdsong by day and crickets at night. It plays only during a run and respects mute.
- **Camera:** an intro swoop, a field of view that widens slightly with speed and more on Jet Boost, and a gentle roll into lane changes. Roll and shake are off with reduced-motion settings.

## Gameplay and scoring
Unchanged from the first version:
- lanes, jump, slide, and a single bounce-back when you clip the side of an obstacle
- obstacles: low, grate, high, block and geyser
- power-ups: shield, magnet, x2 and Jet Boost
- drops and golden valves
- speed from 13 to 30 m/s
- score = metres + pickups

The server checks in `submit_water_run` are unchanged, and every simulated run passed them. In simulated runs, bots survived 19–106 s, and the best runs reached Commons at Agora in about 95–105 s.

## Performance
- **Merging:** each 30 m section's static, opaque scenery (including seated people) is merged into one mesh per material. Because every stop and section is identical on each lap, the merge happens once and is cached. After that, updating the world takes about 1 ms per frame.
- **Distance:** moving details (jets, walking people) are drawn only in the nearer sections. Far sections are fogged anyway.
- **Draw calls:** desktop with shadows uses about 380–720 per frame; phones, with no real-time shadows, about 325. Phones also show fewer people and particles, and pixel ratio is capped at 1.5.
- **Caching:** Water Run's scripts and CSS load with a `?v=` tag (in `site/run/index.html` and the imports in `run-main.js` / `run-game.js`). That stops a browser mixing old and new files for up to 10 minutes after a deploy. **Bump the tag on every change.**

## Files
| File | What it holds |
|---|---|
| `site/run/index.html` | Screens, HUD, journey bar, project chip, project panel, Trail list |
| `site/js/run-game.js` | Engine, the eight stops, billboards, water, people, Drip in 3D, story events |
| `site/js/run-main.js` | Controls (keys, swipe, click), sign picking, panels, journey HUD, scores |
| `site/js/run-projects.js` | The verified project list and photo sources |

## Technology
- Three.js 0.160, pinned, loaded from the jsDelivr CDN, plus `RoomEnvironment` from Three.js's examples.
- Hosted on GitHub Pages.
- Supabase backend: level `WRUN`, `submit_water_run`, `admin.water_run_standings`.

There's no build step, and nothing extra to run or pay for.
