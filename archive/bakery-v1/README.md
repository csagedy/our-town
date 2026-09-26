# Little Lantern Bakery

A calm, open-ended bakery dollhouse. No score, no timer you can lose, no
winning and no losing. You pick things from the garden, mix them in a bowl,
bake them, decorate them, put them in the case, and sell them to whoever
wanders in — or you ignore all of that and just move the furniture around and
tell a story, which is equally valid.

Built as a static site. Drop the folder on GitHub Pages or GitLab Pages and
it runs.

---

## Play

Open `index.html`. That's it — no server, no build step, no network.

| | |
|---|---|
| **The Whole House** | All four rooms at once, showing where everyone actually is. Tap one to go in. |
| **The Garden** | Tap the tree, the bushes, the pumpkin patch or the coop to pick ingredients. |
| **The Kitchen** | Tap the shelves for pantry staples. Drag up to four things into the mixing bowl, tap the bowl to mix, drag the dough into the oven, wait, decorate what comes out. |
| **The Shop** | Put bakes in the display case. Customers wander in and hope for something. Give them anything at all — they're always pleased. |
| **Upstairs** | Nothing to do on purpose. It's the quiet room. |

Drag anything anywhere. Drop things on the basket to carry them between rooms.
Tap a person or an animal to change their face and hear what they're thinking.
Tap the bakery name to rename it.

Everything saves by itself.

### Recipes

There are about forty real recipes to find — `flour + sugar + butter` is a
cookie, `flour + egg + milk + sugar` is a cake, `flour + cinnamon + sugar +
butter` is a cinnamon roll. **Every other combination also works.** Anything
the recipe book doesn't recognise comes out of the oven as a Mystery Bake with
a face and a silly name, which is usually the better outcome.

Nothing can be wasted, burnt, ruined or lost.

---

## How it's built

There is no game engine and no framework. Two ideas do all the work:

**1. All the art is drawn by Python, not by hand.** `tools/` contains a small
SVG drawing library, a front-elevation room vocabulary, and a set of sprite
definitions. Running the build re-draws all 79 sprites and all four rooms from
source. Nothing is a binary asset you can't edit.

**2. Room art is baked; sprites are live.** Each room ships as a standalone
`.svg` loaded through `<img>`, so the browser rasterises it **once** and then
only ever composites a bitmap — which is why the rooms can be as dot-dense as
they like for free. Only the things you can actually pick up are live DOM.

**3. Depth is one number.** The rooms are drawn head-on, so there is no
projection and no depth sorting. Each room has a shallow *floor band*: big
furniture stands against the back wall, and characters and loose objects stand
anywhere between the back line and the near edge, getting slightly larger as
they come forward. A counter is a *line segment*, so "is it on the counter?"
is one x-range test and one y compare. Draw order falls out of the y
coordinate alone.

That split is the whole performance story, and it's why this is comfortable on
old hardware:

* there is **no animation loop** — nothing runs per-frame except while a
  finger is actually down, and even then the only work is writing one
  `transform` string
* only `transform` and `opacity` are ever animated; both are composited and
  neither forces a re-paint
* no blur, no `mix-blend-mode`, no shadows on anything that moves
* the whole play area is one 1200×860 coordinate space scaled by a single
  transform, so resizing the window re-lays-out nothing
* the whole game is **~42 KB gzipped on first load** (one HTML file, one CSS,
  two JS, one room image), and about 100 KB gzipped once all four rooms are
  cached — with zero network requests after that

### Building

```bash
python3 tools/build.py     # redraw everything
python3 tools/test.py      # drive a real session in headless Chrome
```

Python 3, standard library only. No pip, no npm, no node_modules.

`build.py` writes `index.html`, `assets/rooms/*.svg` and `assets/grain.png`.
**Those are committed on purpose** — Pages serves the repo as-is, so the built
output has to be in it. Re-run the build and commit after any change to
`tools/`.

`test.py` injects `tools/selftest.js` into a throwaway copy of the page and
drives the real game with synthetic pointer events: harvesting, mixing,
baking, decorating, the basket, surfaces, room switching and the display
case. It should print `0 problem(s)`.

### Where things live

```
index.html              generated — do not hand-edit
css/game.css            all styling
js/engine.js            stage, sprites, dragging, effects, sound, saving
js/game.js              the rules: recipes, stations, customers
tools/palette.py        THE ART DIRECTION. Start here to re-skin.
tools/draw.py           SVG primitives, hand-wobbled shapes, PNG writer
tools/elevation.py      the front-elevation room vocabulary
tools/rooms_elev.py     the four rooms: art, stations, surfaces, floor bands
tools/sprites_food.py   ingredients, doughs, bakes, toppings
tools/sprites_people.py the cast, the animals, the props
tools/gamedata.py       items, recipes, sources, dialogue
tools/build.py          ties it together
tools/contact_sheet.py  renders every sprite at once, for eyeballing the art
tools/attic/            the retired isometric/risograph direction (see its README)
```

### Changing it

* **Re-skin the whole game** — edit `tools/palette.py` and rebuild. Every
  sprite and room refers to palette *names*, never to raw hex, so changing the
  six inks restyles all of it at once.
* **Add a recipe** — one line in `RECIPES` in `tools/gamedata.py`.
* **Add something to say** — `CHATTER`, `GREETINGS`, `THANKS` in the same file.
* **Add an item** — draw it in `sprites_food.py`, register it in `FOOD`, add a
  line to `ITEMS`. It will appear in the sheet automatically.
* **Move furniture** — `tools/rooms_elev.py`. Positions are fractions across
  the room (`r.u(.55)`) and depths into the floor band (`r.at(.3)`), so they
  survive a change of room size. Each room function ends with its `stations`
  and `surfaces`.
* **Move the opening scene** — `freshState()` in `js/game.js`. Positions are
  given as a fraction across the band and a depth into it, or an index into
  that room's surfaces, so moving a counter can't leave the flour in mid-air.

---

## Publishing

### GitHub Pages
Push the folder to a repo, then **Settings → Pages → Deploy from a branch**,
branch `main`, folder `/ (root)`. No workflow needed; there's nothing to
compile server-side.

### GitLab Pages
Add `.gitlab-ci.yml`:

```yaml
pages:
  stage: deploy
  script: [ "mkdir -p public && cp -r index.html css js assets public/" ]
  artifacts: { paths: [ public ] }
  rules: [ { if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH } ]
```

---

## The art direction

Warm lamplight: late-afternoon light through a shop window. Soft organic
shapes, flat fills with one gentle highlight, no hard black, no harsh
saturation, a little paper grain over everything. Rooms are seen head-on and
sliced open, the way a dollhouse is.

Every sprite refers to palette *names*, never to raw hex, so `tools/palette.py`
re-skins the entire game in one edit. That is not theoretical — this game
shipped once in a six-ink risograph palette, and switching cost exactly one
file. The old direction still renders; see `tools/attic/`.

---

## Two things worth knowing

**Saving needs a real URL.** Chrome blocks `localStorage` on `file://`, so if
you double-click `index.html` the game plays perfectly but forgets everything
when you close it. Served from Pages — or locally via
`python3 -m http.server` and then <http://localhost:8000> — it saves properly.
The game never crashes when storage is unavailable; it just doesn't remember.

**Sound is off by default** and lives under the ⋮ menu. When it's on, every
tone is a soft sine generated in code with a slow attack — there are no audio
files and nothing sharp or sudden. Motion respects
`prefers-reduced-motion`; with it on, the game is fully playable with every
animation disabled.
