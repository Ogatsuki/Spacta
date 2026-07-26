/**
 * route.ts = server boundary, same law as page.tsx (L5): do IO here, delegate any
 * aggregation to a pure Core function, and generate no time/random/id of your own.
 *
 * This is the far end of the write path. shared/runEffect.ts POSTs a SAVE Effect here;
 * the `{ id }` returned travels back as an EFFECT_SUCCEEDED Action and Core receives it
 * as injected data (L3).
 *
 * On the id vs L5 — read this before assuming a contradiction. Returning an id is not
 * "generating an id at the boundary". The handler never invents one: the database assigns
 * it and the route only carries it back. What L5 rejects is non-determinism *born* here
 * (`crypto.randomUUID()`, `new Date()`), because such a value exists nowhere else and the
 * run stops being replayable. A DB-assigned id is a fact read from the world, like any
 * other Source value.
 */
export async function POST(req: Request) {
  const { key, value } = (await req.json()) as { key: string; value: string };

  // Real persistence goes here:
  //   const created = await prisma.sample.create({ data: { key, value } });
  //   return Response.json({ id: created.id });
  // `created.id` comes from the DB default (autoincrement / uuid), not from this handler.
  const created = { id: "srv_generated_id", key, value };

  return Response.json({ id: created.id }); // assignment is the DB's; the route only carries it
}
