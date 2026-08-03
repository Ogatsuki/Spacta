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
import * as saved from "../../livingdoc/src/features/saved/core.ts";
import * as pageview from "../../livingdoc/src/features/pageview/core.ts";
import * as draft from "../../livingdoc/src/features/draft/core.ts";
import * as watchlist from "../../livingdoc/src/features/watchlist/core.ts";
import { createIO, legacyRun } from "./drivers.mjs";

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
          writes: [...state.writes, `${write.key}:${action.data?.id}`],
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
  setTimeout(() => deferred[1].resolve({ data: { id: "server-2" } }), 5);
  setTimeout(() => deferred[0].resolve({ data: { id: "server-1" } }), 30);
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

// ───────────────────────── 8. the read path, in a real feature ────────────────────────────
// Section 7 proved the engine carries `data`. This proves a real feature does something correct
// with it, which the cross-check cannot: a run that appends the wrong rows — or none at all — is
// still perfectly reproducible, so S10 passes either way. Same reason moderation's state is
// asserted above rather than left to the replay.
//
// This is also the one place the IO stub's own fidelity is load-bearing. `drivers.mjs` used to
// resolve every call as `{ id }`, which would reach Core here as an answer with no rows: the
// "no data" assertion below is what makes that failure loud instead of merely deterministic.

const SAVED_PAGE = {
  materialSlug: "rust-book",
  materialName: "The Rust Programming Language",
  materialCanonicalUrl: "https://doc.rust-lang.org/book/",
  pageId: "p_ownership",
  pageSlug: "ch04-01",
  pageNumber: "4.1",
  pageTitle: "What is Ownership?",
  canonicalUrl: "https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html",
};

const savedItem = (id) => ({
  trace: {
    id,
    pageId: "p_ownership",
    type: "insight",
    quote: "",
    quoteKey: "",
    body: `Saved trace ${id}.`,
    author: { id: "u_kim", username: "kim", avatarUrl: "" },
    createdAt: "2026-07-25T10:00:00.000Z",
    votes: 0,
    viewerVoted: false,
    bookmarked: true,
    comments: [],
  },
  page: SAVED_PAGE,
});

const SAVED_INIT = {
  now: "2026-07-26T09:00:00.000Z",
  viewer: { id: "u_reader", username: "reader", avatarUrl: "", role: "user", suspended: false },
  items: [savedItem("t_s1"), savedItem("t_s2")],
  hasMore: true,
};

/**
 * Run the real saved core on the real engine. `answer(effect)` decides what each Effect gets
 * back — `{ data }`, `{ id }`, or `{ fail }` — and `performed` records what was actually asked,
 * which is how "the second click asked nothing" becomes checkable rather than assumed.
 */
async function savedRun(answer, actions) {
  const performed = [];
  const runtime = createRuntime({
    init: () => saved.init(SAVED_INIT),
    update: saved.update,
    perform: async (effect) => {
      performed.push(effect);
      const reply = answer(effect);
      if (reply && reply.fail) throw new Error(reply.fail);
      return reply ?? null;
    },
  });
  for (const action of actions) runtime.dispatch(action);
  await sleep(60);
  return { state: runtime.getState(), performed, runtime };
}

const page2 = { of: "LOAD_MORE", traces: [savedItem("t_s3")], hasMore: false };
const load = (correlationId) => ({ type: "LOAD_MORE", correlationId });
const ids = (state) => state.items.map((item) => item.trace.id);

console.log("\nsaved — a read performed after the page has loaded:");

const loaded = await savedRun(() => ({ data: page2 }), [load("c_s1")]);
assertEqual(ids(loaded.state), ["t_s1", "t_s2", "t_s3"],
  "the rows a read answered with are appended — the screen grew without a navigation");
assertEqual(loaded.state.hasMore, false, "and `hasMore` is the server's answer, not something Core inferred");
assertEqual(loaded.state.pending, [], "the load is retired once answered");
assertEqual(loaded.state.notice, "", "a successful read says nothing");

// Two clicks before the first page is back. The cursor is the last row held, so a second
// request built from the same cursor would fetch — and append — the same page twice.
const twice = await savedRun(() => ({ data: page2 }), [load("c_s1"), load("c_s2")]);
assertEqual(twice.performed.length, 1, "a second click while a page is in flight asks nothing — one page at a time");
assertEqual(ids(twice.state), ["t_s1", "t_s2", "t_s3"], "so no row arrives twice");

