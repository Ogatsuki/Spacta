/**
 * Serialization test for the Spacta engine.
 *
 * This is the tool side, not the application side: it lives here rather than under
 * `livingdoc/src/**` because that tree is a measurement zone and a test file in it would
 * change the numbers the measurement is about. The replay cross-check lives here too.
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

import { createRecorder, createRuntime } from "../starter/src/shared/spacta/runtime.ts";
import * as moderation from "../../livingdoc/src/features/moderation/core.ts";
import { legacyRun } from "./drivers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const starterEngine = join(here, "..", "starter", "src", "shared", "spacta");
const livingdocEngine = join(here, "..", "..", "livingdoc", "src", "shared", "spacta");
/**
 * The engine's one source, and every place a copy of it lands.
 *
 * `engine/` is the source; the rest are copies — starter ships it as the template, livingdoc
 * runs it, and `livingdoc/verify/starter/` carries it because livingdoc bundles its own
 * verifier whose wiring test needs a corpus. The list used to have no source in it, only
 * peers compared against each other, which meant an edit to any one of them could be
 * propagated in the wrong direction. `engine/` is first here on purpose: it is what the
 * others are compared *to*, and `bun engine/sync.mjs` is what puts them back.
 *
 * A new copy belongs in `engine/sync.mjs` and here on the day it is made. A copy on neither
 * list is a copy nothing propagates to and nothing checks.
 */
const engineSource = join(here, "..", "engine");
const engineCopies = [
  engineSource,
  starterEngine,
  livingdocEngine,
  join(here, "..", "..", "livingdoc", "verify", "starter", "src", "shared", "spacta"),
];

