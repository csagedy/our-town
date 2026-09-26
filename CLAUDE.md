# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## The Project: "our town" pretend-play game

A Toca Boca-style open-ended pretend-play game for two kids:
- **Zoe (9)**: voracious reader; loves cooking and dreams of opening a cafe; loves singing and theater.
- **Ian (5)**: starting kindergarten, knows only a handful of sight words; loves building and Spider-Man; plays "school" to understand it.

**Toca Boca mechanics, not a "game":** no score, no timers, no failure, no win state. Everything is draggable, everything reacts to a tap (squish, sound, face change), characters and objects carry between locations, the state autosaves. Joy is in the tactile details and funny reactions.

**Locations (city map hub):** Cafe (kitchen and dining room), Theater (stage, costume closet, lights, singing), Construction Site (build, dig, stack), School (kindergarten classroom and recess). Superhero play lives in the theater costume closet: generic capes, masks, a web-slinger suit. **No Marvel/Disney IP, names, or logos.**

**Hard requirements**
- Target: **iPad Safari, landscape, touch-first**, installable to the home screen as a PWA.
- **Must run fully offline** (road trips). Service worker precaches everything; no CDNs, no network calls at runtime.
- **Zero reading required** for Ian: all core play is icons, pictures and sound. Text is an optional layer for Zoe (menu board, dish names, show programs, name tags).
- Mic recording in the theater must work offline and on-device only; never upload anything.
- Performance on older iPads: animate only transform and opacity; big hit targets (at least 64pt).
- **Target devices:** an original iPad Pro (A9X, which tops out at **iPadOS 16 / Safari 16**, 2 to 4GB RAM) and an iPad Air 5th gen (M1). **Safari 16 is the compatibility floor**: no syntax or APIs newer than Safari 16.0 (check caniuse), and performance is judged on the old Pro.
- **Hosting:** GitHub Pages under the csagedy account, same as `/Users/chris/workspace/games` (kids-arcade). Reuse its PWA/service-worker update pattern (`sw.js`, version shown in menu, "Update now" button). Creating or pushing a repo needs the user's OK.
- **Mechanics must actually work.** The last attempt's interactions "didn't seem to work as intended". Every interaction bead must be verified by driving it with real synthetic touch/pointer events in a browser (touch emulation, iPad-sized viewport), not just by unit tests or reading the code. Describe in the close note exactly what you did and saw.
- The old bakery prototype is in `archive/bakery-v1/`. It's reference only. Don't build on it without a reason.

**Workflow:** all work is tracked in beads (`bd`). Orchestrator is the main Claude session; subagents claim a bead, do the work, and close it with a note on what changed and how it was verified. Don't commit unless the orchestrator asks.

## Build & Test

No npm install, no runtime dependencies. Tools need only `python3` (stdlib), `node` (22+, for its built-in test runner and WebSocket) and Google Chrome.

```bash
python3 tools/serve.py              # dev server: http://127.0.0.1:8124/ (no-cache; --lan for an iPad on Wi-Fi, --port N)
python3 tools/build.py              # build steps: icons, art (node tools/art/build.mjs → assets/ + assets/art-manifest.json), precache (rewrites sw.js's VERSION + FILES)
python3 tools/build.py precache     # run after adding/removing/changing shipped files (index.html, src/, assets/, data/); tests/unit/precache.test.mjs fails on a stale file list
node --test "tests/unit/*.test.mjs"                        # fast: unit tests only, about 1s (run these while iterating)
node --test --test-concurrency=4 "tests/**/*.test.mjs"     # full: unit + e2e, a few minutes (before closing a bead)
node --test tests/e2e/boot.test.mjs                        # one file
```

