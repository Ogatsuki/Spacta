/**
 * L5 の「わざと壊した検体」(route 版)。
 * server 境界(route.ts)で非決定値を直書き生成し、業務集計まで直書きしている
 * → L5 が err(new Date/crypto.randomUUID) と warn(reduce) で拾うべき。
 */
export async function POST(req: Request) {
  const body = await req.json();
  const id = crypto.randomUUID(); // ← 非決定 id を境界で生成（err）
  const createdAt = new Date().toISOString(); // ← 時刻を境界で生成（err）
  const total = body.items.reduce((a: number, b: { n: number }) => a + b.n, 0); // ← 集計の直書き（warn）
  return Response.json({ id, createdAt, total });
}
