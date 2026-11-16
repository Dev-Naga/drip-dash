# Drip Dash: *Bring Back the Flow*
Game design document, v2 (replaces the endless runner)

---

## 1. Research summary: what inCon-trol actually does

Sources: incontrolwatersystems.com (home, products, water features, control panels, irrigation pumps, water harvesting, chemical injection, fiberglass vaults, maintenance, about, gallery) and the Egnyte marketing photo library.

| Area | What we learned | Becomes in the game |
|---|---|---|
| **Company story** | Founded in 2001 in a North Texas garage. Started in irrigation design, then pump stations from 2003, a UL 508A panel shop around 2009, and water harvesting from 2014. 25 years in business, 41 people, offices in DFW, Houston and Austin. | Gauge, the mentor, "has kept this valley running for 25 summers" and started out "in a garage with a wrench and a dream". |
| **Four divisions** | Design → Manufacturing → Construction → Maintenance & Service, "under one roof". | Each level is a restore job: diagnose, rebuild, start up, keep it running. |
| **Irrigation pump stations** | Hurricane Force (240–2,000+ GPM), Monsoon Force (120–610), Gale Force (120–300), Submarine Turbine Series (floats on a patented ballast). VFDs and pressure-activated controls. | Level 2 pump room: a VFD dial, lead/lag pumps, and keeping pressure in band while demand changes. |
| **Control panels** | In-house UL 508A shop. PLC control, touch-screen HMI, smart-device access, cellular, Modbus. | The **Heartboard**: the valley's master panel, whose failure starts the story. The HUD looks like an HMI. |
| **Water harvesting** | Above- and below-ground tanks, Gale Force Eco pump station, aluminum enclosures, VFD. | Level 4: catch a storm, divert the dirty first flush, and store clean water. |
| **Chemical injection** | Precise, adjustable dosing. Pairs with harvesting and water features. | Level 6: keep the fountain water clear without over-dosing. |
| **Fiberglass vaults** | Hidden pump, filter, chlorinator and sump under fountains. | Level 6's underground vault: cartridge filter backwash and sump. |
| **Water features** | Splashpads (Commons at Agora, Corinth), plazas, corporate campuses (American Airlines HQ), downtown (Chase Tower), Dallas Arboretum Children's Garden, Sundance Square. | Level 6, the Grand Show: a fountain performance. |
| **Non-potable delivery (photos)** | School fields and campuses: Denton HS, Prosper MS 4, Hays MS, Rodriguez MS, Sandbrock Ranch Elementary, Melissa TxDOT. Ground storage tanks with level gauges, and water towers behind. | Level 1 (ground storage), Level 3 (school field zones), Level 5 (water tower). |
| **Maintenance & Service** | Diagnostics, preventive maintenance, servicing others' systems. | Leaks, clogs and alarms are the moment-to-moment challenges. |

Each level ends with a **Field Note**: a real inCon-trol project photo and one plain-language line ("Real systems like this keep Prosper MS 4's fields green"). The game teaches without feeling like an ad.

---

## 2. Three original concepts

### A. **Bring Back the Flow**, a living-schematic operator adventure ★ recommended
Every level is a beautiful cross-section of a real water system drawn like a **blueprint that comes to life**. Broken systems are pale blue linework. Each valve you open and each pump you start fills the drawing with color, motion and sound. You don't steer a character through obstacles. **You operate the system**: tap valves, drag a pump's speed dial, schedule irrigation zones, divert a storm, choreograph a fountain. Drip rides the water you move, reacts to how well you're doing, and hunts for golden drops. Each level is a different verb, connected by a story.

### B. **Pressure Head**, a one-button physics adventure
Drip is a droplet who can be pressurized. Hold to compress, release to jet through pipelines, up water towers and out of nozzles. Levels are hand-built physics courses through pump stations and tanks. *Pros:* instantly fun and very kinetic. *Cons:* still "steer a character through obstacles", it teaches less about how systems work, and level design is expensive.

### C. **Rainkeeper**, a seasonal water-strategy game
Over a compressed "year", you catch rain, store it, treat it and allocate it to a growing town and its landscapes as droughts and storms hit. It's like a small city builder. *Pros:* deep and replayable. *Cons:* sessions run longer than 3 minutes, the controls are more complex, and casual newsletter readers would bounce off it.

