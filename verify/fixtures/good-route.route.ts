/**
 * L5 の「正しい検体」(route 版)。
 * route は fetch/永続化などの IO を正当に行う縁。非決定値は source の縁で読み、
 * 集計は core の純関数へ委譲する。境界内で時刻/乱数/id を生成しない
 * → L5 は誤検出しない（await/fetch それ自体は L5 の対象外）。
 */
import { readNow, readId } from "@/src/features/sample/source";
import { summarizeTotal } from "@/src/features/sample/core";

export async function POST(req: Request) {
  const body = await req.json();
  const id = readId(); // 縁で採番（生成は source 側）
  const createdAt = readNow(); // 縁で時刻を読む（注入）
  const total = summarizeTotal(body.items); // 集計は core の純関数
  const saved = await fetch("https://example.test/save", {
    method: "POST",
    body: JSON.stringify({ id, createdAt, total }),
  });
  return Response.json({ ok: saved.ok, id, createdAt, total });
}
