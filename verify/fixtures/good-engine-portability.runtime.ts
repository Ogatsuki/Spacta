// The engine as it should be: a queue, a single call site of perform, and no opinion about
// the platform. Node built-ins and same-tree imports are fine — what may not appear is the
// name of a UI runtime.
import type { EffectSource } from "./types";

export function createRuntime<E extends EffectSource>(perform: (e: E) => Promise<void>) {
  const queue: E[] = [];
  return {
    enqueue: (effect: E) => queue.push(effect),
    drain: async () => {
      while (queue.length > 0) await perform(queue.shift()!);
    },
  };
}
