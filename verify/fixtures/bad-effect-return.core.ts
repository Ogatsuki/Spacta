/**
 * FIXTURE（わざと壊した検体）— L3 effect-return 違反（書き込み経路の帰り道が無い）。
 * Core は答えを要求する Effect（correlationId 付き）を組み立てているが、対になる
 * bad-effect-return.types.ts の Action union には受け皿が無い。
 * INCREMENT が correlationId を持つのは「行き」（Shell が採番して渡す）であって帰り道ではない。
 * self-test は「この対を必ず違反として検出する」ことを確認する。
 */
import type { Action, Effect, State } from "./types";

export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      const next: State = { ...state, count: state.count + 1, lastTouched: action.now };
      return [next, [{ type: "SAVE", correlationId: action.correlationId, key: "count", value: String(next.count) }]];
    }
    case "RESET":
      return [{ ...state, count: 0, lastTouched: action.now }, [{ type: "LOG", message: "reset" }]];
    default: {
      const _exhaustive: never = action;
      throw new Error(String(_exhaustive));
    }
  }
}
