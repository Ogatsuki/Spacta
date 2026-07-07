/**
 * FIXTURE（わざと壊した検体）— L4 手書き Effect switch + 網羅チェック欠落。
 * effect.type で分岐するが assertNever / : never 終端が無い。
 * ＝ Effect を増やしても「静かに何も起きない」事故が起きる形。
 */
export async function executeEffect(effect: { type: string }) {
  switch (effect.type) {
    case "SAVE":
      return;
    case "DELETE":
      return;
  }
  // α3 を主張するコメントだけあって、never 代入が無い（嘘をつくコメント）
  throw new Error("unhandled");
}
