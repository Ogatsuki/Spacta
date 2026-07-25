/**
 * Shared types (types.ts) = The only non-isolated shared budget. Keep it small (verify watches line count).
 * Effect is "declaration from Core". Execution is handled only by shared/runEffect.ts (L4).
 */

// A value where Core declares "desired IO". It does not execute (only data crosses the boundary).
export type Effect =
  | { type: "SAVE"; key: string; value: string }
  | { type: "LOG"; message: string };

// Exhaustiveness guard. Call in switch default so "forgetting to add" becomes a type error when Effect is extended.
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