### Why A wins
- **Original:** "the blueprint that comes to life as you operate it" isn't an existing game format, and it's tied directly to what inCon-trol does (design → build → start up).
- **Every mechanic is real:** valves, VFDs, lead/lag pumps, zone scheduling, first-flush diversion, water hammer, dosing, filter backwash.
- **Simple controls:** tap and drag only, with no tutorial screens. Gauge explains each control in one line, in context.
- **Built for the newsletter:** short 60–120 s levels, star ratings and a monthly score that rewards replays.
- **Cheap to extend:** a new level is one file. Seasonal and monthly challenge levels can be dropped in without engine changes.

---

## 3. Story and world

**The valley of Wellbrook** is a small Texas town that runs on water: a reservoir, a pump station, a school with big green fields, rain tanks behind the library, a water tower on the hill and a famous fountain in the plaza.

**The Big Hush.** One August night a lightning storm fries the **Heartboard**, the master control panel that keeps every system in sync. By morning everything is silent. Pumps sleep, the tower is empty, the fields are browning and the fountain is still.

**Drip**, a determined little droplet who was mid-journey when everything stopped, wakes up stranded in the reservoir. On the dead Heartboard sits **Gauge**, a gruff, kind old pressure gauge who has "kept this valley flowing for 25 summers, since back when it was just me and a wrench in a garage". Gauge can't move, but knows every pipe in Wellbrook.

Gauge gives Drip the plan: **restore each system, recover its Spark Chip, and rebuild the Heartboard.** Every system you bring back turns that part of the valley map from blueprint to full color. In the finale, all systems run at once during the **Evening Rush**, and Wellbrook flows again.

Tone: warm, funny, competent. Drip says little and emotes a lot. Gauge talks in short, dry one-liners ("Water's patient. Pipes aren't.").

---

## 4. Levels

| # | Level / place | Concept introduced | Objective | Challenges and twists | Real reference |
|---|---|---|---|---|---|
| 1 | **Wake the Water**, Reservoir intake & ground storage tank | Valves, a pump, tank level | Open the intake, start the pump and fill the tank into the green band, without overflowing | Leaves clog the intake screen (tap to clear). The pump runs dry if started with the suction valve closed. | Prosper MS 4 ground tank |
| 2 | **The Pressure Dance**, Pump room | VFD speed and pressure band; lead/lag pumps | Keep discharge pressure in the green band for 60 s while sprinkler demand changes | Too low and the sprinklers sputter; too high and a pipe starts leaking (tap the leak). A big demand spike needs pump 2 brought online. | Denton HS pump station |
| 3 | **Before Sunrise**, School athletic fields | Zones, capacity and scheduling | Water all 6 zones to "green" before the sun is up | The station supplies at most 2 zones at once, and more makes all zones sputter. Wind gusts waste water on the edge zones, so pause them. | Non-potable school projects |
| 4 | **Catch the Storm**, Library roof and rain tank | Rainwater harvesting and first-flush diversion | Capture as much clean rain as possible | The first runoff is dirty: send it to drain, then switch to the tank. Leaves block the gutter. Overflow is wasted. Then pump stored water to the garden. | Melissa TxDOT harvesting tank |
| 5 | **Lift to the Sky**, Water tower | Head and elevation, and water hammer | Fill the tower above the line, then keep the town supplied through dinner-time demand | Hold the booster to push water up. Slamming a valve shut causes water hammer, so close it slowly by holding. | Water tower behind Prosper MS 4 |
| 6 | **The Grand Show**, Plaza fountain and fiberglass vault | Filtration, chemical injection and show control | Clear the water, then perform the fountain show | Cloudy water needs dosing, and over-dosing turns it green. The filter clogs and needs a backwash. Then tap jets on the beat. | American Airlines HQ and Chase Tower features |
| 7 | **Evening Rush**, the Heartboard (finale) | The SCADA/HMI overview | Keep all four systems green for 90 s | Alerts pop up across the valley and each needs the level's verb. Triage under pressure. | UL 508A control panels |

Difficulty rises through demand curves and timers. Each level takes 60–120 s and can be replayed for stars.

---

## 5. Signature mechanics (interactive water-system elements)

- **Valves (tap):** a quarter-turn animation. Pipes downstream visibly fill with flowing water.
- **Pump (tap):** spin-up sound, an impeller animation and a pressure needle that responds.
- **VFD dial (drag):** sets pump speed. Pressure follows with a little lag, like the real thing.
- **Lead/lag:** a second pump you bring online when demand is beyond one pump.
- **Pressure gauge:** green, amber and red bands, plus a burst risk if you stay in the red.
- **Tank level:** a target band and an overflow line, with visible water that sloshes.
- **Zones:** tap to open sprinklers. Total capacity is shared, so pressure drops if you over-subscribe.
- **Diverter:** routes the first flush to drain and clean water to the tank.
- **Slow-close valve:** hold to close gradually. A fast tap closes it instantly and causes water hammer.
- **Dosing pump and clarity meter:** precise dosing with a penalty for over-dosing.
- **Filter backwash:** tap when differential pressure rises.
- **Living blueprint:** each component blends from blueprint linework to full color as it comes online.

