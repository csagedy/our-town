# Performance: harness and numbers

Target: the original iPad Pro (A9X, iPadOS 16 / Safari 16, 2 GB RAM on the 9.7", 4 GB on the 12.9"). Budgets (design.md 6.2): 60 fps while dragging, at most 20 ms of input handling per frame, under 150 MB of memory, 0% CPU when nothing moves.

## The `?perf` overlay

Open `index.html?perf` (works from the dev server, the LAN address and the installed app if you type it in Safari). A small panel in the bottom-right corner shows, twice a second:

| line | what |
|---|---|
| `FPS / p50 / p95 / max` | requestAnimationFrame rate over the last second, and frame-time percentiles over the last ~20 s |
| histogram | frame times in buckets `<=17 <=25 <=33 <=50 <=67 >67` ms (green = 60 fps, yellow = 30-40, orange = janky) |
| `DOM (svg)` | element count in the page, and how many of them are SVG (characters are live SVG, ~120 nodes each) |
| `anims` | running Web Animations + CSS animations (`document.getAnimations()`) |
| `images: ~N MB decoded` | an estimate of decoded bitmap memory: width x height x 4 for every loaded `<img>` in the page, each URL once. A lower bound: the GPU keeps its own copy of composited layers, and images decoded only for preloading are not counted |
| `JS heap` | Chrome only (`performance.memory`); Safari shows "Web Inspector" |

`window.__perf.snapshot()` returns the same numbers as an object; `window.__perf.reset()` starts a new window. The overlay runs one rAF loop, so it keeps the CPU busy: never judge battery or the idle state with it on.

## On the real iPad (Safari Web Inspector)

Safari has no `performance.memory`, so memory is measured with Web Inspector on a Mac:

