/**
 * FIXTURE（通らなければならない検体）— L4 の第2の終端形。
 *
 * Effect が1メンバの機能ローカル `perform`。`assertNever` は書けない —— TypeScript は
 * 1要素 union を潰すので `const _: never = effect` がコンパイルを通らない。代わりに
 * **`default` を持たない switch を、`undefined` を返せない関数の最後の文として置く**。
 * メンバを増やすと関数が値を返さずに終われるようになり、tsc が TS2366 を出す。
 *
 * 3条件すべてが効いている検体である: default 無し / 関数本体の最後 / 戻り値型が undefined を
 * 含まない。1つでも欠ければ保証は消える —— その3つを bad-perform-*.ts が対で押さえている。
 */
type Effect = { type: "MODERATE"; command: string };

export async function perform(effect: Effect): Promise<{ id?: string } | null> {
  switch (effect.type) {
    case "MODERATE":
      return { id: effect.command };
  }
}