- **Unit tests** (`tests/unit/*.test.mjs`) run in Node with `node:test` and import `src/` modules directly, so keep DOM access out of module top level. `runtime-sources.test.mjs` is a tripwire: it fails on any `http(s)://` in runtime files and on common features newer than Safari 16.0 (extend its `TOO_NEW` list when you learn of one).
- **E2E tests** (`tests/e2e/*.test.mjs`) use `tools/harness.mjs`: it starts `serve.py` on a free port, launches headless Chrome, and drives it over the DevTools protocol with an iPad landscape viewport (`ipad-air` 1180x820 default, `ipad-pro-9.7` 1024x768, `ipad-pro-12.9` 1366x1024), touch emulation and an iPad Safari 16 user agent. `page.tap/drag/longPress/tapElement` send trusted touch input, which the page sees as `pointerType: "touch"` pointer events. `page.errors` collects exceptions, `console.error` and failed loads; `page.externalRequests()` must stay empty. `page.screenshot(name)` writes `test-results/<name>.png` (git-ignored); look at it. API reference is the header comment of `tools/harness.mjs`; `tests/e2e/boot.test.mjs` is the example to copy. `HEADFUL=1` shows the browser.
- The page sets `body[data-boot="ready"]` when booted (`"error"` if boot threw); `openPage()`/`goto()` wait for it.
- **E2E tests must hold up under load** (several test files at once plus other agents' Chrome instances; bead mhf.17). Each `openPage()` gets its own server port and temp Chrome profile, and `close()` waits for Chrome to exit and never throws over a leftover temp dir. Touch events carry synthetic CDP timestamps, so `e.timeStamp` in the page (tap duration, drag velocity) is exactly what the test asked for however slowly the machine runs. For scripted raw touches use `page.gesture()` (`g(type, points, atMs)`) rather than `page.touch`, so they get the same treatment. Timers in the page (long-press, animations) still run in real time, so don't pad a tap with extra round trips (send a quick gesture's events back to back, see the sloppy tap in input.test.mjs). Chrome delivers `pointermove` aligned to frames: `await page.frames(2)` before measuring a drag with the finger still down, and read values that move every frame (camera, dragged item) in a single `page.eval`. So: **never** assert after a fixed sleep; wait on a condition with `page.waitFor(pred)` (default 15s), `page.waitForAnimations(sel)` or `page.frames(n)`, and snapshot short-lived state in the page when it happens (see the MutationObserver in boot.test.mjs) instead of polling for it. Keep explicit `timeout`s generous (a bounded wait costs nothing when the condition comes true early); `E2E_TIMEOUT_SCALE=3` stretches all harness timeouts on a very slow machine. A fixed sleep is only for a window in which something must *not* happen. Slow animations: speed up the page's clock instead of waiting (stage.test.mjs `fastFrameClock`). A timeout message ends with the page state, errors and requests in flight; read it before blaming the harness.
- **Limits:** Chrome is Blink, not WebKit, so the harness can't catch Safari-only bugs. Safari's WebDriver (`safaridriver`) is installed but "Allow remote automation" is off in Safari's Developer settings, so there's no automated Safari run yet (and desktop Safari is not Safari 16 anyway). Real iPad checks: `python3 tools/serve.py --lan` and open the Mac's LAN address (no service worker there: it needs localhost or https).

## Architecture Overview

Static PWA: `index.html` loads `src/app.css` and the ES module `src/main.js`; no framework, bundler or build step needed to run. Full design: `docs/design.md` (section 6 is the architecture, section 7 the task plan).

- `src/main.js` boots: blocks browser gestures (pinch, double-tap zoom, callouts), creates the stage, mounts the current scene, calls the service-worker hook.
- `src/engine/stage.js`: the logical 1440x1000 stage, scaled to fit and centered (P1.5 extends it with bleed and camera).
- `src/scenes/town.js` (P1.13): the default scene. Which location is on screen (`city` or `cafe/kitchen`, kept per iPad in localStorage `ourtown.here` with the map's pan), the zoom + iris transition, and the round map button (top-left, every location). `city.js` is the map hub (buildings react to taps; the cafe goes in, the others play "coming soon"; the sun/moon toggles night via `mapSet {night}`), `kitchen.js` the cafe kitchen (kitchen art layers + manifest surfaces + the P1.8 behaviors), `art.js` loads `assets/art-manifest.json`. Debug handle `window.__town`; e2e `tests/e2e/city.test.mjs`.
- `src/scenes/carry.js` (P1.14): the pocket tray (per-device room `pocket/<deviceId>`), hold-to-go travel (input.adopt keeps the finger's drag across a scene change), the car on the map (a container that drives its passengers into the cafe), the city's entity layer (`city.js` now has a room view: things rest on the street, drawn at `entityScale` 0.45). View hooks `overUi`/`dropOnUi` let UI over the room take drops. e2e `tests/e2e/carry.test.mjs`.
- `src/scenes/cafe.js` (P2a.1): the cafe STRIP the map's cafe door leads to (location id stays `cafe/kitchen`): 2880 wide, kitchen/counter/dining, flings snap to the zone stops (`camera.setStops`), layers as column tiles decoded only near the camera (`src/engine/tiles.js`, docs/perf.md), state pieces (fridge/oven doors, burners + knobs, sink tap, toaster, register, bells, front door...) whose state is props of one `cafe-fixtures` entity, inside surfaces (fridge shelves, oven rack) that exist and show their contents only while the door is open, P1.9 spawners (visible fridge stock, invisible hot spots over the painted pantry, cup/plate stacks and ice-cream tubs), first-visit seeding. Food state looks: `src/core/behaviors/cafe.js` (`food`, `mix`, `dish`, `blender`, `toaster`, `sink`, `mystery`, `drink`); Mystery Dish composite: `src/core/mystery.js`. P2a.2 prep: the food state model is `src/core/food.js` (props `cut`/`cooked`/`stir` are `inc` counters clamped when read; a bowl's contents are its child entities), the stations (knife strokes on the cutting board, whisk circles over the mixing bowl, blender, toaster, sink, coffee) are `src/scenes/cafe-prep.js`; e2e `tests/e2e/cafe-prep.test.mjs`. P2a.3 heat (stove, flip, pour, boil, ladle, oven, warm food) is `src/scenes/cafe-heat.js` (rules in food.js; `window.__town.scene.heat`), e2e `tests/e2e/cafe-heat.test.mjs`. P2a.4 recipes: the table is `data/recipes.json`, rules + Mystery Dish generator `src/core/recipes.js` (`resolveDish(at, items)`), plating/pan-to-plate/recipe book wiring `src/scenes/cafe-recipes.js` (`window.__town.scene.recipes`), the picture book UI `src/ui/recipe-book.js`; e2e `tests/e2e/cafe-recipes.test.mjs`. The old one-screen kitchen (`kitchen.js`) is at `?room=kitchen`. Debug: `window.__town.scene.pieces/tiles/hidden()`; e2e `tests/e2e/cafe.test.mjs`.
- `src/scenes/site.js` (P2c.1): the CONSTRUCTION SITE strip (location `construction/yard`; the map's construction building goes in): 2880 wide, build/crane/dig zone stops, tiles, fixture pieces (portable toilet door with a flush, crane lever; the crane, wrecking ball, dig pit, excavator, truck and mixer only wobble until P2c.2-4) as props of one `site-fixtures` entity, hot-spot spawners over the painted piles plus visible stock (roofs, windows, door... on the scaffold; paint cans on the workshop shelf). BUILD GRID rules are pure in `src/core/buildgrid.js`: build pieces dropped over the deck snap to the 40-unit grid onto a per-column height map (manifest `snap` footprints and stack points; half-cell planks/beams/flat roof), the grid is only entity positions (`move` ops), lifting a piece out lets the ones above settle down, the build's tops are live surfaces (characters stand on a roof). Hammer drop = lock (nail), wet brush over a piece = paint (`src/core/behaviors/site.js`: `buildpiece` look, `hose`). Debug `window.__town.scene.build`; e2e `tests/e2e/site.test.mjs`.
- `src/scenes/site-rigs.js` (P2c.2): the site's TOWER CRANE (one `crane-hook` entity = the grab point, moved with `move`; its load is an `attach` child drawn on it; trolley drag, hook drag, lever down = lower/take hold/set down (grid snap via buildgrid), up = raise; damped pendulum rAF only while moving; a character rides with pose `hold-up`, expr `wheee`) and WRECKING BALL (pull back and let go: `src/core/wreck.js` plans the swing and every knock, landing, spin before dispatch; one `set props.wreck` on site-fixtures carries the plan, then `move`s; locked pieces wobble and stay). Pure geometry `src/core/crane.js`. Debug `window.__town.scene.crane/.wreck`; unit `tests/unit/site-rigs.test.mjs`, e2e `tests/e2e/site-rigs.test.mjs`.
- `src/scenes/site-dig.js` (P2c.3): the site's DIG PIT. The `dirt` piece is a `<canvas>` over a dig mask (`src/engine/digmask.js`: a reusable, documented module: a 2-unit-cell grid of dirt levels, soft circle dig/fill, ONE `dig-stroke` entity per gesture (quantized circle centres + radius) in room `construction/dig`, folded into a base64 `dig-snap` entity after 40 strokes; `createDigPit` = store controller, `createDigCanvas` = renderer, one rAF per change; the school sandbox reuses it). Buried treasures (props.buried, sort key under the dirt) are found by a coverage check; spade/bucket/wheelbarrow/truck carry scoops, `dumpAt` puts dirt in the truck, a wheelbarrow, the pit (refill) or a `dirt-pile`; excavator = one-finger bucket drag (arm + treads, `src/core/digsite.js`), dump truck tap = tip (plan prop every iPad animates), both drivable; the truck and excavator bodies are pieces only (not baked into the mid layer). Debug `window.__town.scene.dig`; unit `tests/unit/digmask.test.mjs`, e2e `tests/e2e/site-dig.test.mjs`.
- `src/scenes/theater.js` (P2b.1): the THEATER strip (location `theater/stage`; the map's theater goes in): 2880 wide, backstage/stage/audience zone stops, tiles, pieces (the spotlight at its 3 `copies`) whose touches go to per-piece/per-state HIT boxes (big clear images like curtain halves never steal taps), state in one `theater-fixtures` entity (`curtain` open/half/closed, trunk, trapdoor). Curtain: rope tap/pull or drag a half; opening on a performer = audience "ooh" + applause (sfx `ooh`, `applause`, `tada`). Tap a character on the stage (`behaviors.charTap`, asked first by characters.js part taps) = bow (`chars.gesture`), the seated audience cheers, `rose` things fly onto the stage (cap 8). Racks = visible costume stock (`rack-*`), props shelf/trunk/wig stand/snacks/tickets = hot spots; costume kinds are the rig wear pieces with theater art. Ticket window gives a ticket, a tap on the booth counter stamps it; the vanity mirror twinkles. Spotlights, backdrop, effects, mic, boombox and instruments only react (P2b.2-P2b.7). Debug `window.__town.scene.curtain/audience()/performers()/stats()`; e2e `tests/e2e/theater.test.mjs`. P2b.5/P2b.6 sound corner `src/scenes/theater-sound.js` (audio `src/audio/mic.js`, pure tape model `src/core/tapes.js`): the red dot records (countdown dots, level ring, the singer's mouth follows the input; MediaRecorder `audio/mp4` on Safari, WAV fallback), the voice is a persist Blob keyed by the tape's id (this iPad only, never in an op, never uploaded), the tape entity carries the envelope for lip-sync; boombox plays tapes, six filter boxes on the booth balcony; the other iPad plays a built-in melody + a far-away cloud. Debug `window.__town.scene.sound.state()/stats()`; e2e `tests/e2e/theater-mic.test.mjs` (stubs getUserMedia in-page: real audio capture hangs Chrome on this Mac).
- `src/scenes/boot.js`: the retired placeholder buddy, now only at `index.html?room=buddy` (and `?room=wide`); the persistence, audio and two-iPad e2e tests still use it.
- `sw.js` (classic script) + `src/pwa.js`: offline service worker, kids-arcade pattern. A new version installs in the background and WAITS: it takes over only on a cold launch (pwa.js activates a worker already waiting at boot) or via `updateNow()` (parent menu "Update now"), never mid-play. `installedVersion()`/`waitingVersion()` give the content-hash version (cache `ourtown-<version>`). Cache-first in production; network-first with cache fallback on localhost/127.0.0.1 so dev edits show without a rebuild. Also requests `navigator.storage.persist()`. Offline/update e2e: `tests/e2e/offline.test.mjs`.
- `src/ui/` (P1.16): `parent-menu.js` (the grown-ups menu: hold the top-left corner 2 s; sound, volume, voice, words, play together, tidy, start over, world file save/load, version + Update now), `settings.js` (device-local settings in localStorage `ourtown.settings`, never a world op), `perf.js` (`index.html?perf` overlay, `window.__perf`), `parent.css` (also the text-layer name tags). Debug handle `window.__parentMenu`; e2e `tests/e2e/parent-menu.test.mjs`. Perf: `node tools/perf.mjs --rate 6`, results and the Safari Web Inspector method in `docs/perf.md`.
- `src/core/persist.js` (P1.4): IndexedDB op log plus snapshots, boot replay, blob store, world-file export/import; `openWorld()` in `main.js` gives the store. The boot buddy's (`?room=buddy`) squish count is a store entity so e2e can prove saves survive reload and a crash (`tests/e2e/persist.test.mjs`). Debug handles: `window.__store`, `window.__persist`.
- P1.7 view layer (`src/engine/`): `room.js` (`mountRoom(stage, def)`: back/mid/front art in one depth container), `surfaces.js` (pure: surface segments + floor band, `settle`, sort keys, z-index bands, depth scale), `view.js` (`createRoomView`: pooled entity elements, rev-diffed, drag -> surface drop -> one `move`; `behaviors` hooks are the P1.8 seam), `tween.js` (WAAPI, transform/opacity only), `fx.js` (particle pool, cap 24), `sprites.js` (placeholder shapes behind `spriteFor`/`addSpriteSource`, where real art plugs in). Test room: `index.html?room=test` (`src/scenes/test-room.js`), e2e `tests/e2e/views.test.mjs`.
- P1.8 catalog and behaviors: `data/catalog.json` (schema in the header of `src/core/catalog.js`; loaded with fetch; sprites come from `assets/art-manifest.json` when the kind's art exists, placeholders otherwise), `src/core/behaviors/` (`registry.js` = the behavior API, `builtin.js` = the starter set, `runtime.js` = the view hooks plus the universal fallback: every tap animates, sounds and sparkles). Catalog room: `index.html?room=catalog`, e2e `tests/e2e/behaviors.test.mjs`. Counters and aggregates use the `inc` intent op, never an absolute `set` (design.md 6.4).
- P1.15 Character Maker: the photo-booth kiosk on the map goes to the `booth` location (`src/scenes/booth.js`, rules in `src/engine/char-maker.js`, art `tools/art/rooms/booth.mjs`); the character being made lives in room `booth/mirror`; 12-character starter cast in `tools/art/characters/cast.mjs`. Contract: `docs/rig.md` section 11; e2e `tests/e2e/booth.test.mjs`.
- P1.10 characters: `src/engine/char-model.js` (pure: the `char` entity, cast props, poses with held items, seats, spawn/seed helpers) and `src/engine/characters.js` (`mountCharacters`: live SVG characters in the room view: drag/dangle, sit/lie on room `seats`, hold, eat, wear, tap reactions, long-press talk, idle life). Contract and API: `docs/rig.md` section 10. Dev room `index.html?room=cast`, e2e `tests/e2e/characters.test.mjs`.
- **Art:** all-vector, source in `tools/art/` (Node build tooling, headless-Chrome raster). Style guide `docs/STYLE.md`, character rig contract `docs/rig.md`. Rooms ship as WebP depth layers (back/counter/mid/front), props as WebP sprites offset by manifest anchors, characters as live inline SVG via `src/engine/rig-svg.js`. Dev previews: `tools/rig-preview.html`, `tools/art/contact-sheet/index.html`, `tools/sound-board.html`. Style references in `art-ref/` are copyrighted and gitignored, never publish them.
