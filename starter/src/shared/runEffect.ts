/**
 * runEffect = The ONLY place to execute Effect (L4).
 * Async is isolated here. When adding Effect, add a case here.
 * default has assertNever, so forgetting causes a tsc error = silent swallowing doesn't happen.
 *
 * Contract: return data on success, throw on failure. Never swallow an error and never touch
 * state from here — the Shell turns both outcomes into Actions, so Core stays the only writer
 * of state and the run stays replayable from the Action log alone (L3).
 *
 * Note: Manual Effect switch is rejected by verify (L4) inside shell.tsx.
 * Only this file (shared runtime) is allowed to write switch, by operational policy.
 */
import { Effect, EffectResult, assertNever } from "./types";

export async function runEffect(effect: Effect): Promise<EffectResult | null> {
  switch (effect.type) {
    case "SAVE":
      // Real IO goes here:
      //   const res = await fetch("/api/sample", { method: "POST", body: JSON.stringify(effect) });
      //   if (!res.ok) throw new Error(await res.text());
      //   return await res.json();
      // The id is assigned by the server's database, never invented here or in Core (L3/L5).
      return { id: "srv_generated_id" };
    case "LOG":
      console.log(effect.message);
      return null; // An Effect with no correlationId has no answer to carry back.
    default:
      return assertNever(effect);
  }
}
