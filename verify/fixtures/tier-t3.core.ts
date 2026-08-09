/**
 * FIXTURE — 段位 T3 の検体（往復が閉じている Core）。
 *   `InitData` を引数で受け、Effect を組み立て、その Effect は `correlationId` を運び、
 *   `EFFECT_SUCCEEDED` / `EFFECT_FAILED` の両方を case として書いている。
 * self-test は「これが T3 と判定される」ことを確認する。**T2 に落ちたら、判定が往復を
 * 見なくなったということである**（＝最上段が到達不能になり、段位の印字が無意味になる）。
 *
 * 同じ検体を hasShell=false でも判定させる: 同じ Core が T1 になることで、段位が shell の
 * 有無を本当に読んでいることが示される。
 */
import type { Action, Effect, InitData, State } from "./types";

export function init(data: InitData): State {
  return { count: data.initialCount, pending: [], notice: null };
}

export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      const next: State = {
        ...state,
        count: state.count + 1,
        pending: [...state.pending, action.correlationId],
      };
      return [next, [{ type: "SAVE", correlationId: action.correlationId, value: String(next.count) }]];
    }
    case "EFFECT_SUCCEEDED":
      return [{ ...state, pending: state.pending.filter((c) => c !== action.correlationId) }, []];
    case "EFFECT_FAILED":
      return [{ ...state, count: state.count - 1, notice: action.message }, []];
    default: {
      const _exhaustive: never = action;
      throw new Error(String(_exhaustive));
    }
  }
}
