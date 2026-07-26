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
  return { count: data.initialCount, lastTouched: data.now, pending: [], notice: null };
}

export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      // Optimistic: apply the change now, record the write as in flight, and let the answer
      // either confirm it (EFFECT_SUCCEEDED) or undo it (EFFECT_FAILED).
      const next: State = {
        ...state,
        count: state.count + 1,
        lastTouched: action.now,
        pending: [...state.pending, action.correlationId],
      };
      return [
        next,
        [{ type: "SAVE", correlationId: action.correlationId, key: "count", value: String(next.count) }],
      ];
    }
    case "RESET": {
      const next: State = { ...state, count: 0, lastTouched: action.now };
      return [next, [{ type: "LOG", message: "reset" }]];
    }
    case "EFFECT_SUCCEEDED": {
      // The server's answer arrives as data. Anything it assigned (here, action.id) is injected,
      // never generated in Core (L3) — this is where an optimistic placeholder id is replaced.
      const next: State = { ...state, pending: state.pending.filter((c) => c !== action.correlationId) };
      return [next, []];
    }
    case "EFFECT_FAILED": {
      // Compensation. Only a write we actually recorded can be undone, so guard on pending
      // rather than assuming; a late or duplicate answer must not move count twice.
      if (!state.pending.includes(action.correlationId)) return [state, []];
      const next: State = {
        ...state,
        count: state.count - 1,
        pending: state.pending.filter((c) => c !== action.correlationId),
        notice: action.message,
      };
      // Because the failure lives in state, the broken run replays from (state, action) alone.
      return [next, []];
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
