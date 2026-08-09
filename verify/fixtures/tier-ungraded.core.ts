/**
 * FIXTURE — 段位が読めない検体（T? の対照群）。
 *
 * Effect も識別子も outcome の case も揃っているのに、**`*InitData` 型の引数を取る関数が
 * どこにも無い** ＝ 梯子の1段目（L3 の inbound）が読めない。このとき判定は段位を
 * でっち上げず、`T?` と理由を印字する。
 *
 * これは L3 が踏んだ穴と同型である —— `flattenActionUnion` は解決できない型参照に出会うと
 * `{unknown:true}` を返し、`checkEffectReturn` はそこで空配列を返した。結果、L3 は静かに
 * 空虚になりながら N ファイル走査の緑を印字し続けた。**読めなかったことは、見える形で
 * 出なければならない。** self-test はその1行が出ることを確認する。
 */
import type { Action, Effect, State } from "./types";

export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      const next: State = { ...state, count: state.count + 1 };
      return [next, [{ type: "SAVE", correlationId: action.correlationId, value: String(next.count) }]];
    }
    case "EFFECT_SUCCEEDED":
      return [state, []];
    case "EFFECT_FAILED":
      return [{ ...state, notice: action.message }, []];
    default: {
      const _exhaustive: never = action;
      throw new Error(String(_exhaustive));
    }
  }
}
