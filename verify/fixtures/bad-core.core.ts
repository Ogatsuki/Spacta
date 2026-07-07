/**
 * FIXTURE（わざと壊した検体）— L2 Core純度 違反。
 * verify の self-test(L6) は、このファイルを core-purity チェッカにかけ
 * 「違反として検出される」ことを確認する。検出できなければ検証器が壊れている。
 */
import { prisma } from "@/lib/prisma";

export async function update(state: unknown): Promise<unknown> {
  const today = new Date();              // ← L2 違反: new Date
  const seed = Date.now();               // ← L2 違反: Date.now
  const r = Math.random();               // ← L2 違反: Math.random
  const rows = await prisma.log.findMany(); // ← L2 違反: await / prisma import
  const res = await fetch("/api/x");     // ← L2 違反: fetch
  return { state, today, seed, r, rows, res };
}
