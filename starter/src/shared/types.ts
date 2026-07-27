/**
 * Shared types (types.ts) = The only non-isolated shared budget. Keep it small (verify watches line count).
 * Effect is "declaration from Core". Execution is handled only by shared/runEffect.ts (L4).
 */

// A value where Core declares "desired IO". It does not execute (only data crosses the boundary).
// An Effect whose answer must reach Core carries a correlationId: pairing a request with its
// answer is non-determinism too, so the edge mints it and Core receives it as a value (L3).
// A member without one still gets an answer — the engine reports the outcome of every Effect
// it performs — but that answer names no write, so Core can only note that it arrived.
export type Effect =
  | { type: "SAVE"; correlationId: string; key: string; value: string }
  | { type: "LOG"; message: string };

// What runEffect hands back on success. Data only — no functions, promises or callbacks.
// This is NOT a fifth membrane vocabulary: it never crosses the membrane on its own. The Shell
// turns it into an EFFECT_SUCCEEDED Action, and the Action is what crosses.
export type EffectResult = { id?: string };

// Exhaustiveness guard. Call in switch default so "forgetting to add" becomes a type error when Effect is extended.
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
