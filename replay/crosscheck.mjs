/**
 * The replay cross-check: run the scenarios, record them, rebuild them, and say whether the
 * theorem held.
 *
 *   bun /workspace/spacta/replay/crosscheck.mjs
 *
 * The theorem being checked, as Spacta states it: if `verify` is green, a bug in feature F
 * (1) stays inside F, (2) is reproducible from `(initData, actions[])` alone, and (3) has no
 * hidden inputs. This file checks (2) and (3) directly, (1) partially, and (4) not at all —
 * and says so on every run, green or red.
 *
 * Non-zero exit means an expectation was not met. That is deliberately symmetric: a session
 * that was supposed to replay cleanly and did not is a broken theorem, and a session that was
 * supposed to diverge on the pre-engine loop and did not is a scenario that has stopped
 * reproducing the bug it exists for. Both are findings; neither is fixed by relaxing the check.
 *
 * No dependencies, no test framework. Sessions are written to `livingdoc/replay-sessions/`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertNoStateRecorded, crossCheck, formatDivergence, printNotChecked } from "./harness.mjs";
import { runScenario, SCENARIOS } from "./scenarios.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sessionDir = join(here, "..", "..", "livingdoc", "replay-sessions");

/** engine runs are expected to replay; the loop from before the engine is expected to diverge. */
function expectationFor(scenario, driver) {
  return scenario.expect?.[driver] ?? (driver === "legacy" ? "diverge" : "pass");
}

function writeSession(name, session) {
  const path = join(sessionDir, `${name}.json`);
  // Two keys, in this order, always. Deterministic bytes: nothing in a scenario reads a clock
  // or a random source, so a session file that changes means a run changed.
  writeFileSync(path, `${JSON.stringify({ initData: session.initData, actions: session.actions }, null, 2)}\n`);
  return path;
}

mkdirSync(sessionDir, { recursive: true });

console.log("spacta replay cross-check — is a run rebuildable from (initData, actions[]) alone?\n");
console.log("  live run:  init(initData) → the production path applies update → S_live");
console.log("  replay:    init(initData) → actions.reduce(update)             → S_replay");
console.log("  compared at every intermediate state, not only the last one.\n");

const rows = [];
let violations = 0;
let recordingProblems = 0;
const written = [];

for (const scenario of SCENARIOS) {
  console.log(`${scenario.id}  ${scenario.title}   — aims at ${scenario.aims}`);

  for (const driver of scenario.drivers) {
    const { results } = await runScenario(scenario, driver);
    const expectation = expectationFor(scenario, driver);

    for (const [name, result] of Object.entries(results)) {
      // The session is written first and read back from disk, so the replay starts from the file
      // rather than from the objects the live run was holding. A run that only agreed because
      // both sides shared one array in memory does not agree here.
      const path = writeSession(`${scenario.id}-${driver}-${name}`, result.session);
      written.push(path);
      const session = JSON.parse(readFileSync(path, "utf8"));

      for (const problem of assertNoStateRecorded(session, result.live.final)) {
        recordingProblems += 1;
        console.log(`    RECORDING  ${name}: ${problem}`);
      }

      const verdict = crossCheck({
        init: result.init,
        update: result.update,
        session,
        live: result.live,
        replays: scenario.replays ?? 1,
      });

      const outcome = verdict.ok ? "pass" : "diverge";
      const met = outcome === expectation;
      if (!met) violations += 1;

      const label = verdict.ok
        ? "REPLAYS"
        : `DIVERGED at Action #${verdict.divergence.index} (${verdict.divergence.type})`;
      const note = met
        ? expectation === "diverge"
          ? "as expected — the pre-engine loop cannot be replayed"
          : ""
        : expectation === "diverge"
          ? "UNEXPECTED — this scenario no longer reproduces the bug; rebuild it"
          : "UNEXPECTED — the theorem does not hold for this run";

      console.log(
        `    ${driver.padEnd(7)} ${name.padEnd(16)} ${label.padEnd(46)} ` +
          `${String(verdict.actionCount).padStart(3)} Actions` +
          (verdict.observedCount > 0 ? `, ${verdict.observedCount} renders observed` : "") +
          (verdict.replays > 1 ? `, ${verdict.replays} replays` : "") +
          (note ? `\n        ${note}` : ""),
      );
      if (!verdict.ok) for (const line of formatDivergence(verdict)) console.log(line);

      rows.push({
        id: scenario.id,
        title: scenario.title,
        driver,
        feature: name,
        outcome,
        expectation,
        met,
        index: verdict.divergence?.index ?? null,
        action: verdict.divergence?.type ?? null,
      });
    }
  }
  console.log("");
}

// ───────────────────────── summary ─────────────────────────

console.log("Scenario results\n");
console.log("  #    driver   feature           verdict                        expectation");
for (const row of rows) {
  const verdict =
    row.outcome === "pass" ? "replays" : `diverged at #${row.index} ${row.action}`;
  console.log(
    `  ${row.id.padEnd(4)} ${row.driver.padEnd(8)} ${row.feature.padEnd(17)} ` +
      `${verdict.padEnd(30)} ${row.expectation.padEnd(8)} ${row.met ? "ok" : "NOT MET"}`,
  );
}

console.log(`\n  ${written.length} sessions written to livingdoc/replay-sessions/`);
console.log(
  recordingProblems === 0
    ? "  every session holds initData and the Action list, and no State snapshot"
    : `  ${recordingProblems} recording problem(s) — see above`,
);

printNotChecked();

const failed = violations + recordingProblems;
console.log(
  failed === 0
    ? `\ncross-check: ${rows.length} checks, every expectation met`
    : `\ncross-check: ${failed} expectation(s) NOT met — reported as they are, not adjusted`,
);
process.exit(failed === 0 ? 0 : 1);
