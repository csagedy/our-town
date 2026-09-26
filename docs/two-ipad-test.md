# Two-iPad test: the real app (parent checklist)

This checks two-iPad play in **the real game**, not the spike page. Both iPads share one town with
no internet. Right now the only shared thing is the blue squish buddy: a tap on either iPad squishes
it on both, and both show the same count.

- **URL:** https://csagedy.github.io/our-town/?together
  (`?together` is a hidden switch for now. The parent menu (P1.16) will offer it later.)
- **You need:** the old iPad Pro (iPadOS 16) and the iPad Air, plus the iPhone for its hotspot.
  Allow about 20 minutes, and start at home on Wi-Fi.
- **Write down** pass or fail for each step. If a step fails, note what the screen showed.

How it works: one iPad **hosts**, which means it shows its own town. The other iPad **visits**. The
visiting iPad's own town is put aside and left untouched, and it comes back when that iPad taps
"go home". With `?together` there is a small button in the top-right corner that shows two little
iPads. Tap it to pair.

| Picture | Meaning |
|---|---|
| iPad with a house and a small QR code | **Host**: "come to my town" |
| iPad with a camera eye and an arrow to a house | **Visit**: scan the other iPad |
| House with a green arrow | **Go home**: stop visiting (only shown while visiting) |
| Two iPads tilted toward each other | Hold the iPads face to face |
| Camera with circling arrows | Switch between front and back camera |
| Clipboard | Copy/paste the codes instead of scanning them |
| Two smiling faces with a heart | Connected! |
| Grey sad face with an orange arrow | Didn't work, try again |
| Corner button: green bar between the iPads | Connected. A broken orange bar means the connection dropped |

## 0. Install (at home, on normal Wi-Fi)
1. On **each** iPad, open the URL in Safari. Tap Share, then **Add to Home Screen**. Tap Add.
2. Open the new icon once on each iPad, then close it. This is the first load, which saves the app for offline use.
   Note: a home-screen link opens the page without `?together`. For now, run these tests from a
   **Safari tab** with the URL above. Step 4 checks the home-screen app separately.

## 1. Pair on home Wi-Fi
1. Both iPads are on the home Wi-Fi with the URL open. Tap the buddy on each one a few times.
   Each iPad has its own count.
2. iPad A: tap the corner button, then the **host** picture. Allow the camera. A big QR code appears.
3. iPad B: tap the corner button, then the **visit** picture. Allow the camera.
4. Hold the iPads **screen to screen**, about 20 to 30 cm apart. B reads A's code, then shows its own
   code. A's small camera window reads B's code. If holding them face to face is awkward, tap the
   flip button to use the back camera.
5. **Pass:** the smiling faces with the heart appear on both iPads, then close. The corner button shows a green bar.
   B now shows **A's** buddy and A's count.
6. Tap the buddy on B. A's buddy squishes and the count goes up on both. Now tap it on A. Both
   go up again. Tap quickly on both at once. The counts should end up equal (a tap can occasionally get lost when both tap at the same moment. That's okay).
7. Repeat once with the roles swapped, so the old iPad Pro hosts.

## 2. iPhone hotspot (the road-trip setup)
1. iPhone: Settings, Personal Hotspot, turn on **Allow Others to Join** and **Maximize Compatibility**.
2. Join both iPads to the hotspot, then pair as in step 1. **Pass:** the buddy syncs both ways.
3. On the iPhone, turn Cellular Data off. Does it keep syncing? (This is the big unknown from the spike.)

## 3. The connection drops
1. While paired, **lock the visiting iPad (B)** for 10 seconds. Within about 6 seconds, A's corner button
   loses its green bar, and A keeps playing on its own.
2. Unlock B. B is still in A's town, and its corner button shows the broken orange bar. Tap
   the buddy. It still squishes (B is playing alone on its copy of A's town).
3. Pair again (step 1.2 to 1.5). **Pass:** B shows A's **current** count, including taps A made while apart.
4. Now lock the **host** (A) instead, and check the same things from B's side.

## 4. Go home, and the visiting iPad's own town is safe
1. On B, while visiting: tap the corner button, then the **go home** picture.
2. **Pass:** B shows its own buddy again, with the count it had before step 1.
3. Force-quit Safari on B **while it is visiting**, then reopen the URL. **Pass:** B opens in its own
   town with its own count. The visit never changes the visiting iPad's saved town.
4. Airplane Mode on both iPads, Wi-Fi back on (on the hotspot). Open the app from the home-screen
   icon. **Pass:** it opens offline.

## Known quirks
- **Camera shows black** in the home-screen app. This is a WebKit bug. Force-quit and reopen, or use a Safari tab.
- **You deny the camera:** the camera-with-slash picture shows up and the clipboard box opens. The iPads
  may still connect if you copy the codes across, for example by AirDropping the text. Without camera
  permission Safari hides the iPad's real address, so the connection is less reliable.
- **Taps land on both iPads at the same moment:** one tap can be lost. The count stays equal on both.

- **Theater tapes:** a song recorded on one iPad shows up on the other as a tape with a small cloud on it.
  That is on purpose: the voice itself never leaves the iPad that recorded it. On the other iPad the tape
  sings a built-in "la la la" tune in the same rhythm, and the characters still mouth along.

## Developer notes
- **Code:** `src/net/transport.js` (compact SDP code, data-channel link with heartbeat and chunking),
  `src/net/session.js` (host/guest, snapshot on join, stash and restore, leases), `src/net/pairing.js`
  (the picture screens), `src/net/together.js` (wiring, only with `?together`). QR libraries:
  `assets/vendor/` (qrcode-generator 2.0.4 MIT, jsQR 1.4.0 Apache-2.0, with their licenses).
- **Desktop:** open `http://127.0.0.1:8124/?together` in two Chrome windows with different profiles
  (or two browsers). Host in one and Visit in the other, then use the clipboard box to swap codes.
  Chrome, like Safari, hides local addresses behind `.local` names unless the page has camera
  permission, and two Chromes may not resolve each other's names. So allow the camera, or see how
  `tests/e2e/together.test.mjs` grants it.
- **Tests:** `node --test tests/unit/net-*.test.mjs` and `node --test tests/e2e/together.test.mjs`.
