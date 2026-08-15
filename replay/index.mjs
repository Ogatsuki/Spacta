/**
 * `spacta/replay` — the behavioural gate, minus the part that is about your application.
 *
 * `verify` reads structure. It says so on every run: *semantic correctness — never checked*.
 * Until now, closing that gap meant reading the reference application's `replay/` directory and
 * rebuilding it by hand, because the scenarios in it import that application by relative path
 * and could not be published. What was published instead was a sentence saying the gap existed.
 *
 * This is the half that was never about any application. You supply the scenarios; it supplies
 * the run, the recording, the replay and the comparison.
 *
 * ── What it checks ────────────────────────────────────────────────────────────────────────
 *
 * The theorem Spacta claims: if `verify` is green, a bug in feature F (1) stays inside F, (2) is
 * reproducible from `(initData, actions[])` alone, and (3) has no hidden inputs.
 *
 * `runCrossCheck` drives a live run through the real engine and the real `core.ts`, records the
 * Actions, writes them to disk, reads them back, folds `update` over them, and compares **every
 * intermediate state** — not just the last one, because a run that diverges in the middle and
 * converges by the end is exactly the bug worth catching. It checks (2) and (3) directly, (1)
 * partially, and (4) not at all, and prints that list on every run.
 *
 * ── What it does not check ────────────────────────────────────────────────────────────────
 *
 * A cross-check compares a run against its own replay, so **a feature that is wrong but
 * deterministic passes**. That is not a limitation to work around; it is what the tool is. To
 * catch a wrong answer you have to assert the answer — drive the feature and check the state it
 * reaches, the way `runtime.serialization.test.mjs` does in this project's own repository.
 * Both are needed, and neither substitutes for the other.
 *
 * ── Using it ──────────────────────────────────────────────────────────────────────────────
 *
 *   import { runCrossCheck } from "spacta/replay";
 *   import * as cart from "../src/features/cart/core.ts";   // needs a TS-capable runtime
 *
 *   const { failed } = await runCrossCheck({
 *     sessionDir: "replay-sessions",
 *     scenarios: [{
 *       id: "S1",
 *       title: "add to cart, server rejects it",
 *       aims: "(2)",
 *       drivers: ["engine"],
 *       features: () => ({ cart: { init: cart.init, update: cart.update, initData: SEED } }),
 *       async script(d, io) {
 *         d.cart.dispatch({ type: "ADD", sku: "x", correlationId: "c1" });
 *         await io.settleAll({ outcome: () => ({ fail: "Request failed (500)" }) });
 *       },
 *     }],
 *   });
 *   process.exit(failed === 0 ? 0 : 1);
 *
 * `io` is the stub every Effect goes through: `settleAll({ outcome })` answers the ones in
 * flight — `{ data }` for an answer, `{ fail }` for a rejection, nothing for a bare success —
 * and `settleAll({ order: "reverse" })` settles them out of order, which is how you reproduce
 * two overlapping writes landing backwards.
 *
 * A scenario may also name `drivers: ["engine", "legacy"]`. `legacy` is the hand-written shell
 * loop as it stood before the engine existed, kept alive on purpose: a scenario that passes on
 * *both* is not reproducing the bug it exists for, and is reported as an unmet expectation
 * rather than a pass.
 *
 * Note that scenarios import your `core.ts` directly, so this runs under bun, Deno, or Node with
 * type stripping — not under a plain older Node.
 */
export { crossCheck, deepEqual, diffStates, formatDivergence, assertNoStateRecorded, NOT_CHECKED, printNotChecked } from "./harness.mjs";
export { createIO, DRIVERS, engineRun, legacyRun } from "./drivers.mjs";
export { runCrossCheck, runScenario } from "./runner.mjs";
