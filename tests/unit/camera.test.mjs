import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, releaseVelocity, MIN_FLING } from '../../src/engine/camera.js';

/** A camera with a fake frame clock: frames only run when the test steps them. */
function fakeCamera(max = 1440, scale = 0.5) {
  const queue = [];
  const moves = [];
  let settles = 0;
  const cam = createCamera({
    onMove: (x) => moves.push(x),
    onSettle: () => settles++,
    raf: (fn) => { queue.push(fn); return queue.length; },
    cancelRaf: () => { queue.length = 0; },
  });
  cam.setRange(max);
  cam.scale = scale;
  let t = 0;
  const frames = (n, dt = 16) => {
    for (let i = 0; i < n && queue.length; i++) { t += dt; queue.shift()(t); }
  };
  return { cam, queue, moves, frames, settles: () => settles };
}

test('drag tracks the finger 1:1 in screen px (divided by scale) and clamps at both edges', () => {
  const { cam } = fakeCamera(1440, 0.5);
  cam.beginDrag(500, 0);
  cam.dragTo(400, 16);                 // finger left 100px = 200 units right
  assert.equal(cam.x, 200);
  cam.dragTo(800, 32);                 // past the left edge
  assert.equal(cam.x, 0);
  cam.dragTo(-5000, 48);               // past the right edge
  assert.equal(cam.x, 1440);
  cam.cancelDrag();
});

test('release velocity uses the last 100ms, and a resting finger does not fling', () => {
  const s = [{ t: 0, x: 0 }, { t: 100, x: 0 }, { t: 150, x: 50 }, { t: 200, x: 100 }];
  assert.equal(releaseVelocity(s, 200), 1);
  assert.equal(releaseVelocity(s, 400), 0);       // held still 200ms before lifting
  assert.equal(releaseVelocity([{ t: 0, x: 0 }], 0), 0);
});

test('a flick flings with decaying momentum, then stops the frame loop', () => {
  const { cam, queue, frames, settles } = fakeCamera(1440, 1);
  cam.beginDrag(1000, 0);
  for (let i = 1; i <= 5; i++) cam.dragTo(1000 - i * 16, i * 16);   // 1 unit/ms
  const released = cam.x;
  cam.endDrag(80);
  assert.equal(cam.moving, true);
  assert.equal(queue.length, 1, 'one frame scheduled');
  frames(200);
  assert.equal(cam.moving, false);
  assert.equal(queue.length, 0, 'no frame loop once settled');
  assert.equal(settles(), 1);
  // Distance ~ v * tau = 325 units for v = 1 unit/ms.
  assert.ok(cam.x - released > 250 && cam.x - released < 330, `flung ${cam.x - released}`);
});

test('a slow release does not fling', () => {
  const { cam, queue } = fakeCamera();
  cam.beginDrag(1000, 0);
  cam.dragTo(999, 100);
  cam.endDrag(110);
  assert.ok(1 / 100 < MIN_FLING, "released at 0.01 units/ms");
  assert.equal(cam.moving, false);
  assert.equal(queue.length, 0);
});

test('a fling stops dead at the edge, and a new touch catches a fling', () => {
  const { cam, frames } = fakeCamera(100, 1);
  cam.beginDrag(1000, 0);
  for (let i = 1; i <= 5; i++) cam.dragTo(1000 - i * 32, i * 16); // 2 units/ms
  cam.endDrag(80);
  frames(100);
  assert.equal(cam.x, 100);
  assert.equal(cam.moving, false);

  const b = fakeCamera(1440, 1);
  b.cam.beginDrag(1000, 0);
  for (let i = 1; i <= 5; i++) b.cam.dragTo(1000 - i * 16, i * 16);
  b.cam.endDrag(80);
  b.frames(3);
  b.cam.beginDrag(500, 200);
  assert.equal(b.cam.moving, false);
  const x = b.cam.x;
  b.frames(10);
  assert.equal(b.cam.x, x, 'caught: no more motion');
});

