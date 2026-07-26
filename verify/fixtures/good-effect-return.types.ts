/**
 * FIXTURE — L3 effect-return のクリーンな対照群（bad-effect-return.core.ts と対で使う）。
 * 帰り道が宣言されている: correlationId を運ぶ EFFECT_SUCCEEDED / EFFECT_FAILED があり、
 * どちらも書き込みを要求する Action ではない ＝ 答えの受け皿。
 * self-test は「これを誤検出しない」ことを確認する。
 */
export type State = { count: number; lastTouched: string };

export type Action =
  | { type: "INCREMENT"; now: string; correlationId: string }
  | { type: "RESET"; now: string }
  | { type: "EFFECT_SUCCEEDED"; correlationId: string; id?: string }
  | { type: "EFFECT_FAILED"; correlationId: string; message: string };
