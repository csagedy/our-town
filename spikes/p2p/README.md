# P2P pair test (spike for dollhouse-game-oxg.1)

This is a one-page test. It checks whether two iPads can share one "world" with no internet.
Each iPad shows a colored square. When one kid drags it, it moves on the other iPad too. Tapping it
changes its color on both. The iPads find each other by scanning a QR code off each other's screens.
No server is involved: no STUN or TURN, and no signaling server. Once the page is loaded, nothing leaves the local Wi-Fi.

See `FINDINGS.md` for the research and the recommendation.

## Files

| File | What it is |
|---|---|
| `index.html` | **The test page.** Built, self-contained, with the QR libraries inlined. |
| `src/app.html` | Source for the page. Edit this, then run `node build.mjs`. |
| `build.mjs` | Inlines `vendor/*.js` into `src/app.html` and writes `index.html`. |
| `sw.js`, `manifest.webmanifest` | Optional. They let the page open offline from the home screen. |
| `vendor/` | qrcode-generator 2.0.4 (MIT) for drawing QR codes and jsQR 1.4.0 (Apache-2.0) for reading them, with their license files. |

## Hosting

The camera and the offline service worker both need HTTPS, so the page has to be served over HTTPS.
The plan is GitHub Pages. Push this folder and open
`https://<user>.github.io/<repo>/spikes/p2p/index.html`. The iPads only need internet the first time
they open the page. After that it is cached.

## What you need

- Two iPads. One is the old iPad Pro on iPadOS 16. The other is the iPad Air on current iPadOS.
- One iPhone with Personal Hotspot.
- About 20 minutes, starting at home with Wi-Fi.

## Test steps

Write down the result of each test as pass or fail. If a test fails, open **Diagnostics** at the
bottom of the page on both iPads, select the text, and AirDrop or paste it back to us.

### 0. Install (at home, on normal Wi-Fi)
1. On **each** iPad, open the URL above in Safari.
2. Tap Share, then **Add to Home Screen**, then Add.
3. Open the new **P2P Test** icon once. Under Diagnostics you should see "service worker registered".

### 1. Baseline on home Wi-Fi (shows that the QR pairing works at all)
1. Put both iPads on the home Wi-Fi and open **P2P Test** from the home screen on both.
2. iPad A taps **Host**. iPad B taps **Join**. Allow the camera on both. This matters: allowing the camera
   is also what lets the iPads connect directly.
3. Hold the two iPads **screen to screen**, about 20 to 30 cm apart. The front camera is used by default.
   If that is awkward, tap **Flip camera** and use the back camera instead.
4. B scans A's code. B then shows its own code, and A scans that one.
5. Pass means: "Connected!" appears in green, and dragging the square on either iPad moves it on the
   other. Also note the "round trip" number, which should be under about 30 ms, and the "path" line at the top.
6. Repeat once with the roles swapped, so the old iPad Pro is the Host.

### 2. iPhone hotspot (the main test)
1. On the iPhone, open Settings, then Personal Hotspot. Turn on **Allow Others to Join** and
   **Maximize Compatibility**.
2. On both iPads, turn off home Wi-Fi and join the iPhone's hotspot.
3. Pair again as in test 1. Check that the "path" line shows addresses like `172.20.10.x`.
4. Pass means the square syncs both ways.

### 3. No cellular signal (simulating the road trip)
Leave the iPads connected and playing from test 2. Then try each of these:
1. On the iPhone, open Settings, then Cellular, and turn **Cellular Data off**. Does the square keep syncing?
   Does the hotspot network stay listed on the iPads?
2. Turn Cellular Data back on and pair again. Now turn on **Airplane Mode** on the iPhone, then turn
   **Wi-Fi back on** in Control Center. Can Personal Hotspot still be turned on? Can the iPads join it?
3. If you can, try it in a real no-signal spot, for example a parking garage or a rural road.

Record exactly what happened. This is the biggest unknown in the whole plan.

### 4. Offline launch
1. Put both iPads in Airplane Mode. Turn Wi-Fi back on and join the hotspot, or any Wi-Fi without internet.
2. Force-quit **P2P Test** and open it from the home screen.
3. Pass means the page opens and the camera works for pairing.

### 5. Sleep and reconnect
1. While connected, lock one iPad for 10 seconds, then unlock it.
2. We expect it to disconnect. Tap **Start over** (inside Diagnostics) on both iPads and pair again.
   Note how long re-pairing takes.

### Optional: travel router
If the hotspot fails test 3, try a small travel router. Any cheap USB-powered one works, and it needs
no internet. Join both iPads to it and repeat test 2.

## Known quirks

- **Camera shows black** in the home-screen app. This is a known WebKit PWA camera bug, and it hits
  iPadOS 16 as well. Force-quit the app and reopen it. If it keeps happening, do the pairing in a normal
  Safari tab instead.
- **The iPad asks for the camera again on every launch** of the home-screen app. This is normal on iOS.
- **If you deny the camera**, the iPads fall back to hidden ".local" addresses. They may still connect,
  but you would have to move the codes with the copy/paste box, for example by AirDropping the text.

## Desktop testing (developers)

Run `node build.mjs`, serve the folder (for example with `python3 -m http.server`), and open it in two tabs.
Tick **No camera**. Host in tab 1 and copy its code. In tab 2, Join, open "Copy/paste instead", and paste it.
Then copy tab 2's code back into tab 1.
