/**
 * The transport. HTTP, and nothing about what is being sent.
 *
 * This file used to hold `runEffect` — the single switch every Effect in the application passed
 * through. There is no such switch any more: a feature hands the engine its own `perform`
 * (`features/<name>/perform.ts`) and declares its own Effects beside it. What is left is the
 * part that was never anybody's vocabulary — a POST with a JSON body, and a thrown error on a
 * non-2xx.
 *
 * It stays shared because it is mechanism, not judgement: the line is whether adding a feature
 * changes it, and this does not. Copying it into each feature would be the reinvention the
 * engine exists to prevent.
 *
 * Contract, unchanged: return data on success, throw on failure. Never swallow an error and
 * never touch state from here — the engine turns both outcomes into Actions, so Core stays the
 * only writer of state and the run stays replayable from the Action log alone (L3).
 */
import { EffectResult } from "./types";

export async function post(url: string, payload: unknown): Promise<EffectResult | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Request failed (${res.status})`);
  }
  // Endpoints that assign nothing answer 204 with no body; there is no result to carry.
  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !contentType.includes("application/json")) return null;
  return (await res.json()) as EffectResult;
}