// A failed read undid nothing, so there is nothing to put back — but the page is still out
// there, and retiring the button would strand the reader on a list that looks complete.
const loadFailed = await savedRun(() => ({ fail: "Request failed (500)" }), [load("c_s1")]);
assertEqual(ids(loadFailed.state), ["t_s1", "t_s2"], "a failed read appends nothing");
assertEqual(loadFailed.state.hasMore, true, "and leaves the page it failed to fetch still offered");
assertEqual(loadFailed.state.notice, "Request failed (500)", "and says why, through the same outcome Action");

// An answer that arrives with no rows attached — what a transport that dropped `data` looks
// like from inside Core. It must not read as "the list ended", because that is indistinguishable
// from success and is exactly how a silent loss would survive every replay.
const loadEmpty = await savedRun(() => ({}), [load("c_s1")]);
assertEqual(ids(loadEmpty.state), ["t_s1", "t_s2"], "an answer carrying no data appends nothing");
assertEqual(loadEmpty.state.notice, "Could not load more saved traces.",
  "and says so, instead of looking like the end of the list");

// Compensation over a row that was never in initData: undoing this removal has to restore an
// item the run only ever received as the answer to an Effect.
const afterLoad = await savedRun(
  (effect) => (effect.type === "LOAD_MORE" ? { data: page2 } : { fail: "Request failed (500)" }),
  [load("c_s1")],
);
afterLoad.runtime.dispatch({ type: "REMOVE_BOOKMARK", traceId: "t_s3", correlationId: "c_s3" });
await sleep(60);
const restored = afterLoad.runtime.getState();
assertEqual(ids(restored), ["t_s1", "t_s2", "t_s3"],
  "a rejected removal restores a row that only ever existed as the answer to an Effect");
assertEqual(restored.notice, "Request failed (500)", "under the notice that says the removal failed");
assertEqual(restored.pending, [], "and nothing is left claiming to be in flight");

// The stub the cross-check drives every scenario through, checked directly. It used to resolve
// each call as `{ id }` and nothing else, so a scenario could hand back a page of rows and the
// run would receive none — then replay identically and report green. The cross-check compares a
// run against its own replay and therefore cannot see this class of loss at all; this can.
const io = createIO();
const answered = io.perform({ type: "LOAD_MORE", correlationId: "c_io" });
await io.answer(0, { data: page2 });
assertEqual(await answered, { data: page2 },
  "the IO stub hands `data` through — a scenario's answer reaches the engine intact");

// ───────────────────────── 9. the key a write answers with, in a real feature ──────────────
// The reason an answer channel exists at all. A trace posted optimistically carries a `tempId`
// the server has never heard of, and everything the reader does to it next — vote, comment,
// report — addresses that id. Exchanging it for the real one is the most load-bearing use of an
// Effect's answer in this application, and until v0.11 it travelled on a field of its own
// (`id?: string`) that the engine copied and never read.
//
// Nothing checked it. Planting `const id = undefined` in pageview's EFFECT_SUCCEEDED left the
// cross-check at 14 green checks and this file at 45 passing assertions: a trace that keeps its
// placeholder forever is perfectly deterministic, so a replay agrees with it completely. That is
// the same blind spot moderation's compensation was asserted against, on the path that matters
// most, and it was open for as long as the field existed.

const PAGEVIEW_INIT = {
  now: "2026-07-26T09:00:00.000Z",
  viewer: { id: "u_reader", username: "reader", avatarUrl: "", role: "user", suspended: false },
  page: SAVED_PAGE,
  loginHref: "/login",
  traces: [],
  prev: null,
  next: null,
  watching: false,
};

async function pageviewRun(answer, actions) {
  const runtime = createRuntime({
    init: () => pageview.init(PAGEVIEW_INIT),
    update: pageview.update,
    perform: async (effect) => {
      const reply = answer(effect);
      if (reply && reply.fail) throw new Error(reply.fail);
      return reply ?? null;
    },
  });
  for (const action of actions) runtime.dispatch(action);
  await sleep(60);
  return runtime.getState();
}