Every level also contains:
- **Golden Drops:** hidden collectibles that appear briefly. Tap one before it evaporates.
- **Bonus challenge:** an optional goal per level, such as "zero overflow" or "no leak".

---

## 6. Characters and visual direction

- **Drip:** the existing mascot, a brand-blue droplet with the logo-wave cowlick, determined brows and rosy cheeks. Drip rides the water you move, cheers on success, sweats when pressure is in the red and celebrates on completion. Unlockable outfits: hard hat, hi-vis safety vest, 25th-anniversary aqua, and Golden Drip.
- **Gauge:** a round brass-rimmed pressure gauge with a needle "mustache" that twitches when he talks. He's the voice of experience.
- **Art style:** flat vector cross-sections on a deep blueprint-blue background with a fine grid. Systems are pale linework until restored, then full color with soft shadows. The palette is the brand set: #005695 blue, its 60% and 30% tints, logo black, and the anniversary aqua as the "life" color. Water is luminous aqua with moving highlights.
- **Fonts:** Zilla Slab for display text (standing in for Clarendon) and Barlow Condensed for the UI (standing in for Univers Condensed).
- **Feedback:** valve clunks, pump hums, splash particles, the needle wobbling, screen pulses when a system comes alive, and a confetti burst of droplets when a level is complete.
- **Real photography:** each level-complete card shows the matching inCon-trol project photo as a Field Note. These collect into the **Field Notes album**.

---

## 7. Scoring, progression, achievements, leaderboard

**Level score (0 to about 5,000):**
- objective completion (up to 2,000)
- efficiency, meaning water not wasted (up to 1,500)
- stability, meaning time in the green band (up to 1,000)
- time bonus
- golden drops (+100 each)
- the bonus challenge (+300)

**Stars:** 1 star for completing the level, 2 and 3 stars for reaching the score thresholds.

**Progression:** levels unlock in order on the **valley map**. Each restored system recolors its part of the map. Collecting Spark Chips rebuilds the Heartboard, which unlocks the finale. Stars unlock Drip's outfits.

**Achievements (examples):**
- First Flow
- Pressure Pro (60 s in band)
- Zero Waste (no overflow anywhere)
- First-Flush Hero
- Smooth Operator (no water hammer)
- Crystal Clear
- Golden Collector (all golden drops)
- Night Owl (finish Before Sunrise with time to spare)
- Valley Restored
- 21-Star Engineer

**Leaderboard strategy:**
- **Valley Score:** the sum of a player's best score on each level. This is the leaderboard number, and it rewards both progressing and replaying for mastery.
- **Monthly board:** Valley Score from runs played this calendar month, so everyone starts fresh each month.
- **All-time board:** best Valley Score ever.
- **Company board:** the sum of each company's top 3 players.
- **Per-level boards** (next phase): "Fastest Before Sunrise", and so on.
- **Monthly challenge level** (next phase): each newsletter launches one new seasonal level, such as a Freeze Watch level in January. Its score counts double that month, which gives a reason to open every issue.
- **Server checks:** each level has a maximum possible score and a minimum duration, and every run needs a server-issued ticket and must agree with the server's clock.

---

## 8. Technology and scope

- **Engine:** vanilla JavaScript and Canvas 2D on a fixed 960×540 landscape stage, scaled to any screen. On portrait phones it shows a "rotate your phone" prompt. No framework or build step, and it loads fast from a newsletter link.
- **Architecture:** a small engine (scenes, input, tweening, particles, audio) plus a **component kit** (Valve, Pump, Dial, Gauge, Tank, Pipe-with-flow, Zone) plus **one file per level**. Levels register in a list, so adding a seasonal level means adding one file.
- **Persistence:** progress, stars, outfits and achievements are stored locally. Scores go to Supabase, with the same registration, tickets and leaderboard design as before.
- **Hosting:** GitHub Pages (already live) plus Supabase free tier. Cost is $0 a month.
- **Scope for this build:** all 7 levels playable, plus the map, Field Notes, achievements, outfits, leaderboard and mobile support.
- **Next phase:** monthly challenge levels, per-level boards, an optional voice-over and music.