let failures = 0;
let checks = 0;
function assert(ok, what) {
  checks += 1;
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
// The transcription of the pre-engine shell lives in `drivers.mjs`, where the replay
// cross-check drives it too. One copy: two transcriptions of the same old loop could drift
// apart, and then the before/after evidence would stop being about the same thing.

async function legacyShellRun() {
  const { perform } = outOfOrderPerform();
  const shell = legacyRun({ initData: null, init, update, perform });

  // `dispatchFrom` names the render-time closure explicitly. Two clicks in the same tick see the
  // same one, because React has not re-rendered between them — this is the §2.6 shape exactly.
  const render0 = shell.state();
  shell.dispatchFrom(render0, { type: "WRITE", key: "vote", correlationId: "c1" });
  shell.dispatchFrom(render0, { type: "WRITE", key: "comment", correlationId: "c2" });
  await sleep(60);
  return shell.state();
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

// ───────────────────────── 4. the recorder is optional and changes nothing ────────────────
// Two properties the replay cross-check leans on. That recording is transparent — a recorded run
// and an unrecorded one end in the same place, so what the log describes is the run that would
// have happened anyway — and that what lands in the log is `initData` and the Actions, in the
// order they were applied, with no State anywhere near it.

async function recordedRun() {
  const { perform } = outOfOrderPerform();
  const initData = { seed: "for the record" };
  const record = createRecorder(initData);
  const runtime = createRuntime({ init, update, perform, record });

  runtime.dispatch({ type: "WRITE", key: "vote", correlationId: "c1" });
  await sleep(1);
  runtime.dispatch({ type: "WRITE", key: "comment", correlationId: "c2" });
  await sleep(60);
  return { state: runtime.getState(), record };
}

// ───────────────────────── 5. the two copies of the engine have not drifted ───────────────

function identical(name) {
  const first = readFileSync(join(engineCopies[0], name));
  return engineCopies.every((dir) => readFileSync(join(dir, name)).equals(first));
}

// ───────────────────────── run ─────────────────────────

console.log("runtime.serialization — the engine applies Actions one at a time\n");

const legacy = await legacyShellRun();
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

const recorded = await recordedRun();
console.log("\nengine — with a recorder attached:");
assertEqual(
  recorded.state,
  engine,
  "recording is transparent: the run ends exactly where the unrecorded one did",
);
assertEqual(
  recorded.record.actions.map((a) => a.type),
  ["WRITE", "WRITE", "EFFECT_SUCCEEDED", "EFFECT_SUCCEEDED"],
  "every Action reached the log, in the order it was applied — including the ones the engine " +
    "dispatched itself",
);
assertEqual(
  recorded.record.initData,
  { seed: "for the record" },
  "initData is in the log, because a replay has to start from something",
);
assertEqual(
  Object.keys(recorded.record).sort(),
  ["actions", "initData"],
  "and nothing else is — a recorded State would make the replay cross-check agree with itself",
);

// ───────────────────────── 6. a real feature's compensation, driven by the engine ─────────
// The engine guarantees the answer comes back. It does not guarantee the feature does anything
// sensible with it, and the replay cross-check cannot tell the difference: it compares a run
// against its own replay, so a feature that compensates *wrongly but deterministically* passes
// every scenario. So the state is asserted here.
//
// Until v0.11 `MODERATE` carried no `correlationId` and moderation could name nothing: a success
// dropped nothing from `pending`, and a failure dropped everything without undoing the change it
// was failing — the console went on showing an approval underneath a notice saying it had failed.

const MODERATION_INIT = {
  now: "2026-07-26T09:00:00.000Z",
  viewer: { id: "u_admin", username: "admin", avatarUrl: "", role: "admin", suspended: false },
  reports: [],
  requests: [
    { id: "q_1", name: "Crafting Interpreters", url: "", note: "", status: "open",
      createdAt: "2026-07-26T07:00:00.000Z", requester: { id: "u_kim", username: "kim", avatarUrl: "" } },
  ],
  users: [{ id: "u_spam", username: "spam", avatarUrl: "", traceCount: 4, suspended: false }],
};

/**
 * Run the real moderation core on the real engine. `failing` names the correlationIds the
 * server rejects — by id rather than wholesale, because "one command fails and another does
 * not" is the case the old code could not express and is the one worth asserting.
 */
async function moderationRun(failing, actions) {
  const runtime = createRuntime({
    init: () => moderation.init(MODERATION_INIT),
    update: moderation.update,
    perform: async (effect) => {
      if (failing.includes(effect.correlationId)) throw new Error("Request failed (500)");
      return null;
    },
  });
  for (const action of actions) runtime.dispatch(action);
  await sleep(60);
  return runtime.getState();
}

const approve = (correlationId) => ({ type: "RUN", correlationId, command: { command: "approve-request", targetId: "q_1" } });
const suspend = (correlationId) => ({ type: "RUN", correlationId, command: { command: "suspend-user", targetId: "u_spam" } });

console.log("\nmoderation — what the answer is allowed to change:");

const modOk = await moderationRun([], [approve("c_m1")]);
assertEqual(modOk.requests[0].status, "approved", "a confirmed command stands");
assertEqual(modOk.pending, [], "and stops being called in flight — the success drops it from pending");
assertEqual(modOk.notice, "", "a success says nothing");

const modFailed = await moderationRun(["c_m1"], [approve("c_m1")]);
assertEqual(modFailed.requests[0].status, "open", "a rejected command is undone — the row goes back to what it displaced");
assertEqual(modFailed.pending, [], "and is dropped from pending, so nothing is left claiming to be in flight");
assertEqual(modFailed.notice, "Request failed (500)", "the failure lives in state, so the broken run replays from (state, action) alone");

// The wholesale clear this replaced could not tell two commands apart. One failing must not
// retire the other, and undoing one must not touch the row the other one moved.
const modMixed = await moderationRun(["c_m1"], [approve("c_m1"), suspend("c_m2")]);
assertEqual(modMixed.requests[0].status, "open", "with two commands out, the rejected one still undoes its own row");
assertEqual(modMixed.users[0].suspended, true, "and leaves the row of the command that succeeded alone");
assertEqual(modMixed.pending, [], "both are retired — one failing no longer clears the queue for the other");

// An answer naming a command this console never made must change nothing at all — the guard
// that makes a duplicated or late outcome harmless.
const strayOk = moderation.update(modOk, { type: "EFFECT_SUCCEEDED", correlationId: "c_never", id: undefined })[0];
assertEqual(strayOk, modOk, "an outcome for a command that was never recorded changes nothing (success)");
const strayFail = moderation.update(modOk, { type: "EFFECT_FAILED", correlationId: "c_never", message: "boom" })[0];
assertEqual(strayFail, modOk, "an outcome for a command that was never recorded changes nothing (failure)");

// ───────────────────────── 7. an Effect may answer with data, not only an id ──────────────
// v0.11. Until now `perform` could hand back `{ id }` and nothing else, so a feature could
// write but never read: the only way more data reached a screen was a fresh `InitData`, which
// means a navigation or a reload. `R` threads an answer shape from the feature through the
// engine and back into an Action — and the engine still never looks inside it, exactly as it
// never looks inside `E`. The point of a type parameter rather than a shared union is that
// nothing about this feature's answer is written down anywhere but this feature.
//
// A type parameter nothing exercises is a type parameter that compiles and does not work, so
// what is asserted here is that the value arrives.

const readInit = () => ({ items: [], cursor: "0", loading: false, note: "" });

function readUpdate(state, action) {
  switch (action.type) {
    case "LOAD_MORE":
      return [
        { ...state, loading: true },
        [{ type: "FETCH", correlationId: action.correlationId, cursor: state.cursor }],
      ];
    case "EFFECT_SUCCEEDED":
      // The answer arrives as data on an Action — the same road every other value takes across
      // the membrane. Core reads it; Core did not fetch it.
      return [
        {
          ...state,
          items: [...state.items, ...(action.data?.items ?? [])],
          cursor: action.data?.cursor ?? state.cursor,
          loading: false,
        },
        [],
      ];
    case "EFFECT_FAILED":
      return [{ ...state, loading: false, note: action.message }, []];
    default:
      throw new Error(`unhandled action: ${action.type}`);
  }
}

async function readRun(answer) {
  const runtime = createRuntime({
    init: readInit,
    update: readUpdate,
    perform: async (effect) => {
      if (answer === "fail") throw new Error("Request failed (500)");
      return { data: { items: [`from:${effect.cursor}`], cursor: String(Number(effect.cursor) + 1) } };
    },
  });
  runtime.dispatch({ type: "LOAD_MORE", correlationId: "r1" });
  await sleep(20);
  runtime.dispatch({ type: "LOAD_MORE", correlationId: "r2" });
  await sleep(20);
  return runtime.getState();
}

console.log("\nengine — an Effect that answers with data:");

const read = await readRun("ok");
assertEqual(read.items, ["from:0", "from:1"], "the data an Effect answered with reaches Core");
assertEqual(read.cursor, "2", "and a second read starts from where the first one left off");
assertEqual(read.loading, false, "the answer is what ends the load, not a timer");

const readFailed = await readRun("fail");
assertEqual(readFailed.items, [], "a failed read adds nothing");
assertEqual(readFailed.note, "Request failed (500)", "and says why, through the same outcome Action");

// The recorder must carry the answer too, or a replay would rebuild a run that never received
// it — the flight recorder would describe a screen the user did not see.
const readRecorder = createRecorder({ seed: "read" });
const recordedRead = createRuntime({
  init: readInit,
  update: readUpdate,
  perform: async () => ({ data: { items: ["recorded"], cursor: "9" } }),
  record: readRecorder,
});
recordedRead.dispatch({ type: "LOAD_MORE", correlationId: "r1" });
await sleep(20);
assertEqual(
  readRecorder.actions.map((a) => a.type),
  ["LOAD_MORE", "EFFECT_SUCCEEDED"],
  "a read is recorded as the question and the answer, both as Actions",
);
assertEqual(
  readRecorder.actions[1].data,
  { items: ["recorded"], cursor: "9" },
  "and the answer's data is in the log, because a replay cannot re-fetch it",
);
const replayedRead = readRecorder.actions.reduce((s, a) => readUpdate(s, a)[0], readInit());
assertEqual(
  replayedRead.items,
  ["recorded"],
  "folding update over the recorded Actions rebuilds the run — a read replays like anything else",
);

console.log(`\nengine — the source and its ${engineCopies.length - 1} copies:`);
assert(identical("runtime.ts"), "runtime.ts matches engine/runtime.ts everywhere it lands");
assert(identical("react.ts"), "react.ts matches engine/react.ts everywhere it lands");

console.log(
  failures === 0
    ? `\nruntime.serialization: ${checks} assertions, all passed`
    : `\nruntime.serialization: ${failures} assertion(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
