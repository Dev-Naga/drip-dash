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

### Photo hosting (action needed)
Billboard and panel photos load in this order:
1. A copy stored on this site, if one exists. Only Chase Tower has one today (`assets/projects/chase-tower.jpg`, from the Egnyte marketing library).
2. The gallery's own image link (`lh3.googleusercontent.com/d/<id>`).
3. A branded title card, if neither loads.

During testing, Google's image host returned **HTTP 429 (too many requests)** for those links, so photos can be missing for some players. **Recommended:** copy the eight gallery photos into `site/assets/gallery/` and list them in `LOCAL` in `run-projects.js`. That needs approval to download them from the gallery.

## Graphics
- **Materials and reflections:** physically based (`MeshStandardMaterial`), with ACES tone mapping and image-based reflections from a generated environment map. Water, glass, steel, bronze and Drip all reflect.
- **Water:** animated normal-mapped surfaces (pools, ponds, the stream) and streaked, flowing sheets (cascades, curtains, jets). Water features fill and switch on as Drip arrives. At Agora the water glows.
- **Lighting:**
  - a gradient sky dome and a sun whose colour, height and angle change with each stop
  - soft real-time shadows that follow Drip on desktop; phones use a blob shadow instead
  - a night glow around Drip at Agora
- **People:** low-poly visitors walking, waving and playing in the jets. Phones show half as many.
- **Drip's animation:**
  - stride speed follows running speed; squash and stretch on jumps and slides; leans into lane changes
  - footstep splashes on wet surfaces
  - expressions: blinks, eyes widen and brows rise near danger, open "O" mouth in the air, bigger grin on pickups, determined brows when sliding or boosting
  - turns to face the camera when paused or knocked out
- **Camera:** intro swoop, gentle run bob, wider field of view during Jet Boost, shake on a crash.

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
- **Shapes and materials:** cached and shared, and random sizes snap to a small set. Over a 4.6 km test run, memory levelled off at about 200 shapes and 25 textures, so there's no leak.
- **Desktop:** about 350–780 draw calls including the shadow pass, and about 33k triangles.
- **Phones:** no real-time shadows, half the visitors, and pixel ratio capped at 1.5.

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