/** What a reader does to post: open the composer, type, submit. Three Actions. */
const postTrace = (tempId, correlationId) => [
  { type: "OPEN_COMPOSER", quote: "" },
  { type: "SET_DRAFT_BODY", value: "A trace posted before the server had named it." },
  { type: "SUBMIT_TRACE", now: "2026-07-26T09:01:00.000Z", tempId, correlationId },
];

console.log("\npageview — the key a write answers with:");

const posted = await pageviewRun(() => ({ data: { id: "srv_trace_1" } }), postTrace("temp_1", "c_p1"));
assertEqual(posted.traces.map((t) => t.id), ["srv_trace_1"],
  "the optimistic tempId is exchanged for the key the database assigned");
assertEqual(posted.pending, [], "and the write is retired once the key has landed");

// An answer that names the write but carries nothing must leave the placeholder alone. Blanking
// it would be worse than never adopting: a trace whose id is `undefined` addresses nothing.
const postedBlind = await pageviewRun(() => null, postTrace("temp_2", "c_p2"));
assertEqual(postedBlind.traces.map((t) => t.id), ["temp_2"],
  "an answer carrying no data leaves the placeholder alone rather than erasing it");

// Compensation. `mutate` found this unprotected: deleting the whole EFFECT_FAILED body left
// every gate green, because a page that keeps showing a trace the server rejected is just as
// reproducible as one that removes it.
const postRejected = await pageviewRun(() => ({ fail: "Request failed (500)" }), postTrace("temp_3", "c_p3"));
assertEqual(postRejected.traces.map((t) => t.id), [],
  "a rejected post takes the optimistic trace back off the page");
assertEqual(postRejected.notice, "Request failed (500)",
  "and the failure lives in state, so the broken run replays from (state, action) alone");
assertEqual(postRejected.pending, [], "and nothing is left claiming to be in flight");

// ───────────────────────── 10. the two features `mutate` found unwatched ──────────────────
// `tools/mutate.mjs` breaks the round trip of every T3 feature and reports what no gate
// noticed. On its first run, 5 of 10 mutations survived, and `draft` and `watchlist` accounted
// for four of them: neither had a single behavioural assertion anywhere. Both declare T3 — they
// carry a correlationId and write both outcome cases — so `verify` had nothing to complain
// about, and the cross-check replayed the broken behaviour as faithfully as the correct one.
//
// These are the assertions those mutations should have failed against.

async function runFeature(feature, initData, answer, actions) {
  const runtime = createRuntime({
    init: () => feature.init(initData),
    update: feature.update,
    perform: async (effect) => {
      const reply = answer(effect);
      if (reply && reply.fail) throw new Error(reply.fail);
      return reply ?? null;
    },
  });
  for (const action of actions) runtime.dispatch(action);
  await sleep(60);
  return { state: runtime.getState(), runtime };
}

// ── draft: an autosaving compose screen ──
const READER = { id: "u_reader", username: "reader", avatarUrl: "", role: "user", suspended: false };
const DRAFT_INIT = {
  viewer: READER,
  loginHref: "/login",
  materials: [
    {
      id: "m_rust",
      slug: "rust-book",
      name: "The Rust Programming Language",
      pages: [
        { id: "p_ownership", slug: "ch04-01", number: "4.1", title: "What is Ownership?",
          canonicalUrl: "", traceCount: 1, lastActivityAt: null },
      ],
    },
  ],
  saved: null,
};
const compose = (body) => [
  { type: "SET_MATERIAL", value: "m_rust" },
  { type: "SET_PAGE", value: "p_ownership" },
  { type: "SET_BODY", value: body },
];
const draftRun = (answer, actions) => runFeature(draft, DRAFT_INIT, answer, actions);

console.log("\ndraft — autosave and submit, both answers:");

const autosaved = await draftRun(() => null, [...compose("A first pass at ownership."), { type: "REQUEST_SAVE", correlationId: "c_d1" }]);
assertEqual(autosaved.state.saveStatus, "saved", "a confirmed autosave is what moves the status, not the request");
assertEqual(autosaved.state.saveError, "", "and clears any earlier error");
assertEqual(draft.isDirty(autosaved.state), false, "the saved snapshot is recorded, so the screen is no longer dirty");
assertEqual(autosaved.state.pending, [], "and the save is retired");

