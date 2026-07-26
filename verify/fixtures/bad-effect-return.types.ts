/**
 * FIXTURE（わざと壊した検体）— L3 effect-return 違反の対になる types.ts。
 * correlationId を持つメンバは INCREMENT だけ ＝ 書き込みを「要求する」側であり、
 * runEffect の結末を受け取る Action（EFFECT_SUCCEEDED / EFFECT_FAILED）が存在しない。
 * ＝ 部分的採用。行きだけ整えて帰り道が無い状態を、検証器は必ず弾かなければならない。
 */
export type State = { count: number; lastTouched: string };

export type Action =
  | { type: "INCREMENT"; now: string; correlationId: string }
  | { type: "RESET"; now: string };
