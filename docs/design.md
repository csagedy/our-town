# Our Town: Game Design Doc

Status: v1 design, the source of truth for Phase 1 to 3 beads. Hard requirements are in `CLAUDE.md`.

**Players.** Zoe (9) reads a lot and loves cooking, cafes, singing and theater. Ian (5) can't read yet and loves building, Spider-Man and "playing school". They sometimes play together on one iPad and may later play on two iPads.

**Shape.** A city map hub leads to four locations: Cafe, Theater, Construction Site and School. Each location has two or three *rooms* (scenes). Kids drag characters and objects anywhere, carry them between locations, and the world remembers everything.

---

## 1. Design pillars

1. **Everything reacts.** Every object answers a tap with a squash-and-stretch wobble, a sound, and sometimes a state change (lamp on/off, egg cracks, drum booms). A character answers a tap with a face change and a babble sound. Nothing on screen is decoration only: if it looks touchable, it is. Even the background has hot spots (clouds puff, birds flap, windows light up).
2. **Surprise over instruction.** No tutorials, arrows or quests. Delight comes from discovery: combining things gives unexpected but sensible results, and odd combinations always give a funny result instead of nothing (this is the bakery prototype's "Mystery Bake" rule, now applied everywhere).
3. **No failure, ever.** Nothing burns, breaks for good, runs out or is lost. Trash cans spit things out again (a "boing" plus a raccoon peeking out), and a Lost & Found box in the hub holds anything that falls out of a scene. Nothing is timed, scored or won. Cooking "too long" gives *extra toasty* food, which customers also love.
4. **Tactile physics, not simulation.** Dropped things fall to the nearest surface with a small bounce. Held things tilt as you swing them. Characters dangle their legs when you lift them. All of this is cheap tween animation, not a physics engine.
5. **Characters are the heart.** Faces show emotions (happy, laughing, surprised, yummy, yucky-but-funny, sleepy, singing). Characters eat, sit, lie down, hold things, wear things and react to each other.
6. **Two players, one world.** Every location has a deep layer for Zoe (recipes, menus, shows) and an immediate layer for Ian (smash, stack, dig, dress up). Neither layer blocks the other.
7. **Persistence is magic.** What Ian builds at the construction site appears in the city. Zoe's cafe keeps its menu. Put a hat on a character at the theater and they wear it at school.

---

## 2. Core systems

### 2.1 Scenes and depth
- Each room is a head-on dollhouse slice on a logical **stage 1440 x 1000** (see §6.3). Big furniture sits against the back wall, and a **floor band** (y from about 700 to 960) is where characters and loose props stand.
- **Surfaces** are line segments (counter tops, shelves, stage, table tops, the rug). A dropped item snaps to the highest surface under its x at or below the drop point. If there is none, it goes to the floor band. As in the prototype, draw order is sorted by `y` (then `z` for items stacked on surfaces).
- **Rooms scroll horizontally** when wider than the screen (the Cafe is kitchen, pass-through and dining in one 2400-wide strip). Drag panning uses two fingers or an empty-area drag. Edge auto-pan kicks in while carrying something.

### 2.2 Draggable objects (props)
- Every prop is an entity with `kind` (from the catalog), `pos`, `parent`, and `props` (state such as `cooked: 2`, `color`, `filled: 'soup'`).
- **Touch model:** tap under 10pt of movement and under 250ms means *interact*. Anything else means drag. Hit targets are at least 64pt: the art may be smaller, but the hit box is padded. A long-press on a character picks it up whole instead of a held item.
- While dragging, the prop scales to 1.08, tilts with velocity (clamped to ±12°), casts a soft shadow sprite, and valid drop targets pulse. On drop it squashes once and plays a surface-specific sound (wood thunk, metal clang, rug thump).
- **Interaction rules** are data: `onTap`, `onDropInto(target)`, `onDropOnto(character)`, `onCombine(other)`. Each returns a list of actions (see §6.4). Unhandled combos use a **fallback reaction** (wobble plus a "hmm?" chirp), never an error.

### 2.3 Containers
- Any entity can be a container: slots `{capacity, accepts: [tags], layout: 'stack'|'grid'|'pile'|'hang'}`. Examples: plates, pots, shelves, backpacks, cubbies, dump-truck bed, costume rack, the fridge.
- Contents are child entities (`parent = containerId`) and move with the container. Tipping a container (dragging it fast downward, or tapping the pour button on a pot) spills its contents with a scatter animation.
- **Spawners** are special containers that never empty: the fridge, pantry shelves, the toy bin, the lumber pile, the costume closet. Dragging from them clones a new entity, which keeps object counts bounded and never runs out. **Entity cap:** each room caps loose spawned props at about 120. Past the cap, the oldest *untouched* spawned props quietly "go home" (fade back to their spawner). Kid-customized or placed items are never auto-removed.

### 2.4 Characters
- **Cast:** 12 starter characters of varied ages, skin tones and hair, including a Zoe-like girl, an Ian-like boy, grown-ups, a teacher, a baby, a grandpa and a dog. There are **no named IP characters**. Plus a **Character Maker** booth in the hub (see below).
- **Rig:** body parts are separate sprites (head, torso, 2 arms, 2 legs, face layer, hair, hat, mask, cape, held-item anchors on each hand). Poses are `stand | walk | sit | lie | hold-up | cheer | sing`. Poses are keyframe sets of part transforms, and only transforms are animated.
- **Faces:** a face layer of eyes plus mouth sprites. Emotions are `neutral, happy, laugh, surprised, yum, yuck-funny, sleepy, singing, proud, scared-fun`. A tap cycles through random reactions. A context sets the emotion (tasting, applause, being lifted = "wheee" face).
- **Hold:** drop a prop on a hand to hold it. Each character has two hands. Drop food on the mouth to eat it: chomp animation, crumbs, face reaction based on the food's `taste` tags. Food shrinks through bites 3→2→1→gone, and the plate stays.
- **Sit / lie:** seats and beds have anchor points. A character dropped near one within 60pt snaps into the sit or lie pose. Lying down plus a tap gives a sleepy face and floating "z" (an icon, not text).
- **Wear:** clothing and costume items dropped on a character snap to the matching slot (head, face, back, body, feet). Drag a worn item off to remove it.
- **Character Maker (hub):** swipe carousels for head shape, skin, hair, hair color, eyes, outfit top/bottom, shoes. A big green check icon saves the character. It uses no text and shows a random "shuffle" die. Name tags are an optional Zoe layer (§4). Built (P1.15) as picture-button tabs and option grids (body type, skin, hair style and colour, eyes, brows, facial hair, cheeks, hat/headscarf, glasses, top, apron/vest, bottom, shoes, cape/wings) around a big live preview; a photo-frame button saves it onto the booth floor; drag a character onto the stage to restyle it (`docs/rig.md` section 11).
- **Idle life:** characters blink every 3 to 6 seconds and sometimes look at a nearby moving thing. Everything is event-driven with no per-frame loop (§6.2).

### 2.5 Carrying things between locations
- **Hands:** anything a character holds or wears travels with the character.
- **Bags:** a backpack or tote is a container that characters wear, and it travels with its contents.
- **The Car:** in each location, a "vehicle" at the left edge (a car at the Cafe, a bus at School, a dump truck at the Construction Site, a van at the Theater) is a container with 4 seats plus a trunk. On the map, drag the vehicle to another location: it drives there with a honk.
- **Pocket tray:** a persistent strip at the bottom of the screen (collapsed to a tab icon) holds up to 8 things and characters. It is visible in every scene. This is the fast way for Ian: drop something in the tray, open the map, go, drag it out.
- **Built in P1.14** (`src/scenes/carry.js`, e2e `tests/e2e/carry.test.mjs`): a round grape pocket button in the bottom-left corner of every place (the map too) with a 6-cell tray that slides out; it also peeks open by itself whenever something is being dragged, so the target is always there. Pocketed things are ordinary entities in the room `pocket/<deviceId>` (children ride along: a character's held and worn things, a bag's contents). **Two iPads:** each device has its own pocket room and only ever shows or takes from its own; pocketing is a plain `move`, so the host's leases apply; a guest's pocket lives in the host's world while visiting and stays there when the visit ends (nothing crosses worlds). **Hold-to-go:** hold a dragged thing on the map button (or, on the map, on a built building's door) for 0.65 s and it comes along, still under the finger (it waits in the pocket during the transition, so nothing is lost). **The car** is one convertible on the map (catalog `car`, a container with 4 seats): drop characters and things in, tap it and it honks and drives to the next building's door; at a built place its passengers get out inside and you follow; at an unbuilt one the building plays its "coming soon". The per-location vehicles at each room's left edge are still to come with the Phase 2 locations. **Bags:** `backpack` (catalog container), one in the cafe.

