/**
 * Serialization test for the Spacta engine.
 *
 * This is the tool side, not the application side: it lives here rather than under
 * `livingdoc/src/**` because that tree is a measurement zone and a test file in it would
 * change the numbers the measurement is about. The replay harness will join it here later.
 *
 * What it is for. The engine's reason to exist is that the loop used to be hand-written per
 * feature, and one of those copies lost updates: a dispatch that arrived while an Effect was
 * in flight was applied to the state the render had closed over, and the earlier round trip's
 * answer then overwrote the whole state object on its way back. This file reproduces that
 * shape twice — once against the old hand-written loop, where it must still lose the write,
 * and once against the engine, where it must not. A test that passes against both would not
 * be reproducing anything, so the first half is as load-bearing as the second.
 *
 *   bun /workspace/spacta/replay/runtime.serialization.test.mjs
 *
 * No dependencies. Non-zero exit on failure.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createRuntime } from "../starter/src/shared/spacta/runtime.ts";

const here = dirname(fileURLToPath(import.meta.url));
const starterEngine = join(here, "..", "starter", "src", "shared", "spacta");
const livingdocEngine = join(here, "..", "..", "livingdoc", "src", "shared", "spacta");

let failures = 0;
function assert(ok, what) {
  if (ok) {
    console.log(`  ok   ${what}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${what}`);
  }
}
function assertEqual(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  // The values are printed only when they disagree: a passing run should read as a list of
  // the properties that hold, not as a dump.
  assert(a === e, a === e ? what : `${what}\n         expected ${e}\n         actual   ${a}`);
}

// ───────────────────────── the toy feature ─────────────────────────
// A pure `update` with two write paths, which is the minimum needed for one round trip to be
// able to erase the other. Nothing here knows about the engine.

const init = () => ({ writes: [], pending: [], unidentified: [] });

function update(state, action) {
  switch (action.type) {
    case "WRITE":
      return [
        { ...state, pending: [...state.pending, { correlationId: action.correlationId, key: action.key }] },
        [{ type: "SAVE", correlationId: action.correlationId, key: action.key }],
      ];
    case "PING":
      // An Effect that asks nothing: no correlationId, nothing to carry back. The old loop
      // skipped its outcome entirely; the engine must still answer.
      return [state, [{ type: "PING" }]];
    case "EFFECT_SUCCEEDED": {
      if (action.correlationId === null) {
        return [{ ...state, unidentified: [...state.unidentified, "succeeded"] }, []];
      }
      const write = state.pending.find((w) => w.correlationId === action.correlationId);
      if (!write) return [state, []];
      return [
        {
          ...state,
          writes: [...state.writes, `${write.key}:${action.id}`],
          pending: state.pending.filter((w) => w.correlationId !== action.correlationId),
        },
        [],
      ];
    }
    case "EFFECT_FAILED": {
      if (action.correlationId === null) {
        return [{ ...state, unidentified: [...state.unidentified, "failed"] }, []];
      }
      return [
        { ...state, pending: state.pending.filter((w) => w.correlationId !== action.correlationId) },
        [],
      ];
    }
    default:
      throw new Error(`unhandled action: ${action.type}`);
  }
}

// ───────────────────────── the out-of-order perform stub ─────────────────────────
// The two promises are built before the engine ever asks for one, and the *second* effect's
// promise settles well before the first's. Settlement order is therefore fixed by the stub,
// not by the order the engine happens to call in.

function outOfOrderPerform() {
  const deferred = [defer(), defer()];
  setTimeout(() => deferred[1].resolve({ id: "server-2" }), 5);
  setTimeout(() => deferred[0].resolve({ id: "server-1" }), 30);
  let taken = 0;
  const perform = async (effect) => {
    if (effect.type === "PING") return null;
    return deferred[taken++].promise;
  };
  return { perform, settled: () => Promise.all(deferred.map((d) => d.promise)) };
}

function defer() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── 1. the old hand-written loop still loses the write ─────────────
// Transcribed from the shells as they stood before the engine: `dispatch` reads the state its
// render closed over, and `drain` commits a whole state object built from its own snapshot.

async function legacyRun() {
  const { perform } = outOfOrderPerform();
  let committed = init();

  async function drain(from, queue, commit) {
    let current = from;
    const remaining = [...queue];
    while (remaining.length > 0) {
      const effect = remaining.shift();
      let outcome = null;
      try {
        const result = await perform(effect);
        if (effect.correlationId) {
          outcome = { type: "EFFECT_SUCCEEDED", correlationId: effect.correlationId, id: result?.id };
        }
      } catch (error) {
        if (effect.correlationId) {
          outcome = { type: "EFFECT_FAILED", correlationId: effect.correlationId, message: String(error) };
        }
      }
      if (!outcome) continue; // the discarded path: an Effect with no id answers to nobody
      const [next, more] = update(current, outcome);
      current = next;
      remaining.push(...more);
      commit(current);
    }
  }

  // `from` is the render-time closure. Two clicks in the same tick see the same one, because
  // React has not re-rendered between them — this is the §2.6 shape exactly.
  function dispatch(from, action) {
    const [next, effects] = update(from, action);
    committed = next;
    void drain(next, effects, (state) => {
      committed = state;
    });
  }

  const render0 = committed;
  dispatch(render0, { type: "WRITE", key: "vote", correlationId: "c1" });
  dispatch(render0, { type: "WRITE", key: "comment", correlationId: "c2" });
  await sleep(60);
  return committed;
}

// ───────────────────────── 2. the engine keeps both ─────────────────────────

async function engineRun() {
  const { perform } = outOfOrderPerform();
  const runtime = createRuntime({ init, update, perform });

  runtime.dispatch({ type: "WRITE", key: "vote", correlationId: "c1" });
  // Arrives while the first Effect is in flight. Nothing has re-rendered, and under the old
  // shape this is the dispatch that erased the first write.
  await sleep(1);
  runtime.dispatch({ type: "WRITE", key: "comment", correlationId: "c2" });
  await sleep(60);
  return runtime.getState();
}

// ───────────────────────── 3. an Effect that asks nothing is still answered ───────────────

async function unidentifiedRun() {
  const { perform } = outOfOrderPerform();
  const runtime = createRuntime({ init, update, perform });
  runtime.dispatch({ type: "PING" });
  await sleep(20);
  return runtime.getState();
}

// ───────────────────────── 4. the two copies of the engine have not drifted ───────────────

function identical(name) {
  const a = readFileSync(join(starterEngine, name));
  const b = readFileSync(join(livingdocEngine, name));
  return a.equals(b);
}

// ───────────────────────── run ─────────────────────────

console.log("runtime.serialization — the engine applies Actions one at a time\n");

const legacy = await legacyRun();
console.log("§2.6 reproduction — the hand-written loop, for comparison:");
assert(
  legacy.writes.length === 1,
  `the old loop loses one of two overlapping writes (kept ${JSON.stringify(legacy.writes)}) ` +
    `— if this ever passes with both writes, the scenario has stopped reproducing the bug`,
);

const engine = await engineRun();
console.log("\nengine — two overlapping write round trips, answers settling out of order:");
assert(engine.writes.length === 2, "both results are present in the final state");
assertEqual(
  engine.writes,
  ["vote:server-1", "comment:server-2"],
  "a dispatch arriving during an in-flight Effect does not lose the earlier result, and the " +
    "server ids land on the writes that asked for them",
);
assertEqual(engine.pending, [], "every write in flight was retired by an Action");

const ping = await unidentifiedRun();
console.log("\nengine — an Effect carrying no identifier:");
assertEqual(
  ping.unidentified,
  ["succeeded"],
  "the outcome of an identifier-less Effect is dispatched too (the old loop dropped it)",
);

console.log("\nengine copies — starter and livingdoc:");
assert(identical("runtime.ts"), "shared/spacta/runtime.ts is byte-identical in both repos");
assert(identical("react.ts"), "shared/spacta/react.ts is byte-identical in both repos");

console.log(
  failures === 0
    ? "\nruntime.serialization: 7 assertions, all passed"
    : `\nruntime.serialization: ${failures} assertion(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
