// L6 fixture: a presentation file that performs IO and generates non-determinism.
// checkPresentationBehaviour (L9) must reject every marked line below.
import Link from "next/link";
import { useRouter } from "next/navigation"; // L9: imperative navigation belongs in an Effect

export async function BadCard({ id }: { id: string }) { // L9: async
  const res = await fetch("/api/traces"); // L9: await + fetch
  const now = new Date().toISOString(); // L9: non-determinism
  const seed = Math.random(); // L9: non-determinism
  const key = crypto.randomUUID(); // L9: non-determinism
  localStorage.setItem("k", key); // L9: persistence IO
  return (
    <Link href={`/x/${id}`}>
      {now}
      {seed}
      {res.status}
      {String(useRouter)}
    </Link>
  );
}
