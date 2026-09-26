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

- **City map decoded memory 46.8 MB** (STYLE.md estimated ~30 MB), before GPU layer copies; during a city -> kitchen transition both scenes are alive, so the peak is ~77 MB of bitmaps alone. On a 2 GB iPad Pro that leaves little room once Phase 2 adds more places. Options: lower `pxPerUnit` for the city back layer (the map is never zoomed), split it into tiles and drop the off-screen ones, or release the city's images before decoding the next place.
- **Long task at the start of a city pan** (68 ms at x4/x5, 140 ms at x6, 116 ms frame): likely the promotion/raster of the 3900 px wide room layer when `will-change` goes on at drag start. A visible hitch on the A9X when a kid starts to swipe the map. Check it in Web Inspector's Rendering Frames; if confirmed, keep the room layer promoted while the map is up, or pre-promote on mount.
- **Idle characters cause layouts**: 30 layouts in 3 s with 4 characters and ~120 in 3 s with 12, with nobody touching the iPad (blinks and idle behaviors toggling classes/attributes on live SVG). Not visible at 60 fps in Chrome, but it breaks the "0% CPU when idle" pillar (battery on road trips) and costs more on WebKit's SVG. 12 characters are also ~1750 DOM nodes.
- The overlay's own rAF loop is not counted against any of this (it is off in normal play).

Not risky: drag input handling, idle city (no work at all), JS heap (under 6 MB), the text layer (a CSS class; no extra layouts beyond the one toggle).