1. iPad: Settings > Safari > Advanced > **Web Inspector** on. Mac: Safari > Settings > Advanced > "Show features for web developers".
2. Connect the iPad with a cable (or the same Wi-Fi after pairing once). Open the game on the iPad: the installed home-screen app works (it shows up as its own entry), or `http://<mac-lan-ip>:8124/?perf` from `python3 tools/serve.py --lan` (no service worker on the LAN address; that's fine for perf).
3. Mac Safari > **Develop** > (the iPad's name) > the page. Web Inspector opens.
4. **Timelines** tab: turn on *CPU*, *Memory*, *Layout & Rendering*, *JavaScript & Events* and *Media* (gear icon, "Edit" instruments). Press record, play the scenario (below) for 20-30 s, stop.
5. Read:
   - **Memory**: the total and its split (JavaScript, Images, Layers, Page). "Images" is decoded bitmaps (compare with the overlay's estimate), "Layers" is GPU compositing memory. Note the peak during a city -> kitchen transition (both scenes' images are alive for a moment). Budget: total under 150 MB; on a 2 GB 9.7" iPad Pro, Safari starts killing tabs well before 1 GB.
   - **CPU**: should drop to ~0% within a second of the last touch with `?perf` OFF. Anything steady means something loops.
   - **Layout & Rendering**: layouts and paints during a drag; a drag should show composites, not paints of the room layers.
   - **Frames** view (the *Rendering Frames* timeline): frames over 16.7 ms and what they spent time on.
6. Also watch for Safari's "This webpage was reloaded because a problem occurred" (a memory kill): that is the failure to catch on the 2 GB iPad.

Scenario to repeat on each build: boot to the city; pan the map right and back 3 times; tap the sun twice (night and back); go into the cafe; drag a mug around the kitchen 4 times; tap every character once; hold a character over the pocket; go back to the map. Then do it again with **Words** on (parent menu).

## First check: headless Chrome, CPU throttled (bead mhf.16, 2026-09-26)

`node tools/perf.mjs --rate 6 [--viewport ipad-pro-12.9]`: the real app in headless Chrome on the build Mac (Apple M4) with CPU throttling x4-x6 as a rough stand-in for the A9X, real touch input, fresh profile (first-visit kitchen). Blink with software raster is **not** WebKit on an A9X GPU: compositor-driven animation stays at 60 fps in headless Chrome whatever the throttle, so the frame numbers below mostly show main-thread stalls. Read them as relative (what is heavy, what regresses), and confirm on the iPad.

Throttle x6, `ipad-pro-9.7` (1024x768); the 12.9" (1366x1024) run was the same within noise, and x4/x5 were the same or better:

| scenario | avg fps | p95 frame | max frame | long tasks | DOM nodes | running anims | decoded images | JS heap | layouts |
|---|---|---|---|---|---|---|---|---|---|
| city idle, 3 s | 59.6 | 16.7 ms | 16.8 ms | 0 | 205 | 0 | **46.8 MB** | 3.4 MB | 6 |
| city pan, 6 swipes | 58.9 | 16.7 ms | **116.6 ms** | **1 (140 ms)** | 205 | 0 | 46.8 MB | 4.2 MB | 13 |
| city -> kitchen transition (1.1 s) | 57.2 | 16.7 ms | 50 ms | 1 (53 ms) | 778 | 4 | 29.8 MB | 3.9 MB | 8 |
| kitchen idle, cast of 4, 3 s | 59.6 | 16.8 ms | 16.8 ms | 0 | 778 | 5 | 29.8 MB | 4.3 MB | **30** |
| kitchen drag x4, cast of 4 | 60 | 16.8 ms | 16.8 ms | 0 | 800 | 4 | 29.8 MB | 5.9 MB | 151 |
| kitchen idle, cast of 12, 3 s | 59.6 | 16.7 ms | 16.8 ms | 0 | **1746** | 13 | 29.8 MB | 4.7 MB | **119** |
| kitchen drag x4, cast of 12 | 59.9 | 16.8 ms | 16.8 ms | 0 | 1746 | 12 | 29.8 MB | 2.8 MB | 340 |
| kitchen, cast of 12, Words on | 59.9 | 16.7 ms | 16.8 ms | 0 | 1746 | 13 | 29.8 MB | 2.9 MB | 46 |

Drag input cost (the view's `moveMs`, JS per pointer move): average 0.06-0.12 ms, max 0.9-3.8 ms at x6: far inside the 20 ms budget. Boot to `data-boot=ready` 103-140 ms (x4-x6; local server, warm HTTP cache). "Cast of 12" is the 4 starter characters plus 8 copies, standing for the P1.15 starter cast.

Biggest decoded images on the city: `city/back.webp` 3900x1800 = **26.8 MB**, `city/front.webp` 6.7 MB, then the buildings at 2-2.7 MB each and the car sprite 1.1 MB. The kitchen is 29.8 MB (matches STYLE.md 9).

### Risks for the A9X (filed as bd bugs)

- ~~**City map decoded memory 46.8 MB**~~ fixed in bead 6hn (34 MB at either end, transition peak 39 MB), see "City map memory" below. Was: **City map decoded memory 46.8 MB** (STYLE.md estimated ~30 MB), before GPU layer copies; during a city -> kitchen transition both scenes are alive, so the peak is ~77 MB of bitmaps alone. On a 2 GB iPad Pro that leaves little room once Phase 2 adds more places. Options: lower `pxPerUnit` for the city back layer (the map is never zoomed), split it into tiles and drop the off-screen ones, or release the city's images before decoding the next place.
- ~~**Long task at the start of a city pan**~~ fixed in bead bp8: it was the AudioContext being created in the first gesture, see "City map memory" below. Was: **Long task at the start of a city pan** (68 ms at x4/x5, 140 ms at x6, 116 ms frame): likely the promotion/raster of the 3900 px wide room layer when `will-change` goes on at drag start. A visible hitch on the A9X when a kid starts to swipe the map. Check it in Web Inspector's Rendering Frames; if confirmed, keep the room layer promoted while the map is up, or pre-promote on mount.
- ~~**Idle characters cause layouts**~~ fixed in bead lm8, see "Idle characters" below.
- The overlay's own rAF loop is not counted against any of this (it is off in normal play).

Not risky: idle characters (after lm8), drag input handling, idle city (no work at all), JS heap (under 6 MB), the text layer (a CSS class; no extra layouts beyond the one toggle).

## Idle characters: no layout (bead lm8, 2026-09-26)

**Cause** (found by switching each piece of idle life off in turn and counting `Performance.getMetrics` LayoutCount / RecalcStyleCount in the cast room, then per event with `chars.idle(id, what)`): the breathing CSS animation was already free (composited, 0 layouts, 0 recalcs). Everything came from the shared idle timer's events, all of which changed live SVG:
- a **glance** or **head tilt** was a WAAPI transform on an SVG `<g>` inside the character. SVG children are not composited, so Blink restyles *and re-lays-out the SVG every frame* for the 1.3-1.7 s they run: ~80-100 layouts each. This was nearly all of the count.
- a **blink** toggled a class that flipped `display` on the eyes groups: 2 layouts + 2 recalcs each.

**Fix** (`src/engine/characters.js`, `src/engine/rig-svg.js` `layers` option, `src/app.css`): a character is now a stack of same-size `<svg>` layers (base, hairBack, body, headUnder, eyes, blink, headOver, front) inside HTML wrappers: `.char-tilt` around the two head pieces, `.char-eyes` around the open/closed eyes. A blink is a 130 ms opacity step on the open and closed eye layers, a glance a translate of `.char-eyes`, a tilt a rotate of the two `.char-tilt` boxes about the chin; all WAAPI on HTML boxes, so the compositor plays them. Two CSS details were needed to get from 2 layouts per event to 0: the wrappers carry an identity `transform: translate(0px, 0px)` at rest and the eye layers `z-index: 0`, so an animation starting or ending does not create or remove a containing block / stacking context (which Blink answers with a layout). Neither promotes a GPU layer at rest. Still one shared timer; nothing per character. Same look (checked frozen mid-tilt, mid-glance and mid-blink screenshots against rest); the only difference is that a tilt now rotates the rasterized head layer, which is how the breathing already worked.

**Numbers**, `node tools/perf.mjs --rate 6` (ipad-pro-9.7). With `?perf` on, the overlay itself costs 6 layouts per 3 s (its text, the same as "city idle") and, because its rAF loop makes Blink tick the breathing animations on the main thread, one style recalc per frame (~180 per 3 s); read the idle rows against that floor:

| scenario | layouts before | layouts after | DOM before | DOM after |
|---|---|---|---|---|
| kitchen idle, cast of 4, 3 s | 16-53 (30 in mhf.16) | **6** (= overlay) | 778 | 846 |
| kitchen idle, cast of 12, 3 s | 25-119 | **6** (= overlay) | 1746 | 1950 |
| kitchen drag a mug x4, cast of 4 | 112-166 | 61-62 | 800 | 868 |
| kitchen drag a mug x4, cast of 12 | 302-375 | 91-97 | 1746 | 1950 |
| kitchen text layer on, cast of 12 | 16-86 | 5 | 1746 | 1950 |

Without the overlay (the real idle state), kitchen, throttle x6, 10 s windows, after: **cast of 4: 0 layouts, 64 style recalcs (8.7 ms), 4.8 ms script** for 11 idle events; **cast of 12: 0 layouts, 156 recalcs (26 ms), 6.5 ms script** for 30 events (~5 recalcs per event: its start and end, never per frame). Before, 4 characters did ~45 layouts and ~80 recalcs in 3 s. The cost is ~17 more DOM nodes per character (the layer `<svg>`s and wrappers). Regression test: `tests/e2e/characters.test.mjs` "every kind of idle life costs no layout" (24 blinks/glances/tilts on 8 characters: at most 2 layouts) and the 4 s idle test (at most 2 layouts).

**Flaky recalc count (bead mhf.19, 2026-09-26).** The regression test counted 15-25 style recalcs for its 24 events most runs and 87-110 on some (bimodal, more often under load). Two causes, found by tracing (`blink.animations` category: each `Animation` trace event carries `compositeFailed`, a bit set of Blink's `CompositorAnimations::FailureReason`):
- **A product bug.** `chars.idle(id, 'glance'|'tilt')` could start a transform animation on a box the shared timer's own glance/tilt was still animating. Blink can't composite two animations of one property on one element (`compositeFailed` 64, `kTargetHasIncompatibleAnimations`), so it ran the new one on the main thread: a style recalc every frame for its 1.3-1.7 s, ~80-100 recalcs. The timer itself never overlapped (it skips a character with idle life running), but anything that restarts idle life on a busy character would. Fix: `idleAnim` now cancels an idle animation still playing on the same box before starting the new one (same look: the new move starts from rest, as before). Any future WAAPI on those boxes should do the same. (`compositeFailed` 131072, `kAnimationHasNoVisibleChange`, on the blink's constant-opacity keyframes is expected and harmless: 130 ms.)
- **Test noise.** The shared idle timer kept adding its own random events (~5 recalcs each) to the window. `chars.idleHold(true)` now holds the timer; the test holds it, waits until no idle animation runs, then plays exactly 24 events: **16-17 recalcs every run** (0 when nothing plays: breathing costs no recalcs), bound 1.5 per event. A second test plays 16 glances/tilts over running ones: 13-14 recalcs (106 without the fix).

Method, for the next one: `Performance.getMetrics` RecalcStyleCount over a fixed window, several instances of the page in parallel to reproduce load-dependent spikes; then a `Tracing.start` on the browser target (DevToolsActivePort in the harness's temp profile) with categories `blink.animations,devtools.timeline` and look at `compositeFailed` on the `Animation` events.

## Cafe strip memory (P2a.1, bead q62.1, 2026-09-26)

The cafe is one 2880-wide strip (kitchen, counter, dining). Its four depth layers as whole images decode to **62.8 MB** (back 4620x1800 alone is 33 MB), about twice the old one-screen kitchen: too much for the 2 GB 9.7" iPad Pro next to the city map (46.8 MB, above).

What changed:
- **Build** (`tools/art/build.mjs` `buildRoomTiles`): a room with camera `zones` also ships every layer as column tiles in `assets/rooms/cafe/tiles/<layer>-<i>.webp`. Column edges sit `TILE_MARGIN` (120 units) outside each camera stop's 1440-wide view (edges -100, 780, 1320, 1560, 2460, 2980), so at a stop only its own columns are needed. Tiles overlap 2 px so no seam shows. The whole-layer files stay (contact sheet, `?tiles=0`).
- **Runtime** (`src/engine/tiles.js`): a tile is loaded if it lies within 100 units of the view at rest, 420 while the camera moves (drag, fling, snap, edge auto-pan), so the next columns decode ahead of the finger. Load = `new Image()` + `img.decode()` off-screen, then the `<img>` gets its src (no half-decoded pop-in). Unload = the `<img>`'s src is dropped once the camera has been still for 350 ms. No timers or frames while nothing moves. Piece variants (fridge door, burners...) decode on demand before their in-place src swap; only the shown variant is held.

Measured with `index.html?perf` (`__perf.snapshot().imageMB`, width x height x 4 per loaded image URL, a lower bound) on `ipad-pro-9.7`, headless Chrome, after settling at each camera stop; `?tiles=0` is the old whole-layer behaviour:

| camera stop | whole layers (before) | tiles (after) | cafe room images only, after |
|---|---|---|---|
| dining (1440, where the door opens) | 64.9 MB | **39.0 MB** | 36.8 MB (tiles 34.9) |
| counter (900) | 64.9 MB | **42.0 MB** | 39.9 MB (tiles 38.1) |
| kitchen (0) | 64.9 MB | **37.0 MB** | 34.8 MB (tiles 32.8) |

So about 23-28 MB less at rest (~40% off). While panning, the tiles decoded ahead can briefly add one or two columns (up to ~10 MB) until the settle drops them. The city -> cafe transition peak is now ~47 + ~39 MB instead of ~47 + ~65 MB. Still to check with Web Inspector on the real A9X: that WebKit actually frees a dropped `<img>` src promptly, and whether a 1352 px-wide column (the widest) decodes in time during a fast fling (if not, raise `MOVE_MARGIN`). The e2e test `tests/e2e/cafe.test.mjs` asserts at every stop that exactly the nearby tiles have a src and no whole-layer image is in the page.

## City map memory and the pan-start stall (beads 6hn, bp8, 2026-09-26)

### Memory (6hn)

The cafe strip's mechanism, applied to the map:
- **Build** (`tools/art/build.mjs` `buildMapTiles`, additive to `buildMap`): the back and front layers, day and night, also ship as even 200-unit columns (300 px, the last one 2 px shorter; tiles overlap 2 px): `assets/rooms/city/tiles/{back,front}-<i>[-night].webp`, 13 per layer and variant, 468 KB in all. The map has no camera stops, so the columns are even (`MAP_TILE_W`). Whole-layer files stay (contact sheet, `?tiles=0`).
- **Runtime** (`src/scenes/city.js`): no `<img>` gets a src in the HTML. Every image, each tile and each piece (buildings, lots...), goes through a `createTileLoader` (`src/engine/tiles.js`); there are three loaders: the day set, the night set, and the pieces with no night variant (sun, moon). Only the loader of the set showing is active: the other holds no src at all. At rest a loader keeps what is on screen plus `CITY_REST_MARGIN` = 200 units (one column) each side, so the next column is already decoded when a pan starts; while moving it decodes 420 ahead; the rest is dropped 350 ms after the map stops. Night: the new set's loader decodes what the camera wants, then the night images cross-fade, then the old set's loader drops everything.
- **Transition** (`src/scenes/town.js`): the old scene is kept only until the iris has closed. Then it is destroyed (the city's loaders `release()` every src), the next place's first files are decoded (`preload`), it mounts, and the iris opens only once its visible tiles have a src (`scene.ready()` / `scene.tiles.ready()`, capped at 4 s). The cafe and the city are never decoded at once. The iris stays shut a little longer while the new place decodes (about as long as the old overlap took; the whole transition was 1.34-1.41 s before and 1.22-1.35 s after at x6).
- `tiles.js` gained options and methods, all additive (the cafe is unchanged): `restMargin`/`moveMargin`/`active` options, `ready()`, `setActive(on)`, `release()`.

`node tools/perf.mjs --rate 6`, `ipad-pro-9.7`. "Peak" is new in perf.mjs: the decoded bitmaps referenced at any moment of the city -> cafe transition, i.e. `<img>`s with a loaded src plus off-screen images being decoded (a preload, a decode-ahead), each URL once, sampled every frame and at each `decode()` resolution. Rest numbers from `__perf.snapshot().imageMB` after settling; `?tiles=0` gives the whole layers through the same loaders:

| | before | after |
|---|---|---|
| city at rest, camera 0 (home, the west end) | 47.5 MB | **34.1 MB** |
| city at rest, camera 480 (middle: every building on screen) | 47.5 MB | 42.5 MB |
| city at rest, camera 960 (east end) | 47.5 MB | **34.8 MB** |
| the same at night | 47.5 MB | 34.1 / 42.5 / 34.8 MB |
| peak during city -> cafe | **71-83 MB** (city + the cafe preloading under the iris) | **39 MB** (= the cafe alone) |

The middle of the map saves least: at camera 480 all four buildings are on screen and only ~5 MB of far columns can go. Still to check on the A9X with Web Inspector (Timelines > Memory, "Images"): that WebKit frees a dropped src promptly, and that a 300 px column decodes ahead of a fast fling (if not, raise `moveMargin` for the city).

### The pan-start stall (bp8)

Root cause, from a CDP trace (`Tracing.start` with `devtools.timeline`, `blink`, `cc`, `v8.execute`, `blink.image_decode`; `page.onEvent` was added to `tools/harness.mjs` to read `Tracing.dataCollected`) of the first swipe of a fresh page at x6: the long task was **not** layer promotion. It was one `FunctionCall` of 157 ms inside the `pointerup` of the first swipe: `gesture()` in `src/audio/context.js` constructing the `AudioContext` (the first user gesture of the page unlocks audio). `new AudioContext()` alone measures ~165 ms in headless Chrome. A second swipe, or a swipe after a warm-up tap, had no long task. Separately the cold trace had a 325 ms compositor draw right at pan start (Chrome's software compositor decoding offscreen buildings and rastering them as they entered the view for the first time); with the tile loader everything within a column of the view is decoded ahead with `img.decode()`, and that draw is gone from the after-trace. `will-change` toggling (stage.js) showed no cost in either trace and is unchanged.

Fix: `audio.prepare()` (`src/audio/context.js`, `prepareAudio()` in `src/audio/index.js`) creates the context outside a gesture; it starts suspended and the first gesture only resumes it (the iOS unlock is the same resume + silent buffer). `src/main.js` calls it in the town 600 ms after boot, deferred while a finger is down or the camera or a transition is moving. The dev routes (`?room=buddy`...) keep the create-on-first-tap path that `tests/e2e/audio.test.mjs` drives.

| x6, ipad-pro-9.7 | before | after |
|---|---|---|
| first swipe of the session: worst frame | 183-217 ms | **16.8 ms** |
| first swipe: long tasks | 1 (204-232 ms) | **0** |
| later swipes | 16.8 ms, 0 long tasks | same |
| city idle (3 s, right after boot) | 0 long tasks | 1 (72-171 ms: the context being made while nothing moves) |

Tests: `tests/e2e/city.test.mjs` "city map memory (ipad-pro-9.7)": at rest (day and night, camera 0/480/960/130) exactly the images within one column of the view have a src, nothing of the other set or far away, no whole-layer image; a drag decodes the columns ahead; city -> cafe -> city stays within max(city, cafe) + 4 MB and nothing on screen is blank when the iris opens; the AudioContext exists before any gesture and the first tap only resumes it. `tests/unit/city.test.mjs` checks the tiles in the manifest.


## Theater show effects (P2b.2, bead q62.8, 2026-09-26)

`node tools/perf.mjs --rate 6 --scene theater` (new flag: only the theater, then exit), `ipad-pro-9.7`, headless Chrome with CPU throttle x6. Real taps on the fog machine, the confetti cannon and the snow machine back to back, so all three effects run at once; then the thunder sheet (with the lightning flash). Every particle goes through ONE fx pool for the show (`SHOW_CAP` = 48 elements, `fx.path()`: transform + opacity WAAPI only, no blend modes, no blur, no rAF): fog 8 clouds + confetti 20 + snow 16 = 44 at once, the ambience a couple at a time. The flash is one plain white div made for the flash and removed after it (skipped with `prefers-reduced-motion`).

| scenario | avg fps | p95 frame | max frame | long tasks | DOM nodes | running anims | layouts | JS heap |
|---|---|---|---|---|---|---|---|---|
| theater idle, stage, 3 s | 59.9 | 16.8 ms | 16.8 ms | 0 | 1409 | 9 (idle character life) | 6 | 7.2 MB |
| fog + confetti + snow at once (1st: pool fills) | 59.7 | 16.7 ms | 16.8 ms | 0 | 1597 | 19 | 139 | 4.0 MB |
| fog + confetti + snow again (warm pool) | 59.9 | 16.8 ms | 16.8 ms | 0 | 1597 | 18 | 138 | 4.1 MB |
| thunder + flash | 59.7 | 16.8 ms | 16.8 ms | 0 | 1600 | 3 | 18 | 4.1 MB |
| idle after the effects, 3 s | 59.6 | 16.7 ms | 16.8 ms | 0 | 1597 | 2 (character life) | 6 | 4.1 MB |

Show pool peak: 44 particles (cap 48). After the effects: 0 show animations, 0 show timers, 0 active particles (`afterFx` in the JSON); the ambience stops itself after 10 s (or when the stage leaves the screen / the scene changes), so an untouched theater does no work. The DOM grows by the pool's 48 elements once (created on first use, reused forever). Layouts during the burst: a probe firing one effect at a time found ~15-20 for fog or snow (the audience's face changes) and ~115 for confetti, all from the audience cheer the confetti triggers (the P2b.1 `cheer()`: arm gestures and hearts on each seated character, the same as a bow); the particles themselves add none beyond style recalcs. Decoded images rise from 77.7 to 95.4 MB once all four backdrops and the effect machine variants have been shown (each backdrop is 1294x1448 = 7.2 MB); still to check on the A9X.
