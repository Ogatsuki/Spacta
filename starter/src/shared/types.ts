/**
 * Shared types (types.ts) = The only non-isolated shared budget. Keep it small (verify watches line count).
 *
 * What is *not* here is the `Effect` union, and what is no longer here is the answer type.
 * Each feature declares both in `features/<name>/types.ts`, beside the `perform.ts` that carries
 * them out, so neither one feature's vocabulary nor the shape of its replies becomes everybody's
 * dependency. A shared `EffectResult = { id?: string }` used to live here and taught the wrong
 * lesson: that the only thing a write can be told is a database key.
 *
 * What remains is the guard that turns a forgotten Effect into a compile error.
 */

// Exhaustiveness guard. Call in switch default so "forgetting to add" becomes a type error when Effect is extended.
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
