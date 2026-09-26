// Audio facade: one AudioContext (unlocked on the first tap), synth SFX,
// bundled clips and spoken words, all behind a tiny API.
//
//   import { initAudio, sfx, speech, clips, setMuted } from './audio/index.js';
//   initAudio();                        // once at boot: installs the unlock listeners
//   sfx.play('boing', { pitch: 1.2 });  // see sfx.js for the sound list and options
//   speech.say('cat');                  // resolves false (and chimes) if no voice
//   setMuted(true);                     // settings.sound = false
//   setVolume(0.5);                     // master volume 0..1 (parent menu)
//   setSpeechOn(false);                 // settings.voice = false: say() stays quiet
//
// Nothing here touches the DOM or creates an AudioContext at import time.

import { createAudioCore } from './context.js';
import { createSfx } from './sfx.js';
import { createClips } from './clips.js';
import { createSpeech } from './speech.js';

export const audio = createAudioCore();
export const sfx = createSfx(audio);
export const clips = createClips(audio);
let speechOn = true;
export const speech = createSpeech({
  isMuted: () => audio.isMuted() || !speechOn,
  // No voice: the caller flashes a picture; we add a friendly chime.
  onUnavailable: () => sfx.play('chime', { gain: 0.8 }),
});
audio.onGesture(() => speech.prime());

export function initAudio() { audio.install(); }
/** Create the (suspended) AudioContext now, outside a gesture: see context.js prepare(). */
export function prepareAudio() { return audio.prepare(); }
export function setMuted(m) {
  audio.setMuted(m);
  if (m) speech.cancel();
}
export const isMuted = () => audio.isMuted();
export function setVolume(v) { audio.setVolume(v); }
export const getVolume = () => audio.getVolume();
/** Voice (speechSynthesis) on/off, independent of the sound effects. */
export function setSpeechOn(on) {
  speechOn = !!on;
  if (!speechOn) speech.cancel();
}
export const isSpeechOn = () => speechOn;
export const audioState = () => audio.state();
