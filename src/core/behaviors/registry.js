// Behavior registry (docs/design.md 2.2): named, composable reactions that
// catalog kinds list by name with params:
//
//   "behaviors": [ { "use": "toggle", "key": "open", "looks": ["closed", "open"] },
//                  { "use": "container", "accepts": ["sweet"] } ]
//
// A behavior is a plain object registered once under its name:
//
//   defineBehavior('toggle', {
//     params: { key: 'on', ... },          defaults; also the list of allowed param names
//     check(p, {kinds, sounds, kind}),     optional: a problem string for bad params (catalog validation)
//     look(e, p, w),                       optional: a look (art variant) name for the entity's state, or null
//     sprite(e, p, {catalog, look, children}), optional: a whole sprite (a composite, e.g. the Mystery Dish), or null
//     onTap(e, rx, p),                     optional: react; return true if it did something
//     onLongPress(e, rx, p),               optional: same, for a long press
//     accepts(target, item, p),            optional: true if `target` wants drops at all (it becomes a drop target)
//     receive(target, item, rx, p),        optional: 'accept' | 'refuse' | null (not mine) for a drop onto target
//     canDrag(e, p),                       optional: false to pin it (spawners)
//     dragOut(e, rx, p),                   optional: a drag that starts on it pulls out a NEW entity
//                                          instead (spawners): spawn it and return its id, or null
//     layoutKids(parent, kids, lay, p, {sizeOf, box}), optional: adjust the container layout's Map (lay) in place
//                                          (a mixing bowl sinks what is stirred in; P2a.2)
//     verbs: { name(e, rx, p) },           optional: actions other systems call (a character eats: 'bite')
//   });
//
// Every hook gets `p`: the behavior's defaults merged with the kind's
// params. `w` (look) is { state, children() }. `rx` is the reaction context
// built by runtime.js: it plays sounds and animations and dispatches ops,
// and it records what the reaction did so the universal fallback can fill
// in the rest (no dead taps). Hooks must stay synchronous and must change
// the world only through rx (store ops), so every reaction is saved,
// replayed and shared like any other op.
//
// Hooks run in the kind's list order. For a tap, EVERY behavior with onTap
// runs (a mug cycles its look AND bubbles); for a drop, the first behavior
// whose receive answers decides.

export const BEHAVIORS = Object.create(null);

const HOOKS = ['check', 'look', 'sprite', 'onTap', 'onLongPress', 'accepts', 'receive', 'canDrag', 'dragOut', 'layoutKids'];

/** Register a behavior. Throws on a duplicate name or a malformed definition (a bug). */
export function defineBehavior(name, def) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) throw new TypeError('behavior name: ' + name);
  if (BEHAVIORS[name]) throw new Error('behavior already defined: ' + name);
  if (!def || typeof def !== 'object') throw new TypeError(name + ': definition must be an object');
  for (const k of Object.keys(def)) {
    if (k !== 'params' && k !== 'verbs' && k !== 'doc' && !HOOKS.includes(k)) throw new TypeError(name + ': unknown hook ' + k);
    if (HOOKS.includes(k) && typeof def[k] !== 'function') throw new TypeError(name + ': ' + k + ' must be a function');
  }
  const b = Object.freeze(Object.assign({ name, params: {}, verbs: {} }, def));
  BEHAVIORS[name] = b;
  return b;
}

/** A registered behavior, or undefined. */
export const getBehavior = (name) => BEHAVIORS[name];

/** Registered behavior names. */
export const behaviorNames = () => Object.keys(BEHAVIORS);

/**
 * Resolve a kind's behavior list against the registry: [{name, def, p}].
 * Unknown names are skipped (validateCatalog reports them). Pure.
 */
export function resolveBehaviors(list) {
  const out = [];
  for (const b of list || []) {
    const def = BEHAVIORS[b.use];
    if (!def) continue;
    const p = Object.assign({}, def.params);
    for (const k of Object.keys(b)) if (k !== 'use') p[k] = b[k];
    out.push({ name: b.use, def, p });
  }
  return out;
}
