/**
 * server page.tsx = Source(IO)の組み立て口。ここでは値を読むだけにして、
 * 共通枠は layout、表示と配線は shell へ渡す。
 */
import { SampleShell } from "@/features/sample/shell";
import type { InitData } from "@/features/sample/types";
import { fetchInitialCount, readNow } from "@/shared/source";

export default async function Page() {
  // 縁(source)から値を読む。page.tsx 自身は時刻も業務計算も持たない。
  const initData: InitData = { now: readNow(), initialCount: await fetchInitialCount() };
  return <SampleShell initData={initData} />;
}
