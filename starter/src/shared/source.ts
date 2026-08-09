/**
 * source = Boundary for performing real IO. Not Core or server page (page.tsx),
 * so outside verify scope (L2/L5) = one of the only places where you can read time/communication.
 * page.tsx calls this function only; page.tsx itself doesn't write new Date() (L5).
 */
export function readNow(): string {
  return new Date().toISOString();
}

// Also place real data fetching here (example). await fetch(...) / prisma, etc. are done at the boundary.
export async function fetchInitialCount(): Promise<number> {
  return 0;
}
