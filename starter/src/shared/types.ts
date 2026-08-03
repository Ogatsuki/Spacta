/**
 * Shared types (types.ts) = The only non-isolated shared budget. Keep it small (verify watches line count).
 *
 * What is *not* here is the `Effect` union. Each feature declares its own in
 * `features/<name>/types.ts`, beside the `perform.ts` that carries it out, so one feature's
 * vocabulary never becomes everybody's dependency. What remains is the transport contract every
 * `perform` answers with, and the guard that turns a forgotten Effect into a compile error.
 */

// What a feature's perform hands back on success. Data only — no functions, promises or callbacks.
// This is NOT a fifth membrane vocabulary: it never crosses the membrane on its own. The engine
// turns it into an EFFECT_SUCCEEDED Action, and the Action is what crosses.
export type EffectResult = { id?: string };

// Exhaustiveness guard. Call in switch default so "forgetting to add" becomes a type error when Effect is extended.
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
