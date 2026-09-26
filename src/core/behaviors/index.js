// Behaviors (P1.8): the registry, the starter set and the runtime that feeds
// createRoomView's hooks. See registry.js for the behavior API, builtin.js
// for the starter behaviors, runtime.js for the reaction context and the
// universal tap fallback.

export { defineBehavior, getBehavior, behaviorNames, resolveBehaviors, BEHAVIORS } from './registry.js';
export { createBehaviors, LOG_MAX } from './runtime.js';