### 2.6 City map and travel
- The hub is an illustrated city seen front-on like a Toca map (a street 2400 units wide that pans), with 4 big buildings at least 200pt wide that read by silhouette alone, plus the Lost & Found box, 6 empty lots and a park strip, plus the Character Maker booth (a photo-booth kiosk between the theater and the construction site, P1.15). A round map button (house icon) sits in the top-left corner of every location. Built in P1.13: `src/scenes/town.js`, `city.js`; art `tools/art/rooms/city.mjs`.
- An unbuilt location never gives a dead tap: its building plays a "coming soon" reaction (theater curtains wiggle, the crane waves, the school bell rings).
- Tap a building: it bounces, its signature sound plays (a bell, a curtain whoosh, a truck beep, a school bell), then a 400ms zoom transition into the location. The last room you were in is remembered.
- **Built structures appear on the map** (§3.3). The map has 6 empty "lots" that Ian's saved builds fill.
- Day/night: a sun/moon toggle on the map turns the whole city to night. Lights turn on in all scenes and characters get sleepy faces. It's purely cosmetic.

### 2.7 Autosave
- State is saved automatically in IndexedDB (§6.4): an op log appended on every committed action, and a snapshot compacted every 200 ops or on `visibilitychange` → hidden. There is no save button.
- **Parent menu:** a small gear icon in the top-right corner needs a 2-second press (kid-proof). It has sound on/off, text layer on/off, a "reset a location" option (with a confirm), and export/import of the world as a file (a backup, and the future path for two-iPad seeding). On iPadOS 16 in home-screen mode, `<a download>` of a Blob is unreliable and Safari has no `showSaveFilePicker()`: export through `navigator.share({files})` (Safari 15+, check `navigator.canShare`) with `<a download>` as the fallback, and import with `<input type="file">`.

---

## 3. Locations

For each location: rooms, then interactions. **Serves:** Z = mainly Zoe, I = mainly Ian, B = both.

### 3.1 Cafe (rooms: Kitchen, Dining Room, Front Counter)

**Cooking model.** Food items carry state: `{base, cut: 0|1|2, mixed: [...ingredients], cooked: 0..3, method: raw|boiled|fried|baked|grilled, toppings: [], temp}`. A **recipe table** maps normalized ingredient sets plus method to named dishes (about 40 dishes, from the bakery `RECIPES` idea but multi-method). A combo that isn't in the table gets a generated **Mystery Dish** with a face and a silly name (from the bakery prototype's `MYSTERY_NAMES` approach), drawn by tinting a generic dish sprite with the average ingredient color. Doneness 3 means "extra toasty", never burnt-and-ruined.

| # | Interaction | Delight reaction | Serves |
|---|---|---|---|
| 1 | Open fridge / pantry and pull out ingredients (about 30: egg, tomato, cheese, bread, pasta, rice, fish, chicken, tofu, carrot, lettuce, strawberry, banana, chocolate, flour, sugar, milk, butter, lemon, pepper, etc.) | Door swings, cold-air puff, each item boings out | B |
| 2 | Chop on the cutting board: each tap with the knife cuts once (whole → halves → slices) | Satisfying chop thunk, pieces fan out, 3rd chop gives a sparkle | Z |
| 3 | Crack eggs on the bowl rim | Crack sound, yolk plops, sometimes a baby chick peeks out (1 in 20), cheeps, and turns back into an egg yolk | B |
| 4 | Mixing bowl: drop up to 5 items in, then swirl a finger in a circle to mix | Batter color blends live with the stirring, glooping sound, bowl wobbles; stirring fast splatters (cosmetic) | Z |
| 5 | Stove: 2 burners, a pan and a pot; turn knobs (tap) for flame | Flame whoosh, oil sizzle loop, food jumps in the pan; flipping (swiping up on the pan) makes the pancake spin in the air | Z |
| 6 | Pot boils: drop pasta, water, veg | Bubbles rise, lid rattles, steam puffs; ladle scoops soup into a bowl | Z |
| 7 | Oven: drag in a tray, tap the door to close; about 6s bake with a window glow | Oven "hums", food puffs up visibly through the window, a ding plus a pop-open door | B |
| 8 | Blender: drop fruit/milk/ice, press the big button | Loud whirr with the blender shaking, color swirl, pours a smoothie with a straw | I |
| 9 | Toaster | Bread goes down; POP, toast flies up, you can catch it | I |
| 10 | Spice and sauce bottles: shake over food | Particles fall, the food gets sprinkles/drizzle as a topping layer; pepper makes the nearest character sneeze | B |
| 11 | Plating: drag food onto plates; the plate holds up to 4 things arranged in a pleasing layout; drop a garnish (herb, cherry, flag pick) | Plate chimes when "complete" (at least 2 items plus a garnish), sparkles | Z |
| 12 | Name the dish: the menu board can pick up a plated dish and generates its name ("Cheesy Tomato Toast") | Board writes itself with a chalk sound; see the Z layer in §4 | Z |
| 13 | Customers: the front door bell rings every so often (only while the kids are in the Dining room); a customer walks in, sits, and a thought bubble shows a **picture** of what they want (a pictured dish or just "something sweet" = a cake icon) | Customer waves; the bubble pops in | B |
| 14 | Serve: drop the plate on the table or on the customer. They eat with bites, face reacts by taste tags; a matching order gives a big cheer plus hearts. Anything else still gets "yum" or a funny face with a laugh. They leave coins (tokens) on the table | Chomp, crumbs, then the reaction; coins clink | B |
| 15 | Cash register: drop coins in, press keys | Drawer springs open with a cha-ching; keys beep with pitches (it doubles as an instrument) | I |
| 16 | Coffee/cocoa machine: cup under the spout, press | Gurgle, the pour fills the cup, a latte-art heart appears | Z |
| 17 | Sink: drop dirty dishes in, tap the tap | Bubbles, squeaky-clean sparkle, dishes stack on the rack | I |
| 18 | Tip-jar tambourine: shake the tip jar | Coin jingle, a customer does a little dance | I |
| 19 | Decorate the dining room: tablecloth colors (tap to cycle), flower vases, a chalkboard sign, fairy lights | Cloth flaps with a new color; lights twinkle | Z |
| 20 | Ice cream freezer with scoops: stack up to 6 scoops | The tower wobbles more the taller it gets; it never falls unless shaken, then plops on the floor and the dog eats it | I |

