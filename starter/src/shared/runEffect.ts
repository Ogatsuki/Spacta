/**
 * runEffect = The ONLY place to execute Effect (L4).
 * Async is isolated here. When adding Effect, add a case here.
 * default has assertNever, so forgetting causes a tsc error = silent swallowing doesn't happen.
 *
 * Note: Manual Effect switch is rejected by verify (L4) inside shell.tsx.
 * Only this file (shared runtime) is allowed to write switch, by operational policy.
 */
import { Effect, assertNever } from "./types";

export async function runEffect(effect: Effect): Promise<void> {
  switch (effect.type) {
    case "SAVE":
      // Example: Real IO like await fetch(...) / await prisma.x.create(...) is done here
      return;
    case "LOG":
      console.log(effect.message);
      return;
    default:
      return assertNever(effect);
  }
}
