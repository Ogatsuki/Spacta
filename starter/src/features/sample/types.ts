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
};

// Entry point of write path: Shell → Action → Core.update
export type Action =
  | { type: "INCREMENT"; now: string }
  | { type: "RESET"; now: string };

export type { Effect };
