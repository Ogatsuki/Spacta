#!/usr/bin/env node
/**
 * This repository's cross-check run: the reference application's scenarios, and where to put
 * the recordings.
 *
 *   bun replay/crosscheck.mjs
 *
 * Everything that used to be in this file is now in `./runner.mjs`, which ships as
 * `spacta/replay`. What is left is the two things that were never generic — *which* scenarios,
 * and *where* the sessions land — and the exit code.
 *
 * That is the whole shape of the split, and it is the same one v0.11 applied to Effects: the
 * loop is mechanism and goes in the package; the list changes every time a feature is added, so
 * it belongs to whoever added it.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runCrossCheck } from "./runner.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const { failed } = await runCrossCheck({
  scenarios: SCENARIOS,
  sessionDir: join(here, "..", "..", "livingdoc", "replay-sessions"),
  sessionLabel: "livingdoc/replay-sessions/",
});

process.exit(failed === 0 ? 0 : 1);
