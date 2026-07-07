/**
 * runEffect = Effect を実行する「ただ1つ」の場所（L4）。
 * 非同期はここに隔離される。Effect を増やしたら、ここの case を足す。
 * default の assertNever があるので、足し忘れると tsc が落ちる＝静かな握りつぶしが起きない。
 *
 * 注意: 手書き Effect switch は「shell.tsx の中」では verify(L4)に弾かれる。
 * switch を書いてよいのはこのファイル（共有ランタイム）だけ、という運用に倒している。
 */
import { Effect, assertNever } from "./types";

export async function runEffect(effect: Effect): Promise<void> {
  switch (effect.type) {
    case "SAVE":
      // 例: await fetch(...) / await prisma.x.create(...) などの本物のIOはここで行う
      return;
    case "LOG":
      console.log(effect.message);
      return;
    default:
      return assertNever(effect);
  }
}
