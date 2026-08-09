// A feature that names only shapes, never where they came from. The read models live in
// shared/ rather than shared/source/ precisely so this import does not point at the data
// layer, and `sourceLabel` shows the word "source" is not what the check reads — the module
// specifier is.
import type { TraceWithPage, Viewer } from "@/shared/readmodels";

export type InitData = { viewer: Viewer; items: TraceWithPage[] };
export const sourceLabel = "loaded from shared/source at the server boundary";
