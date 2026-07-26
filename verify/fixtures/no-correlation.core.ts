/**
 * FIXTURE — L3 effect-return: correlationId を一切使わない Core（opt-in の対照群）。
 * この検査は「構築地点に correlationId がある」ことを起点にするので、答えを必要としない
 * Effect しか持たない feature は対象外になる。受け皿の無い types.ts と組んでも違反0であること
 * ＝この検査が opt-in であることを、self-test に実行可能な形で書き残しておく。
 */
import type { Action, Effect, State } from "./types";

export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "RESET":
      return [{ ...state, count: 0, lastTouched: action.now }, [{ type: "LOG", message: "reset" }]];
    default: {
      const _exhaustive: never = action;
      throw new Error(String(_exhaustive));
    }
  }
}
