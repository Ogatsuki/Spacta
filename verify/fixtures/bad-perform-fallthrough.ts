/**
 * FIXTURE（わざと壊した検体）— L4 の第2の終端形の「最後の文」条件が欠けた形。
 *
 * `default` は無く戻り値型も undefined を含まないが、**switch の後に `return null` がある**。
 * そのため関数は値を返さずに終われず、tsc の TS2366 は永久に発火しない —— Effect を増やしても
 * 静かに null が返るだけになる。L4 が消そうとしている沈黙そのものなので、拒否されなければ
 * ならない。
 */
type Effect = { type: "MODERATE"; command: string };

export async function perform(effect: Effect): Promise<{ id?: string } | null> {
  switch (effect.type) {
    case "MODERATE":
      return { id: effect.command };
  }
  return null;
}
