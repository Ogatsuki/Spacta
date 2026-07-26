/**
 * Feature-specific types. Do not import from other features (L1).
 */
import { Effect } from "@/shared/types";

// Entry point of read path: World → Source(IO) → InitData → Core.init
export type InitData = {
  now: string; // Non-determinism (time) is injected as a value (L3). Core does not call new Date().
  initialCount: number;
};

export type State = {
  count: number;
  lastTouched: string;
  // correlationIds of writes still in flight. Core owns this, not the Shell.
  // A feature with more than one kind of write needs to remember *what* was done optimistically,
  // not merely that something was: compensation has to undo the right thing. Widen this to a
  // discriminated `{ kind, correlationId, ... }[]` as soon as a second write path appears.
  pending: string[];
  notice: string | null;
};

// Entry point of write path: Shell → Action → Core.update
export type Action =
  | { type: "INCREMENT"; now: string; correlationId: string }
  | { type: "RESET"; now: string }
  // Return path of the write. Core must handle both members: the never guard in update() turns
  // deleting either one into a tsc error, and that is what enforces L3's outbound half.
  | { type: "EFFECT_SUCCEEDED"; correlationId: string; id?: string }
  | { type: "EFFECT_FAILED"; correlationId: string; message: string };

export type { Effect };
