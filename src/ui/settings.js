// Device-local settings (parent menu, P1.16): sound, volume, voice and Zoe's
// text layer. They belong to THIS iPad, never to the shared world: there is
// no op for them (design.md 6.4), they are not in the two-iPad stream and a
// world file does not carry them. The source of truth is localStorage
// (`ourtown.settings`); applySettings() pushes them into the audio module,
// the store's `settings` (read by the character runtime: `talk`) and the
// page (body.text-layer shows the labels, see src/ui/parent.css).
//
//   const s = loadSettings();              // defaults for anything missing or broken
//   saveSettings(Object.assign(s, { sound: false }));
//   applySettings(s, { audio, store, doc });
//
// Pure except applySettings; no DOM access at import time (unit tests).

export const SETTINGS_KEY = 'ourtown.settings';

// Text layer defaults OFF (bead mhf.16 ruling; design.md 4 first said on):
// a 5-year-old never needs it, and Zoe's grown-up can turn it on once.
export const DEFAULT_SETTINGS = Object.freeze({ sound: true, volume: 0.7, voice: true, textLayer: false });

function safeStorage() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}

/** Clean up a stored value: known keys only, right types, volume in 0..1. Pure. */
export function normalizeSettings(raw) {
  const out = Object.assign({}, DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') return out;
  for (const k of ['sound', 'voice', 'textLayer']) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  const v = Number(raw.volume);
  if (raw.volume != null && Number.isFinite(v)) out.volume = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
  return out;
}

/** Read the settings. Never throws (private mode, junk in storage: defaults). */
export function loadSettings(storage = safeStorage()) {
  try {
    return normalizeSettings(JSON.parse((storage && storage.getItem(SETTINGS_KEY)) || 'null'));
  } catch (e) {
    return normalizeSettings(null);
  }
}

/** Save the settings. Returns false where storage is unavailable (they then last this session). */
export function saveSettings(settings, storage = safeStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Push settings into the running app. deps (all optional):
 *   audio: { setMuted(b), setVolume(v), setSpeechOn(b) }
 *   store: its state.settings gets { sound, talk, textLayer } (device-local, no op)
 *   doc:   body.text-layer toggles the text layer
 */
export function applySettings(settings, { audio = null, store = null, doc = null } = {}) {
  const s = normalizeSettings(settings);
  if (audio) {
    if (audio.setVolume) audio.setVolume(s.volume);
    if (audio.setMuted) audio.setMuted(!s.sound);
    if (audio.setSpeechOn) audio.setSpeechOn(s.voice);
  }
  if (store && store.state && store.state.settings) {
    // Device-local and never touched by ops, so a plain write is fine; it
    // is re-applied after a world import or a two-iPad join replaces state.
    Object.assign(store.state.settings, { sound: s.sound, talk: s.voice, textLayer: s.textLayer });
  }
  if (doc && doc.body) doc.body.classList.toggle('text-layer', s.textLayer);
  return s;
}
