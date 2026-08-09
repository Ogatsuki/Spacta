// A feature reaching into the data layer. Both forms are planted: the alias and the
// relative path, and the alias one is `import type` on purpose — a type-only import
// vanishes at compile time, so nothing about the running program changes, and that is
// exactly why it went unnoticed. What it costs is that a reader who opens this file is
// sent into shared/source to understand it.
import type { TraceRow } from "@/shared/source/queries";
import { getDb } from "../../shared/source/env";

export type State = { rows: TraceRow[]; db: typeof getDb };
