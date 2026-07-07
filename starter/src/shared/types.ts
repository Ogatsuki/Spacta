/**
 * 共有型（types.ts）= 唯一隔離できない共有予算。小さく保つ（verify が行数を見張る）。
 * Effect は「Coreが出す宣言」。実行は shared/runEffect.ts だけが担う（L4）。
 */

// Core が「やってほしいIO」を宣言する値。実行はしない（膜を越えるのはデータだけ）。
export type Effect =
  | { type: "SAVE"; key: string; value: string }
  | { type: "LOG"; message: string };

// 網羅性の番人。switch の default で呼べば、Effect 追加時に「足し忘れ」が型エラーになる。
export function assertNever(x: never): never {
  throw new Error(`未処理のケース: ${JSON.stringify(x)}`);
}