**Recipes to discover (examples):** eggs + pan = fried egg. Bread + cheese + pan = grilled cheese. Pasta + tomato + pot = spaghetti. Flour + egg + milk + stirring + pan = pancakes. Flour + sugar + butter + oven = cookies. Strawberry + banana + milk + blender = smoothie. Rice + fish + seaweed (no cooking) = sushi roll. Lettuce + tomato + carrot (chopped) = salad. There is also an unlockable "recipe book" in the Z layer, whose pages fill with a picture as each dish is discovered. Ian sees only pictures.

### 3.2 Theater (rooms: Stage & House, Backstage/Costume Closet, Sound & Light Booth)

| # | Interaction | Delight reaction | Serves |
|---|---|---|---|
| 1 | Curtains: drag the rope or tap the tassel | Heavy velvet swoosh; the audience goes "ooh" and hushes | B |
| 2 | Audience: 3 rows of seated characters (plus any the kids seat). A big "clap" hand button in the booth, or tap an audience member | Applause swells, whistles; throws flowers on the stage at the end | B |
| 3 | Spotlights: 3 lights that can be dragged along a rail; tap to cycle color (white, pink, blue, gold) | Light cone follows, pools on the stage; a character standing in the light strikes a pose | B |
| 4 | Mic recording: tap the big red dot on the stand mic to record (max 20s), tap again to stop | Recording shows a live waveform/level meter bouncing; a "tape" cassette with the recording pops out | Z |
| 5 | Voice filters: drop the tape into one of 6 filter boxes (icons): chipmunk, giant, robot, echo cave, stage reverb, underwater | Plays back transformed; the filter box shakes to the audio level | B |
| 6 | Tapes as props: recordings are objects; give a tape to a character and they "lip-sync" it (mouth opens with the amplitude) | Character sings with a singing face, notes float | Z |
| 7 | Instruments: piano (8 keys, C-major pentatonic plus octave, so it always sounds good), drums (kick/snare/cymbal), xylophone, guitar (strum by swiping across strings), tambourine, maracas | Each hit animates plus a synthesized sound; a character holding an instrument plays along when tapped | B |
| 8 | Costume closet (spawner rack): hats, crowns, wigs, tutu, gowns, animal ears, pirate hat, chef hat, astronaut helmet | Rack slides, hangers jingle; the wearer does a twirl and a proud face | B |
| 9 | **Superhero wardrobe:** capes (6 colors), eye masks, a **web-slinger suit** (red/blue with a generic web pattern, no logo), a spider mask, a lightning emblem suit, a star shield | Put on a cape and the character does a hero pose with a cape flutter and a "ta-da!" fanfare | I |
| 10 | Web-slinger power: a character wearing the web suit, when tapped, shoots a web line to the nearest prop or ceiling hook; drag them and they swing on the web | Thwip sound, pendulum swing, lands with a crouch | I |
| 11 | Flying: a caped character dropped from high doesn't fall; they float down slowly with the cape flapping | Whoosh, swoosh | I |
| 12 | Scenery flats: drag backdrops down from the fly bar (castle, forest, city at night, ocean, space) | Backdrop drops with a thud and a dust puff; ambient sounds change (birds, waves) | Z |
| 13 | Props box: sword (foam), wand, microphone, bouquet, crown, treasure chest | Wand tap = sparkles plus a random color change on the target; chest opens with gold coins | B |
| 14 | Effects booth: fog machine button, confetti cannon, thunder sheet, snow | Fog rolls (a few fading sprites), confetti burst, thunder shakes the screen gently | I |
| 15 | Show programs and a ticket booth: stamp tickets, hand them to the audience | Stamp thunk; audience member gets excited | Z |
| 16 | Bow: drag a character to the stage lip and tap them | They bow; audience applauds; roses fly in | B |
| 17 | Karaoke backing tracks: a jukebox with 5 short synthesized loops (lullaby, pop, march, spooky, dance) as picture buttons | The loop plays; audience sways in time; spotlight pulses | Z |
| 18 | Makeup mirror: face paint stickers (star, heart, whiskers, superhero mask paint) | Mirror bulbs twinkle; character looks in the mirror with a proud face | B |

### 3.3 Construction Site (rooms: Build Yard, Dig Pit, Workshop)

**Building model.** Build pieces are rigid props on a **snap grid of 40 units** inside a build zone. Types are blocks, beams, planks, bricks, windows, doors, roofs, wheels and flags. A piece snaps to grid cells, and support is checked only loosely: an unsupported piece "wobbles" but stays (no collapse, no failure), unless the wrecking ball hits it. A **Build** is a group of pieces. Tapping the **camera** saves a Build as a *structure* entity: a list of piece placements with a generated thumbnail. The map gets a structure on one of its 6 lots, and the kid can also place saved structures in other scenes as a single prop (e.g. a tower at School recess).

| # | Interaction | Delight reaction | Serves |
|---|---|---|---|
| 1 | Stack blocks from the lumber/brick piles (spawners) | Clack sound, each snap has a tiny bounce; the higher the tower, the higher the pitch | I |
| 2 | Hammer: tap a placed piece with the hammer | Bang, sparks, a piece "locks" (gets a nail icon) and won't wobble | I |
| 3 | Crane: drag the hook to grab a piece or character, drag the lever to lift | Cable rattles, cargo sways realistically (tween pendulum) | I |
| 4 | Wrecking ball: pull the ball back and let go | Swing, CRASH, pieces tumble apart with a scatter animation, dust cloud, workers cheer (demolition is a joy, never a loss; the camera saves are separate) | I |
| 5 | Excavator in the Dig Pit: drag the arm through dirt | A dirt mask canvas erases, the bucket fills, dump it into the truck bed | I |
| 6 | Buried treasures: digging reveals bones, fossils, a pirate chest, an old boot, a gem, a toy robot | Ding plus a sparkle; a character holding it shows a surprised face | I |
| 7 | Dump truck: the bed tilts when you tap it | Beeping, dirt slides out in a pile; piles can be patted flat or into a hill | I |
| 8 | Cement mixer: drop sand plus water, tap to spin | Drum rotates, glug, pours out "cement" that makes a new flat platform in the build zone | I |
| 9 | Paint buckets: drag the brush onto a piece | Splat sound; the piece changes color; rainbow bucket gives stripes | B |
| 10 | Hard hats and vests (spawner): put them on any character | Hat tap "tink" sound; character salutes | I |
| 11 | Drill and saw in the Workshop: drop a plank on the saw table | Buzz plus sawdust; the plank splits in 2; the drill makes holes that accept wheels | I |
| 12 | Vehicle builder (Workshop): attach wheels plus a seat to a plank base, it becomes a drivable cart; drag it and it rolls | Wheels spin, "vroom" made by the kid's drag speed | I |
| 13 | Traffic cones and barriers | Cones squeak when tapped, knock over like dominoes | I |
| 14 | Blueprint board: 8 picture blueprints (house, tower, bridge, rocket, castle, doghouse, car, stage) as ghost outlines in the build zone; pieces placed on a ghost cell glow | Completing a blueprint gives a fanfare plus confetti; the build gets its "real" look (e.g. rocket gets flames) | B |
| 15 | Camera: tap to "save this build" | Shutter click, flash, a Polaroid pops out and then flies off-screen toward the map icon with a whoosh | I |
| 16 | Walkie-talkie: tap and hold to talk (mic, live with a robot filter, not saved) | Crackly "over!" beep | I |
| 17 | Lunch break: bench plus lunchboxes (containers that can carry cafe food) | Workers eat with yum faces | B |
| 18 | Seesaw plank on a block: put characters on both ends | Seesaw tips toward the heavier side; a character flung high goes "wheee" | I |

