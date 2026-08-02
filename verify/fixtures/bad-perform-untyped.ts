/**
 * FIXTURE（わざと壊した検体）— L4 の第2の終端形の「戻り値型」条件が欠けた形。
 *
 * `default` は無く switch は関数の最後の文だが、**戻り値型の注釈が無い**。TypeScript は
 * 戻り値型を推論し、そこに `undefined` を含めてしまうので、関数が値を返さずに終わることは
 * エラーではなくなる。TS2366 は発火せず、Effect を増やしても沈黙する。
 */
type Effect = { type: "MODERATE"; command: string };

export async function perform(effect: Effect) {
  switch (effect.type) {
    case "MODERATE":
      return { id: effect.command };
  }
}
