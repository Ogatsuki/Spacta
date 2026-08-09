/**
 * FIXTURE — 段位 T2 の検体（Effect は宣言するが、往復は閉じていない Core）。
 *
 * outcome の case は **両方書いてある**。変更① 以降エンジンが結果を無条件に dispatch し、
 * `update` の網羅性ガードがそれを強制するので、どの機能もここは書かざるを得ない。
 * したがって T2 と T3 を分けるのは case の有無ではなく、**Effect が識別子を運ぶか** である。
 * この検体の Effect は `correlationId` を持たないので、答えが来ても「どの書き込みの答えか」を
 * 名指しできない ＝ 往復が無い。
 *
 * self-test は「これが T3 と報告されない」ことを確認する。livingdoc の `moderation` /
 * `materialrequest` がまさにこの形であり、ここが崩れた瞬間に嘘の緑が戻ってくる。
 * （※ 識別子を持たせて T3 にすることが直し方ではない。往復を必要としない機能に往復を強制
 *   しないことは設計判断であり、段位は「それを口に出す」ためだけに在る。）
 */
import type { Action, Effect, InitData, State } from "./types";

export function init(data: InitData): State {
  return { count: data.initialCount, pending: [], notice: null };
}

export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      const next: State = { ...state, count: state.count + 1 };
      return [next, [{ type: "SAVE", value: String(next.count) }]];
    }
    case "EFFECT_SUCCEEDED":
      // 意図的に何もしない。答えは来ているが、どの書き込みの答えかは言えない。
      return [state, []];
    case "EFFECT_FAILED":
      return [{ ...state, notice: action.message }, []];
    default: {
      const _exhaustive: never = action;
      throw new Error(String(_exhaustive));
    }
  }
}