### 3.4 School (rooms: Classroom, Circle Rug & Cubbies, Recess Playground)

School exists so Ian can rehearse kindergarten: morning routine, cubbies, circle time, centers, lunch, recess, pick-up. Zoe can play teacher.

| # | Interaction | Delight reaction | Serves |
|---|---|---|---|
| 1 | Arrival: the school bus drops characters at the door; a backpack on each | Bus doors hiss open, kids wave | I |
| 2 | Cubbies: each cubby has a **picture** label (a character's face photo from the rig, so Ian finds "his" cubby with no reading); hang the backpack, put shoes in | Cubby chimes; the character's face on the label smiles | I |
| 3 | Circle rug: colored squares; drop characters to sit cross-legged | Each colored square plays a note; a full rug plays a little tune | I |
| 4 | Calendar and weather board: drag the sun/cloud/rain/snow icon onto the board | The classroom window changes weather; a rain sound plays, etc. | I |
| 5 | Teacher: tap the teacher and she holds up a picture card (a shape, color, animal or number with dots); a sound says the word aloud (speechSynthesis) | Kids raise hands; tap a kid to answer: kid gives a proud face and "hooray" | B |
| 6 | Alphabet/sight word wall: tap a letter tile and it says its sound plus a word (speechSynthesis) with a picture ("B, ball"); sight words (the, I, a, see, can, go, like, is) glow and speak | Tile bounces; pictured object pops out briefly | I |
| 7 | Easel painting: finger-paint on the easel with 6 paint pots (canvas, saved as an image entity) | Squishy paint sound; painting can be hung on the wall or taken home | B |
| 8 | Blocks center (reuses construction pieces, a small set) | Same clacks; saved builds can come here | I |
| 9 | Show and tell: any carried object dropped on the show-and-tell stool gets a spotlight | Class says "ooooh" and claps | B |
| 10 | Snack/lunch: lunchboxes in cubbies hold anything from the Cafe; milk cartons | Chomp; spilled milk wipes up with a squeak | I |
| 11 | Line leader: a line of footprint spots by the door; drop characters and they line up; tap the leader and they all march in a line to recess | March drum beat; they follow the leader in a conga | I |
| 12 | Recess slide | Whee sound; the character slides down and lands on their bottom with a giggle | I |
| 13 | Swings: drop a character on the swing and tap to push | Swings higher with each push; kid giggles more | I |
| 14 | Sandbox (reuses the dig canvas): dig, build sand castles, bury toys | Scrape sound; a bucket flipped over makes a castle | I |
| 15 | Monkey bars / climbing dome: drag a character across and they hand-over-hand along the bar | Grunt-giggle effort sounds; the "made it!" cheer at the end | I |
| 16 | Feelings chart (cozy corner): drag a character's face icon to one of 5 feelings pictures; the character's face changes to match | Soft chime; a hug sticker if they pick "sad" (no judgment, a comforting reaction) | I |
| 17 | Bathroom pass / hand washing sink | Soap bubbles; sparkly hands | I |
| 18 | Pick-up: grown-up characters arrive at the door at the bell | Kid runs to hug; hearts | I |
| 19 | Zoe as teacher: whiteboard with a marker (free draw) and a stamp pad (star, smiley, check); stamp papers or characters' hands | Stamp thunk; the stamped kid beams | Z |
| 20 | Nap mats: lay characters down; tap the light switch | Room dims; a soft lullaby plays; tiny snores | I |

---

## 4. Reading layers

**Rule:** no core interaction ever needs text. Text is a separate render layer (`.text-layer`) toggled in the parent menu (default **off**, bead mhf.16 ruling: Ian never needs it and a grown-up turns it on once for Zoe; it was first planned as on). Built in P1.16: catalog `label`s show as name tags under things (`src/engine/view.js` `labels`, CSS `body.text-layer`), and a tapped tag is read aloud. Every text element also has an icon or picture equivalent.

**How Ian plays with zero text**
- Navigation: the map uses building pictures and signature sounds, the home icon, the pocket tray tab, and a vehicle for traveling.
- Every "button" is a big pictorial object in the world (a red record dot, a clap hand, a camera, a light switch). The UI has no labeled buttons.
- Requests and goals are **pictures in bubbles** (customer orders, blueprints as ghost outlines, the teacher's picture cards).
- Identity: cubby labels and name tags use each character's *face*. Saved builds show as Polaroids.
- Audio carries meaning: every object has a distinctive sound, and speechSynthesis reads letters, numbers and the teacher's card words aloud (Ian learns, not reads).
- Parent menu is the only text-heavy surface, and it's hidden behind a 2-second press on the top-left corner (the map button in a location, a faint gear on the city map), with a filling ring; a tap, a shorter hold, a hold that moves or a second finger never opens it (`src/ui/parent-menu.js`). Its settings (sound, volume, voice, words) are device-local in localStorage `ourtown.settings` (`src/ui/settings.js`): settings have **no op**, never sync to the other iPad and are not in the world file.

**Optional text for Zoe (the text layer)**
- **Cafe:** menu chalkboard (dish names auto-generated from contents; tap a name to edit it with the iPad keyboard), a cafe name sign (editable), a recipe book whose pages show name, picture and ingredient list for each discovered dish, order tickets with dish names, and the price tag on each dish (editable, so Zoe can "run" the cafe).
- **Theater:** show title on the marquee (editable), a printable-looking program with a cast list (names from name tags), a playlist of recorded tapes with editable titles, and scene cards ("Act 1").
- **Characters:** name tags (editable, with speechSynthesis reading them aloud for Ian when tapped).
- **Construction:** blueprint names, a sign post that the kid can write on (Zoe writes signs for Ian's builds).
- **School:** whiteboard typing (the marker has a keyboard mode), daily schedule strip (pictures plus words), sight-word wall words.
- **Tap-to-hear:** any text element, when tapped, is read aloud via speechSynthesis. This lets Zoe's text help Ian.

---

## 5. Audio plan (fully offline)

| Layer | Source | Notes |
|---|---|---|
| UI and object SFX (taps, pops, boings, clacks, dings, chimes, whooshes) | **Synthesized with WebAudio** at runtime (oscillators plus noise buffers plus envelopes), about 40 recipes in `audio/sfx.js` | Zero bytes; pitch-varied ±5% per play so repeats don't get annoying |
| Instruments (piano, xylophone, drums, guitar pluck) | Synthesized (Karplus-Strong for guitar, FM bell for xylophone, noise plus filter for drums) | Pentatonic scale everywhere so any mash sounds musical |
| Texture sounds that synth can't fake well (sizzle loop, applause, crowd "ooh", truck engine, excavator, rain, kid giggles, dog bark, cheering) | **Bundled clips**, AAC `.m4a` mono 64kbps, about 25 clips, under 1.5MB total, precached | CC0 sources (freesound CC0 / self-recorded); licensing noted in `assets/audio/CREDITS.md` |
| Music loops (5 karaoke tracks, 1 ambient per location) | Synthesized sequences (a tiny step sequencer driving the synth voices) | Tempo-synced; ambient is very quiet |
| Character babble | Synthesized "gibberish voice" (formant-shaped pulses at the character's pitch) | Friendly and non-verbal; each character has a pitch and a timbre |
| Spoken words (letters, card words, text tap-to-hear) | **`speechSynthesis`** with a locally available voice (`localService === true`) | On iOS the voices are on-device and work offline. It must be first triggered inside a user gesture. Pick an en-US voice once and cache the choice. If none is available, fall back to a picture flash plus chime (no crash) |
| Mic recording and filters | `getUserMedia` → `MediaRecorder` (Safari: `audio/mp4`) → decoded to an `AudioBuffer`; filters are WebAudio graphs: chipmunk/giant (`playbackRate` 1.6 / 0.65), robot (ring mod 50Hz plus bitcrush via `WaveShaper`), echo (feedback `DelayNode`), stage reverb (`ConvolverNode` with a generated impulse), underwater (lowpass plus LFO wobble) | Recordings stored as Blobs in IndexedDB **only on this device**; never in the sync op stream (§6.5); max 30 tapes, the oldest untouched ones get auto-removed only with parent-menu consent |

- One global `AudioContext`, created and resumed on the first touch (iOS unlock: call `resume()` from a `pointerup`/`touchend` or `click` handler and retry on later gestures, since iOS also moves the context to `interrupted` after calls or backgrounding). The mute switch (ringer) silences WebAudio on iOS, so the parent menu notes "turn the ringer on".
- Master bus with a compressor (limits loud mashing) and a global volume at about 70%. No sudden loud sounds: every clip is normalized to -16 LUFS and every synth has a ≥5ms attack.
- Mic permission prompt: shown only when the record button is first tapped. If denied, the record dot shows a microphone-with-slash icon, and a tap plays a sample tape instead.

---

## 6. Technical architecture

### 6.1 Platform
- **Static PWA**: `index.html` plus ES modules, `manifest.webmanifest` (`display: standalone`, `orientation: landscape`), icons, `apple-touch-icon`, `apple-mobile-web-app-capable`. iPadOS ignores the manifest `orientation` and Safari has no `screen.orientation.lock()`, so the stage must still letterbox sensibly in portrait.
- **No framework, no bundler, no runtime dependencies.** Plain ES modules, with **Safari 16.0 as the floor** (see CLAUDE.md): no import maps (16.4), no JSON/CSS module imports (`import ... with {type: 'json'}`, 17.2; load `data/*.json` with `fetch()`), no class static blocks (16.4), no CSS nesting (16.5) or `color-mix()` (16.2). `tests/unit/runtime-sources.test.mjs` greps for the common ones. Build tooling is **Python 3 stdlib**, consistent with the prototype: it generates art, the asset manifest and the service worker precache list. Tests run in headless Chrome driven over the DevTools protocol by `tools/harness.mjs` (Node built-ins only, no Playwright); see CLAUDE.md. That engine is Blink, so WebKit-specific behavior still needs a real iPad check.
- **Service worker** (`sw.js`, a classic script, not `type: 'module'`): on install, precaches every file listed in the generated `precache-manifest.json` (versioned by content hash). Fetch strategy is cache-first, falling back to the network only for same-origin files. The update flow: a new SW waits, and activates on the next cold launch (never mid-play). There are no CDN or runtime network calls, and a CI check greps for `http(s)://` in the runtime sources.
- **Min target:** Safari 16.0 / iPadOS 16 on the original iPad Pro (A9X, 2 to 4GB RAM), per CLAUDE.md. Test on that iPad.

### 6.2 Rendering: DOM + CSS transforms (recommended)

**Decision:** render scenes with **DOM elements positioned by `transform: translate3d() scale() rotate()`** inside one scaled stage. Backgrounds are pre-rasterized room art (SVG loaded via `<img>` so it's rasterized once, the proven prototype approach). Use **one `<canvas>` only where pixels change** (dig/sand mask, easel painting, whiteboard).

Reasons, compared with Canvas 2D and PixiJS:
- **Object counts are small** (about 50 to 150 visible entities per room). DOM compositing handles that well on older iPads if we animate only transform and opacity. WebGL's batching advantage matters at thousands of sprites, which we don't have.
- **No per-frame loop.** DOM lets the game be idle at 0% CPU when nothing moves (the prototype's key win for battery on road trips). Canvas/Pixi need a render loop, or careful dirty-rect management, to be equally idle.
- **WebGL context loss** on older iPads (memory pressure when backgrounded) is a real Pixi failure mode. DOM has no such thing.
- **Hit-testing, text and accessibility come free**: the Zoe text layer is real text, editable in place, with the native iPad keyboard.
- **Zero dependency weight**: Pixi v7 is about 450KB minified and would need vendoring and version pinning.
- **Escape hatch:** entities render through a small `View` interface (`mount / update(props) / unmount`). If a scene ever needs Pixi (e.g. a particle-heavy show), that scene can swap its renderer without touching state code.

**Rendering rules (enforced in review):** animate only `transform`/`opacity`. Use `will-change: transform` only while dragging or animating, then remove it. No `filter`, `box-shadow` or `mix-blend-mode` on moving things (shadows are sprites). Keep 1 to 3 composited layers per room (background, entity layer, fx layer). Particle effects are capped at 24 DOM nodes pooled and reused. Tweens use the Web Animations API (`el.animate`), which runs on the compositor. Budget: at most 20ms of input handling per frame during a drag, under 150MB of memory.

### 6.3 Coordinate system
- **World units:** every room has its own coordinate space: `x` from 0 to `room.width` (1440 minimum, up to 2880 for panning rooms), and `y` from 0 to 1000 (0 at the top). Floor band `y` is 700 to 960. Entity positions are stored as `{x, y}` in room units plus `z` (stack order on a surface).
- **Stage scale:** one scale factor `s = min(viewportW / 1440, viewportH / 1000)` is applied to the stage root, and the stage is centered. Room art bleeds 100 units on every side to cover letterboxing on 4:3 vs 1.43:1 iPads. Camera pan is a single `translateX` on the room layer.
- **Screen→world:** `world = (screen - stageOffset) / s + camera`. Only the input module does this conversion.
- **Depth scale:** entities in the floor band scale from 0.92 at the back to 1.08 at the front (a cheap depth cue from the prototype).
- **Map:** the map is its own 1440 x 1000 space; lots and buildings are fixed anchors.

### 6.4 State model (event-sourced, networking-ready)

**World state** is a plain JSON-serializable object:
```js
{
  schema: 1,
  entities: { [id]: Entity },          // characters, props, containers, structures, tapes
  locations: { cafe: { lastRoom, doorBellAt, ... }, ... },
  map: { lots: [structureId|null x6], night: false },
  settings: { textLayer, sound, talk }   // device-local mirror of localStorage ourtown.settings (P1.16); no op, not synced
}
Entity = {
  id,               // "<deviceId>:<counter>" base36, e.g. "k3f9:1a2", stable forever
  kind,             // catalog key: "egg", "char", "block-2x1", "tape", "structure"
  room,             // "cafe/kitchen" | "pocket" | "lostfound" | null if parented
  parent, slot,     // container entity id + slot ("hand-l", "seat-2", "shelf-0")
  x, y, z, rot, flip,
  props: {},        // kind-specific: cooked, cut, color, emotion, outfit, contents...
  rev,              // highest lamport that touched it (change detection)
  deleted,          // true on a tombstone (hard delete); absent otherwise
  v: { field: [lamport, deviceId] }  // per-field version stamps (LWW)
}
```

**Everything is an action.** UI code never mutates state. It calls `dispatch(action)`. Actions are small, intent-level, serializable ops:

| Op | Payload |
|---|---|
| `spawn` | `{id, kind, room, x, y, props}`, or `parent`+`slot` instead of `room` (e.g. a spawner clone straight into a hand) |
| `move` | `{id, room, x, y, z}` (committed on drop only; drag frames are local; clears `parent`/`slot`) |
| `attach` | `{id, parent, slot}` |
| `detach` | `{id, room, x, y, z}` (a drop out of a parent: same fields as `move`; the dispatcher resolves where) |
| `set` | `{id, path: "props.cooked", value}` (`props.<key>` one level deep, or `rot`/`flip`) |
| `inc` | `{id, path: "props.coins", by}` (a counter intent; the sequencer fills in `value`, see below) |
| `combine` | `{ids: [...], resultId, resultKind, room\|parent, x, y, props}` (result and its placement chosen by the dispatching device and included, so replay is deterministic; inputs are deleted) |
| `remove` | `{id, hard?}` (to Lost & Found; `hard: true` is a true delete, for spawner clones returning home) |
| `travel` | `{ids: [...], to: "school/classroom"}` (top-level things; their contents come along) |
| `mapSet` | `{lot, structureId}` and/or `{night}` |

Implementation (P1.3): `src/engine/` `ids.js` (device ids, `<device>:<n>` ids, Lamport clock, stamps), `random.js` (seeded rng, `pick`), `world.js` (state shape, pure reducers, selectors), `ops.js` (arg shapes, envelopes, `validate`), `store.js` (`createStore`: `dispatch`, `receive`, `subscribe`, `load`), `authority.js` (host/guest routing and grab leases).

- **Counters and aggregates use intent ops, never an absolute `set`** (bead oxg.3). A squish count, coins in the tip jar, applause, bites taken, a stack's height: dispatch `inc {id, path, by}`, not `set {value: n + 1}` computed from what this iPad sees. Two kids tapping at once would each write n+1 and last-writer-wins would drop one tap (the two-iPad demo showed exactly that). Whoever sequences the op resolves the intent (`resolveIntent` in `ops.js`): the store in solo play, the **host** in two-iPad play (a guest sends the bare intent and ignores its own guess). Resolving writes the result into `args.value`, so what is logged, broadcast and replayed is a plain LWW write of that value: replay stays idempotent and order-independent, and because the host resolves ops one at a time in its single order, no concurrent increment is lost (`tests/unit/engine-inc.test.mjs`). The reducer adds `by` only for an unresolved intent (a merged peer log). A future peer-to-peer merge without a host would need a real counter CRDT (per-device totals) for these fields; the host model doesn't. The same rule applies to any new aggregate: express the *intent* ("add a coin", "take a bite", "combine these") and let the sequencer compute the result. Plain state (a lamp is on, a look index, a color) stays `set`.
- **Determinism:** any randomness (mystery dish names, customer orders, treasure picks) is resolved *before* dispatch and written into the op. Reducers are pure: `state' = apply(state, op)`.
- **Envelope:** `{op, args, id: "<deviceId>:<seq>", lamport, device, t}`. The Lamport clock ticks on every local op and advances past any op received from elsewhere.
- **Conflict rules:** **last-writer-wins per field**, using `(lamport, deviceId)` ordering. An op applies to a field only if its stamp is newer than `entity.v[field]`, so a replayed or duplicate op (same stamp) changes nothing, including a second `spawn` of an existing id. A hard delete sets a sticky `deleted` flag: the entity becomes an invisible tombstone that is never undeleted, but it still merges later field writes, so every device ends with the same tombstone. An op that arrives before its entity's `spawn` makes an invisible stub that the spawn completes. Rules that depend on other entities are read-time selectors (`locate`, `childrenOf`, `inRoom`), not stored: a child whose parent is gone lies on the floor of the parent's last room, and a parent loop (only possible in a merge without a host) lands in Lost & Found. This makes `apply` commutative and idempotent, which the convergence tests check. Each entity also has `rev`, the highest Lamport value that touched it: views can skip unchanged entities, and it only grows. Tombstone garbage collection happens in persistence compaction (P1.4, see *Tombstone GC* below); tombstones are tiny.
- **Validation:** the store checks the arg shape on every dispatch (a bad shape throws, since it is a bug) and checks meaning (the entity exists, no attach loop, a new id is unused and carries the sender's prefix) before a local op is accepted. Merged logs skip the meaning check, because the reducers are total.
- **Ownership and two iPads (host-authoritative, per the oxg.1 spike):** one iPad hosts and the guest visits its town. `dispatch` hands each local op to a route: solo applies it; a guest sends it to the host as an intent and applies only what the host broadcasts; the host validates, refuses ops on things the other kid is holding (`busy`), re-stamps the op with its own Lamport clock (keeping the op id and author), applies it and broadcasts it. The host's broadcast order is the one order of truth, and no CRDT is needed. Holding works as a lease on the host: a drag start calls `grab(id, device)` (5s TTL, renewed while dragging); the drop that commits (`move`/`attach`/...) or `release` ends it. Holding a container holds its contents. Leases are session-only, never persisted. Characters in a room the other kid is viewing still move freely unless held.
- **Persistence (P1.4, `src/core/persist.js`):** IndexedDB database `ourtown` with stores `meta` (the stable device id), `snapshot` (`{schema, seq, clock: {lamport, counter}, savedAt, state}`), `ops` (envelopes keyed by a local sequence number, the log since the snapshot), `blobs` (tapes, paintings as Blobs keyed by entity id; never inside ops) and `backups` (a snapshot that failed to load, newest 2). Each op the store emits is buffered and written in one transaction 250ms after the first one (Safari 16 has no `requestIdleCallback`). On `visibilitychange` → hidden, `pagehide` and `freeze` it writes a snapshot at once (iOS kills hidden tabs without warning), and every 200 logged ops a flush becomes a snapshot that trims the log in the same transaction. The saved clock matters: the id counter must never go backwards or new ids would repeat, so boot takes the max of the saved clock, the tail and every own-device id in the world. On boot: load and migrate the snapshot (`MIGRATIONS[n]` upgrades schema n to n+1; world files go through the same hook), replay the tail with `applyAll`, create the store. No storage (private mode, open throws or hangs past 4s) means an in-memory adapter: the game plays and forgets. A damaged snapshot is copied to `backups` and the world starts fresh; bad ops in the tail are skipped; a failed write makes the next save a full snapshot. Nothing throws into boot. Export/import is a JSON world file (`{format: 'ourtown-world', version, schema, device, clock, state, blobs: base64}`) shared with `navigator.share({files})` or `<a download>`, and picked with `<input type=file>`; import checks format, file version and schema before touching anything and keeps this iPad's device id and settings. `navigator.storage.persist()` is requested by `src/pwa.js`.
- **Tombstone GC:** compaction drops a tombstone only when (1) nothing kept still points at it: no kept entity has it as an ancestor (`locate` needs a deleted parent's last room to drop orphans in the right place) and no map lot holds it, and (2) its delete is *stable*: every op that could still arrive has already been applied. In solo play and host-authoritative play (the host validates every guest op, so a late op on a forgotten id is refused as `gone`, and a guest takes the host's world whole) (2) always holds, so `compactWorld` runs with `stableLamport = Infinity`. **Once two iPads merge logs peer-to-peer, it no longer does:** a peer that has not yet seen the delete could send a `spawn` or `move` for that id, and without the tombstone it would resurrect the thing (or leave a kind-less stub). Then a tombstone may only be dropped when its delete stamp's Lamport is at or below the minimum Lamport that *every* known peer has acknowledged (a version vector per device; pass that as `stableLamport`), and a peer that has been away longer than that must resync from a full snapshot rather than replay its old log. Blobs of dropped tombstones are deleted in the same transaction.
- **Two-iPad transport (built, bead oxg.2):** `src/net/transport.js` (WebRTC data channel, `iceServers: []`, compact QR pairing code, heartbeat), `src/net/session.js` (host/guest over authority.js: snapshot on join, the guest's own world stashed and its save detached while visiting, leases shared both ways, solo play on a dropped link, re-pair for a fresh snapshot), `src/net/pairing.js` (picture-only pairing screens), started from the parent menu's "Play together" (P1.16) or `?together`. Parent test checklist: `docs/two-ipad-test.md`.
- **Future networking (original notes):** the planned mode is host-authoritative (above). Because every op has a stable id and a clock and the merge is order-independent, an "exchange op logs you haven't seen" peer mode (version vectors per device) would also work. Transport candidates for offline two-iPad play: WebRTC data channel over the local network with a QR-code manual signaling exchange (works with no internet on a hotspot or car Wi-Fi) (Safari has no `BarcodeDetector`, so reading the QR code needs a vendored JS decoder fed from `getUserMedia` frames, or the Camera app opening a link), or the export/import world file for seeding. Blobs sync lazily and only on explicit share. **Phase 1 must include a test that replays two interleaved op logs in different orders and gets identical state** (convergence test), so the model is proven before any network code exists.

### 6.5 Module layout
```
index.html, manifest.webmanifest, sw.js
src/
  core/     persist.js (IndexedDB), catalog.js (data/catalog.json loader, sprites from the art manifest or placeholders),
            behaviors/ (registry.js, builtin.js starter set, runtime.js view hooks + universal tap fallback)
  engine/   store.js (dispatch, subscribe), world.js (state, reducers, selectors), ops.js, ids.js (ids, lamport), random.js,
            authority.js (host/guest, grab leases), stage.js (scale, camera), input.js (pointer → tap/drag/long-press), view.js (entity DOM views),
            surfaces.js, tween.js (WAAPI helpers), fx.js (pooled particles), rig.js (character poses/faces)
  audio/    context.js, sfx.js (synth recipes), clips.js, instruments.js, speech.js, mic.js (record + filters)
  scenes/   map.js, maker.js, cafe/*.js, theater/*.js, construction/*.js, school/*.js
  data/     recipes.json, rooms/*.json
data/       catalog.json (all kinds: art ref, size/anchor, tags, sounds, behaviors + params, label, home; schema in src/core/catalog.js)
assets/     rooms/*.svg, sprites/*.svg (atlas per location), audio/*.m4a
tools/      build.py (art → svg, manifest, precache list), art/ (python sprite/room drawing, palette.py)
tests/      unit (reducers, recipes, convergence), e2e (headless drive of play flows)
```

### 6.6 Asset pipeline

> Superseded: see docs/STYLE.md §9 and docs/rig.md for the shipped art pipeline (all-vector, Node build, WebP layers + live SVG characters).
- **Art direction:** the flat, warm dollhouse style from the prototype, with a brighter, more saturated Toca-like palette. All art is **SVG drawn by Python generators** using palette names (the prototype pattern, re-skinnable in one file). Hand-drawn SVGs are also allowed, dropped into `assets/src/`.
- **Rooms:** one SVG per room, loaded as `<img>` so it rasterizes once. Keep path counts under about 3k per room.
- **Sprites:** grouped per location into SVG sprite sheets (`<symbol>`s) *or* rasterized to 2x PNG atlases by `build.py` if SVG rendering turns out slow on the oldest iPad (measure in Phase 1; the view layer abstracts the sprite source).
- **Catalog-driven:** `data/catalog.json` defines each kind's sprite, hitbox, tags (`food`, `sweet`, `wearable:head`, `buildpiece`), container slots and behavior ids. Adding an item means adding one catalog line plus a sprite.
- **Precache manifest** is generated by `build.py` with content hashes. The budget is under 15MB total, with a first load under 3MB, and each location's assets lazily cached, all during install.

---

## 7. Phased build plan (bead-sized tasks, about a half-day each)

Dependencies are in brackets. IDs are proposed and get mapped to bd ids when filed.

### Phase 1: Engine and hub
| ID | Task | Deps |
|---|---|---|
| P1.1 | Project skeleton: `index.html`, manifest, icons, folder layout, `tools/build.py` stub, local dev server instructions in CLAUDE.md | – |
| P1.2 | Service worker plus generated precache manifest; offline check (load, go offline, reload); update-on-cold-launch | P1.1 |
| P1.3 | Core store: entity model, op envelope, Lamport/ids, pure reducers for all §6.4 ops, per-field LWW; unit tests plus the **two-log convergence test** | P1.1 |
| P1.4 | Persistence: IndexedDB op log plus snapshot compaction, boot replay, blob store, export/import world file | P1.3 |
| P1.5 | Stage and camera: 1440x1000 scaling, letterbox bleed, room panning, screen↔world conversion | P1.1 |
| P1.6 | Input: pointer handling → tap/drag/long-press with 64pt padded hit boxes, drag lift/tilt/shadow, edge auto-pan | P1.5 |
| P1.7 | Entity views plus surfaces: DOM view pool, y-sort, surface snap/fall/bounce, drop-target highlight, WAAPI tween helpers, fx particle pool | P1.5, P1.3 |
| P1.8 | Catalog and behaviors: `catalog.json` schema, behavior registry (`onTap/onDropInto/onCombine`), fallback reaction | P1.7 |
| P1.9 | Containers and spawners: slots and layouts, spill, spawner cloning, entity cap and "go home" | P1.8 |
| P1.10 | Character rig: parts, poses (stand/sit/lie/hold), face emotions, blink, hands hold, wear slots, eat-with-bites | P1.8 |
| P1.11 | Audio core: AudioContext unlock, master bus/compressor, 15 synth SFX, clip loader, speechSynthesis wrapper with offline voice pick | P1.1 |
| P1.12 | Art pipeline: palette, sprite/room SVG generators, build outputs, a starter art set (4 characters, 20 generic props), contact sheet | P1.1 |
| P1.13 | City map hub: buildings, travel transitions, map button, night toggle, lots (empty), Lost & Found | P1.7, P1.12 |
| P1.14 | Carrying: pocket tray, travel op, vehicles as containers, bags | P1.9, P1.13 |
| P1.15 | Character Maker booth plus 12-character starter cast | P1.10, P1.12 |
| P1.16 | Parent menu (2s press): sound, text layer, reset location, export/import; perf harness page (FPS overlay; memory is measured with Safari Web Inspector's Timelines on the device, since Safari has no `performance.memory`) and a first old-iPad perf check. **Done:** `src/ui/` (parent-menu.js, settings.js, perf.js, parent.css), also Voice on/off, Play together (two-iPad pairing without `?together`), Tidy up, version + Update now; `index.html?perf` overlay; numbers and the on-iPad method in `docs/perf.md` | P1.4, P1.13 |

### Phase 2a: Cafe
| ID | Task | Deps |
|---|---|---|
| P2a.1 | Cafe rooms art (kitchen, dining, counter as one panning strip), surfaces, fridge/pantry spawners, 30 ingredients | P1.* |
| P2a.2 | Food state model plus prep: chop, crack eggs, mixing bowl with swirl-stirring and color blend | P2a.1 |
| P2a.3 | Heat: stove (pan/pot, flip, boil, ladle), oven, toaster, blender, coffee machine; doneness 0..3 | P2a.2 |
| P2a.4 | Recipe table (40 dishes) plus Mystery Dish generator; plating, garnish, sauces/spices; unit tests for recipes | P2a.3 |
| P2a.5 | Customers: door bell, walk-in, picture orders, serve/eat/react, coins, register, tip jar, sink | P2a.4, P1.10 |
| P2a.6 | Cafe extras plus Zoe layer: ice cream tower, decor, menu board, cafe name sign, recipe book, prices | P2a.5 |

### Phase 2b: Theater
| ID | Task | Deps |
|---|---|---|
| P2b.1 | Theater rooms art, curtains, audience rows, applause/ooh clips, bows, roses | P1.* |
| P2b.2 | Spotlights on rails with color cones, scenery flats with ambient swaps, effects booth (fog, confetti, thunder, snow) | P2b.1 |
| P2b.3 | Costume closet plus superhero wardrobe (capes, masks, web-slinger suit), wear reactions | P2b.1, P1.10 |
| P2b.4 | Hero powers: web-slinger thwip and swing, cape float/fly | P2b.3 |
| P2b.5 | Mic recording (MediaRecorder, IndexedDB blobs, level meter) plus tape props, permission-denied fallback | P2b.1, P1.4 |
| P2b.6 | Voice filter boxes (6 WebAudio graphs), lip-sync to tape amplitude | P2b.5 |
| P2b.7 | Instruments (piano, drums, xylophone, guitar, tambourine, maracas), karaoke jukebox loops via the step sequencer; Zoe layer (marquee, program, tape titles) | P2b.1, P1.11 |

### Phase 2c: Construction Site
| ID | Task | Deps |
|---|---|---|
| P2c.1 | Site rooms art; build zone grid snapping; lumber/brick spawners; stacking with pitch; hammer lock; wobble | P1.* |
| P2c.2 | Crane (hook, lever, pendulum sway) and wrecking ball (swing, scatter, dust) | P2c.1 |
| P2c.3 | Dig Pit: dirt mask canvas, excavator, buried treasures, dump truck, piles | P2c.1 |
| P2c.4 | Workshop: saw, drill, paint, cement mixer, vehicle builder carts, cones, seesaw | P2c.1 |
| P2c.5 | Blueprints plus camera save → structure entities, thumbnails, map lots, placing structures in other scenes | P2c.1, P1.13 |

### Phase 2d: School
| ID | Task | Deps |
|---|---|---|
| P2d.1 | School rooms art; bus arrival; cubbies with face labels; circle rug notes; line-up and march | P1.* |
| P2d.2 | Teacher picture cards, letter/sight-word wall with speechSynthesis, calendar and weather board, feelings chart | P2d.1, P1.11 |
| P2d.3 | Easel painting and whiteboard (canvas plus blob save, stamps), show-and-tell, lunchboxes, nap mats, sink | P2d.1 |
| P2d.4 | Recess playground: slide, swings, monkey bars, sandbox (reuses the dig canvas), blocks center | P2d.1, P2c.3 |

### Phase 3: Polish, audio, playtest
| ID | Task | Deps |
|---|---|---|
| P3.1 | Sound pass: bundle about 25 CC0 clips, fill every catalog item with a tap sound, loudness normalize, credits | Phase 2 |
| P3.2 | Juice pass: squash/stretch tuning, idle life (look-at, blink variety), background hot spots in every room | Phase 2 |
| P3.3 | Old-iPad perf pass: profile each room, rasterize sprite atlases if needed, trim DOM, memory under 150MB | Phase 2 |
| P3.4 | Zero-text audit: play every flow with the text layer off; fix any flow needing reading | Phase 2 |
| P3.5 | Offline and install hardening: home-screen install, airplane-mode full session, SW update path, storage-eviction resilience (`navigator.storage.persist()`, feature-detected; `navigator.storage.estimate()` needs Safari 17, so don't rely on it) | Phase 2 |
| P3.6 | Playtest kit plus iteration round 1: a parent checklist (what to watch for), then fix the top issues from the Zoe/Ian sessions | P3.1 to P3.5 |
| P3.7 | Stretch spike: two-iPad sync prototype (WebRTC plus QR signaling, op-log exchange) using the existing op model | P1.3, P1.4 |

**Critical path:** P1.1 → P1.3 → P1.5 → P1.7 → P1.8 → P1.9/P1.10 → P1.13 → P1.14 → Phase 2 (the four sub-phases can run in parallel after Phase 1) → Phase 3. Suggested order when working serially: Cafe (Zoe's highest excitement), then Construction (Ian's), then Theater, then School.

**Definition of done for every bead:** runs from the local server in Chrome and Safari (iPad emulation), passes the unit tests, keeps zero network requests, and the bead close note says how it was verified.