const saveFailed = await draftRun(() => ({ fail: "Request failed (500)" }),
  [...compose("Text that must survive a failed save."), { type: "REQUEST_SAVE", correlationId: "c_d2" }]);
assertEqual(saveFailed.state.saveStatus, "error", "a rejected autosave says so");
assertEqual(saveFailed.state.saveError, "Request failed (500)", "and carries the reason");
assertEqual(saveFailed.state.body, "Text that must survive a failed save.",
  "and touches nothing the reader wrote — a failed save must never cost text");
assertEqual(draft.isDirty(saveFailed.state), true, "the draft is still dirty, so the next save will retry it");

// The late answer. The reader kept typing while the save was away, so the answer confirms the
// snapshot that was *sent*, not what is on screen now. Marking the newer text clean would claim
// the server holds something it has never seen.
const late = await draftRun(() => null, [...compose("First."), { type: "REQUEST_SAVE", correlationId: "c_d3" }]);
late.runtime.dispatch({ type: "SET_BODY", value: "First. And then more." });
await sleep(20);
const afterTyping = late.runtime.getState();
assertEqual(afterTyping.lastSaved.body, "First.",
  "an autosave confirms the snapshot it was sent with, not the text that arrived while it was away");
assertEqual(draft.isDirty(afterTyping), true, "so the newer text is still dirty and will be saved in its turn");

const submitted = await draftRun(() => null, [...compose("A trace worth posting."), { type: "SUBMIT", correlationId: "c_d4" }]);
assertEqual(submitted.state.posted, true, "a confirmed submit is what marks the trace live");
assertEqual(submitted.state.pending, [], "and retires the write");

const submitFailed = await draftRun(() => ({ fail: "Request failed (500)" }),
  [...compose("A trace the server refuses."), { type: "SUBMIT", correlationId: "c_d5" }]);
assertEqual(submitFailed.state.posted, false, "a rejected submit does not claim the trace is live");
assertEqual(submitFailed.state.notice, "Request failed (500)", "and says why");
assertEqual(submitFailed.state.body, "A trace the server refuses.", "leaving the form exactly as it was, so it can be retried");

// ── watchlist: optimistic removal, and putting it back ──
const watched = (pageId, title) => ({
  page: {
    materialSlug: "rust-book", materialName: "The Rust Programming Language", materialCanonicalUrl: "",
    pageId, pageSlug: pageId, pageNumber: "4.1", pageTitle: title, canonicalUrl: "",
  },
  traceCount: 3,
});
const WATCHLIST_INIT = { viewer: READER, items: [watched("p_a", "Ownership"), watched("p_b", "Borrowing")] };
const pages = (state) => state.items.map((i) => i.page.pageId);
const watchRun = (answer, actions) => runFeature(watchlist, WATCHLIST_INIT, answer, actions);
const unwatch = (pageId, correlationId) => ({ type: "REMOVE_WATCH", pageId, correlationId });

console.log("\nwatchlist — an optimistic removal, confirmed and rejected:");

const unwatched = await watchRun(() => null, [unwatch("p_a", "c_w1")]);
assertEqual(pages(unwatched.state), ["p_b"], "a confirmed removal leaves the page off the list");
assertEqual(unwatched.state.pending, [], "and retires the write");
assertEqual(unwatched.state.notice, "", "a success says nothing");

const unwatchFailed = await watchRun(() => ({ fail: "Request failed (500)" }), [unwatch("p_a", "c_w2")]);
assertEqual(pages(unwatchFailed.state), ["p_a", "p_b"],
  "a rejected removal puts the page back, and back in the position it held");
assertEqual(unwatchFailed.state.notice, "Request failed (500)", "under a notice saying why");
assertEqual(unwatchFailed.state.pending, [], "and nothing is left claiming to be in flight");

console.log(`\nengine — the source and its ${engineCopies.length - 1} copies:`);
assert(identical("runtime.ts"), "runtime.ts matches engine/runtime.ts everywhere it lands");
assert(identical("react.ts"), "react.ts matches engine/react.ts everywhere it lands");

console.log(
  failures === 0
    ? `\nruntime.serialization: ${checks} assertions, all passed`
    : `\nruntime.serialization: ${failures} assertion(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
