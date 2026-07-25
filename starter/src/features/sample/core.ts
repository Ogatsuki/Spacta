/**
 * core.ts = Pure computation only (L2). verify checks AST to reject IO mixing.
 *   - Cannot write new Date()/Date.now()/Math.random()/fetch/await/async/prisma, etc.
 *   - If you need time/random/id, receive them as arguments from InitData/Action, not generated (L3).
 *
 * State machine of (state, action) => [state, effect[]]. No async here.
 * The same pure function can be called from Shell or server page (SSR).
 */
import { InitData, State, Action, Effect } from "./types";

export function init(data: InitData): State {
  return { count: data.initialCount, lastTouched: data.now };
}

export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      const next: State = { count: state.count + 1, lastTouched: action.now };
      return [next, [{ type: "SAVE", key: "count", value: String(next.count) }]];
    }
    case "RESET": {
      const next: State = { count: 0, lastTouched: action.now };
      return [next, [{ type: "LOG", message: "reset" }]];
    }
    default: {
      // Exhaustiveness guard: TypeScript will error here if you add new Action types.
      const _exhaustive: never = action;
      throw new Error(String(_exhaustive));
    }
  }
}

// Pure function for aggregation usable in SSR (L5: server page calls this only).
export function summarize(state: State): string {
  return `count=${state.count} (at ${state.lastTouched})`;
}