test('a room that does not pan never moves or schedules frames', () => {
  const { cam, queue, moves } = fakeCamera(0, 1);
  cam.beginDrag(1000, 0);
  for (let i = 1; i <= 5; i++) cam.dragTo(1000 - i * 50, i * 16);
  cam.endDrag(80);
  assert.equal(cam.x, 0);
  assert.equal(queue.length, 0);
  assert.deepEqual(moves, []);
});

test('panTo animates to a clamped target, panBy returns the applied delta, setRange clamps', () => {
  const { cam, frames } = fakeCamera(1440, 1);
  cam.panTo(5000, { duration: 300 });
  frames(40);
  assert.equal(cam.x, 1440);
  assert.equal(cam.moving, false);
  assert.equal(cam.panBy(-40), -40);
  assert.equal(cam.panBy(1000), 40);
  cam.setRange(600);
  assert.equal(cam.x, 600);
  cam.panTo(10);
  assert.equal(cam.x, 10);
});

// ---- camera stops (P2a.1: the cafe strip snaps to its zones) ----
import { snapTarget, snapDuration, SNAP_MIN_MS, SNAP_MAX_MS } from '../../src/engine/camera.js';

test('snapTarget: the stop nearest the free-fling rest point, never behind the fling', () => {
  const stops = [0, 900, 1440];
  assert.equal(snapTarget(100, 1, stops, 1440), 900);     // rest at 425: 900 is the only stop ahead nearer than 1440
  assert.equal(snapTarget(1000, 2, stops, 1440), 1440);
  assert.equal(snapTarget(1000, -0.3, stops, 1440), 900);  // weak fling back: rest at ~902
  assert.equal(snapTarget(1000, -3, stops, 1440), 0);      // strong fling back: rest well past 0
  assert.equal(snapTarget(905, 0.06, stops, 1440), 1440, 'the stop just behind (900) is not a target');
  assert.equal(snapTarget(1440, 1, stops, 1440), 1440, 'at the edge: stays');
  assert.equal(snapTarget(500, 1, [], 1440), null, 'no stops: free fling');
  assert.equal(snapTarget(500, 1, [2000], 1440), 1440, 'stops are clamped into range');
});

test('snapDuration starts the ease-out at the release speed, within bounds', () => {
  assert.equal(snapDuration(0, 900, 3), 900);
  assert.equal(snapDuration(0, 300, 3), 300);
  assert.equal(snapDuration(0, 10, 3), SNAP_MIN_MS);
  assert.equal(snapDuration(0, 5000, 1), SNAP_MAX_MS);
});

test('a fling eases into a camera stop and settles there; a slow release stays put; a touch catches the snap', () => {
  const { cam, frames, settles, queue } = fakeCamera(1440, 1);
  cam.setStops([0, 900, 1440]);
  // Fling right (camera x grows): finger moves left fast.
  cam.beginDrag(1000, 0);
  cam.dragTo(900, 50);
  cam.dragTo(800, 100);                // camera 200, velocity 2 units/ms
  cam.endDrag(100);
  assert.ok(cam.moving);
  frames(200);
  assert.equal(cam.x, 900, 'rest ~850 -> the 900 stop');
  assert.equal(cam.moving, false);
  assert.equal(queue.length, 0, 'no frame loop once settled');
  assert.ok(settles() >= 1);
  // Slow release: no fling, no snap.
  cam.beginDrag(500, 1000);
  cam.dragTo(470, 1100);
  cam.endDrag(1300);                   // finger rested 200 ms
  assert.equal(cam.x, 930);
  assert.equal(cam.moving, false);
  // A new touch during a snap stops it where it is.
  cam.beginDrag(500, 2000);
  cam.dragTo(300, 2050);
  cam.dragTo(100, 2100);               // velocity 4: toward 1440
  cam.endDrag(2100);
  frames(3);
  const mid = cam.x;
  assert.ok(mid > 1330 && mid < 1440, `mid-snap ${mid}`);
  cam.beginDrag(100, 2200);
  assert.equal(cam.moving, false);
  frames(5);
  assert.equal(cam.x, mid, 'the finger holds it');
  cam.cancelDrag();
});
