/**
 * This feature's IO — the one place a SAVE becomes an HTTP request.
 *
 * It lives inside the feature, not in a shared file, because an Effect vocabulary belongs to
 * whoever declares it: a new member goes in `./types.ts` and a new case goes here, and neither
 * edit leaves this directory. What stays shared is `shared/runEffect.ts`, which knows how to
 * POST and nothing about what is being posted — mechanism, not vocabulary. The test is whether
 * adding a feature changes it, and `post` does not.
 *
 * Do not call this yourself. The engine in the `spacta` package is its only caller, and it turns
 * every outcome into an Action — success, failure, and the answer to an Effect that asked for
 * nothing. That is what makes the round trip something built rather than something to remember.
 *
 * Contract: return data on success, throw on failure. Never swallow an error and never touch
 * state from here — Core stays the only writer of state, so the run replays from the Action log
 * alone (L3).
 */
import { post } from "@/shared/runEffect";
import { assertNever } from "@/shared/types";
import type { Answer, Effect } from "./types";

export async function perform(effect: Effect): Promise<{ data?: Answer } | null> {
  switch (effect.type) {
    case "SAVE": {
      // The id that comes back is assigned by the server's database, never invented here and
      // never in Core (L3/L5). It rides to Core as `data` on an EFFECT_SUCCEEDED Action —
      // the same channel a read would use for its rows, because there is only one.
      const answer = await post<Answer>("/api/sample", { key: effect.key, value: effect.value });
      return answer && { data: answer };
    }
    case "LOG":
      console.log(effect.message);
      return null; // An Effect with no correlationId has no answer to carry back.
    default:
      // Exhaustiveness (L4): adding a member without a case here is a tsc error, not silence.
      // This feature declares two Effects, so the union survives and `never` is writable. A
      // feature with a single Effect cannot write this — TypeScript collapses a one-element
      // union — and uses L4's second form instead: a switch with no `default` placed as the
      // last statement of a function whose return type excludes `undefined`, so a new member
      // reports TS2366. See SPACTA.md L4.
      return assertNever(effect);
  }
}
