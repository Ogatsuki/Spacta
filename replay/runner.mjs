/**
 * The cross-check, with the scenarios taken out of it.
 *
 * This file used to be the top half of `crosscheck.mjs`, which imported one hardcoded scenario
 * list and wrote sessions to one hardcoded directory. Nothing in the loop was ever about which
 * application it was running — it takes a scenario, drives it, writes the session, reads it back
 * off disk, folds `update` over the recorded Actions, and compares. That is mechanism.
 *
 * The scenarios are not. Which sequence of Actions is worth recording is a judgement about a
 * feature — SPACTA.md's own criterion applies: *does it change when you add a feature?* The
 * scenario list does; this loop does not. So the loop ships (`spacta/replay`) and the list stays
 * with whoever wrote the features.
 *
 * That split is the whole reason this file exists. Before it, an adopter who installed Spacta
 * got a verifier and no way at all to check behaviour — and `verify` says on every run that it
 * never checks semantic correctness. The advice in that situation was prose: "write your own
 * harness". Prose that could be code is exactly what this project objects to everywhere else.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assertNoStateRecorded, crossCheck, formatDivergence, printNotChecked } from "./harness.mjs";
import { createIO, DRIVERS } from "./drivers.mjs";

/**
 * Perform the live run of one scenario against one driver, and hand back what the cross-check
 * needs: per feature, the session that was recorded and the states the run actually held.
 *
 * A scenario is a plain object, and the shape is the entire contract:
 *
 *   {
 *     id, title,                     // for the report
 *     aims,                          // which clause of the theorem it aims at
 *     drivers: ["engine"],           // "engine", and "legacy" if you want the old loop to fail
 *     replays: 1,                    // how many independent replays to compare
 *     expect: { engine: "pass" },    // optional; defaults below
 *     features: () => ({ name: { init, update, initData } }),
 *     async script(drivers, io) {}   // the run itself: dispatch, then settle the IO
 *   }
 *
 * `features()` is called fresh for every driver, so two drivers never share a state object.
 */
export async function runScenario(scenario, driverName) {
  const io = createIO();
  const built = scenario.features();
  const drivers = {};
  for (const [name, parts] of Object.entries(built)) {
    drivers[name] = DRIVERS[driverName]({ ...parts, perform: io.perform });
  }

  await scenario.script(drivers, io);
  await io.quiet();

  const results = {};
  for (const [name, parts] of Object.entries(built)) {
    results[name] = {
      init: parts.init,
      update: parts.update,
      session: drivers[name].session(),
      live: drivers[name].live(),
    };
  }
  return { io, results };
}

/** engine runs are expected to replay; the loop from before the engine is expected to diverge. */
function expectationFor(scenario, driver) {
  return scenario.expect?.[driver] ?? (driver === "legacy" ? "diverge" : "pass");
}

/**
 * Run every scenario, and say whether the theorem held.
 *
 * The theorem, as Spacta states it: if `verify` is green, a bug in feature F (1) stays inside F,
 * (2) is reproducible from `(initData, actions[])` alone, and (3) has no hidden inputs. This
 * checks (2) and (3) directly, (1) partially, and (4) not at all — and says so on every run,
 * green or red, via `printNotChecked()`.
 *
 * A non-zero `failed` is deliberately symmetric. A session that was supposed to replay and did
 * not is a broken theorem; a session that was supposed to diverge on the pre-engine loop and did
 * not is a scenario that has stopped reproducing the bug it exists for. Both are findings, and
 * neither is fixed by relaxing the check.
 *
 * @param scenarios  the list described on `runScenario`
 * @param sessionDir where recordings are written. They are read back from disk before replaying,
 *                   so a run that only agreed because both sides shared one array in memory does
 *                   not agree here.
 * @param sessionLabel what to call that directory in the report. Defaults to the path itself.
 * @param log        where the report goes. Swap it to capture the run instead of printing it.
 */
export async function runCrossCheck({ scenarios, sessionDir, sessionLabel = sessionDir, log = console.log }) {
  mkdirSync(sessionDir, { recursive: true });

  const writeSession = (name, session) => {
    const path = join(sessionDir, `${name}.json`);
    // Two keys, in this order, always. Deterministic bytes: nothing in a scenario may read a
    // clock or a random source, so a session file that changes means a run changed.
    writeFileSync(path, `${JSON.stringify({ initData: session.initData, actions: session.actions }, null, 2)}\n`);
    return path;
  };

  log("spacta replay cross-check — is a run rebuildable from (initData, actions[]) alone?\n");
  log("  live run:  init(initData) → the production path applies update → S_live");
  log("  replay:    init(initData) → actions.reduce(update)             → S_replay");
  log("  compared at every intermediate state, not only the last one.\n");

  const rows = [];
  let violations = 0;
  let recordingProblems = 0;
  const written = [];

  for (const scenario of scenarios) {
    log(`${scenario.id}  ${scenario.title}   — aims at ${scenario.aims}`);

    for (const driver of scenario.drivers) {
      const { results } = await runScenario(scenario, driver);
      const expectation = expectationFor(scenario, driver);

      for (const [name, result] of Object.entries(results)) {
        const path = writeSession(`${scenario.id}-${driver}-${name}`, result.session);
        written.push(path);
        const session = JSON.parse(readFileSync(path, "utf8"));

        for (const problem of assertNoStateRecorded(session, result.live.final)) {
          recordingProblems += 1;
          log(`    RECORDING  ${name}: ${problem}`);
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

        log(
          `    ${driver.padEnd(7)} ${name.padEnd(16)} ${label.padEnd(46)} ` +
            `${String(verdict.actionCount).padStart(3)} Actions` +
            (verdict.observedCount > 0 ? `, ${verdict.observedCount} renders observed` : "") +
            (verdict.replays > 1 ? `, ${verdict.replays} replays` : "") +
            (note ? `\n        ${note}` : ""),
        );
        if (!verdict.ok) for (const line of formatDivergence(verdict)) log(line);

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
    log("");
  }

  // ───────────────────────── summary ─────────────────────────

  log("Scenario results\n");
  log("  #    driver   feature           verdict                        expectation");
  for (const row of rows) {
    const verdict = row.outcome === "pass" ? "replays" : `diverged at #${row.index} ${row.action}`;
    log(
      `  ${row.id.padEnd(4)} ${row.driver.padEnd(8)} ${row.feature.padEnd(17)} ` +
        `${verdict.padEnd(30)} ${row.expectation.padEnd(8)} ${row.met ? "ok" : "NOT MET"}`,
    );
  }

  log(`\n  ${written.length} sessions written to ${sessionLabel}`);
  log(
    recordingProblems === 0
      ? "  every session holds initData and the Action list, and no State snapshot"
      : `  ${recordingProblems} recording problem(s) — see above`,
  );

  printNotChecked(log);

  const failed = violations + recordingProblems;
  log(
    failed === 0
      ? `\ncross-check: ${rows.length} checks, every expectation met`
      : `\ncross-check: ${failed} expectation(s) NOT met — reported as they are, not adjusted`,
  );

  return { rows, written, violations, recordingProblems, failed };
}
