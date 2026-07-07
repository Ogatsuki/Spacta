/**
 * source = 本物のIOを行う「縁」。Core でも server page(page.tsx) でもないので
 * verify(L2/L5) の対象外＝ここで時刻・通信を読んでよい唯一の場所のひとつ。
 * page.tsx はこの関数を呼ぶだけにして、page.tsx 自体に new Date() を書かない（L5）。
 */
export function readNow(): string {
  return new Date().toISOString();
}

// 実データ取得もここに置く（例）。await fetch(...) / prisma などは縁で行う。
export async function fetchInitialCount(): Promise<number> {
  return 0;
}
