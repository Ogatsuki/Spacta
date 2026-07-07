/**
 * FIXTURE — dead-export 検体の消費者。UsedType だけを import する（DeadType は使わない）。
 */
import type { UsedType } from "./dead-export.types";

export const sample: UsedType = { id: "x" };
