/**
 * The cross-check, checked.
 *
 *   bun /workspace/spacta/replay/harness.selftest.mjs
 *
 * L6's problem recurs one level up. `verify` learned the hard way that a checker nobody has
 * pointed at a known violation is a checker that can be silently aimed at nothing — its self-test
 * was green while its globs matched zero files. A replay harness is in exactly that position:
 * "every scenario replayed cleanly" is indistinguishable from "the comparison never fires" unless
 * somebody plants a divergence and watches it get caught.
 *
 * So this file breaks recordings on purpose and requires rejection every time, and it starts with
 * the opposite obligation — an untouched session must still be accepted. A harness that always
 * says "diverged" would pass every plant below and be worth exactly as little as one that always
 * says green.
 *
 * No dependencies. Non-zero exit on failure.
 */
import { assertNoStateRecorded, crossCheck } from "./harness.mjs";
import { engineRun } from "./drivers.mjs";
import { runScenario, SCENARIOS } from "./scenarios.mjs";

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

/** Quiet version: used where one assertion stands for a whole family of plants. */
function every(items, predicate) {
  const bad = items.filter((item) => !predicate(item));
  return { ok: bad.length === 0, bad };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

// ───────────────────────── a real recording to break ─────────────────────────
// S5 — three writes, the second of which fails — because it has optimistic changes, a
// compensation and enough Actions for "the middle of the list" to mean something.

const scenario = SCENARIOS.find((s) => s.id === "S5");
const { results } = await runScenario(scenario, "engine");
const base = results.pageview;
const session = clone(base.session);
const live = base.live;
const N = session.actions.length;

const check = (over) =>
  crossCheck({ init: base.init, update: base.update, session, live, ...over });

console.log(`the cross-check, aimed at a known-good recording (${N} Actions):\n`);

assert(
  check({}).ok,
  "an untouched session is accepted — without this, every rejection below would be worthless",
);

// ───────────────────────── plant 1: an Action goes missing ─────────────────────────

console.log("\nplant — one Action removed from the recorded list:");

const drops = [];
for (let k = 0; k < N; k++) {
  const damaged = { initData: session.initData, actions: session.actions.filter((_, i) => i !== k) };
  drops.push({ k, verdict: crossCheck({ init: base.init, update: base.update, session: damaged, live }) });
}
assert(
  every(drops, (d) => !d.verdict.ok).ok,
  `dropping any single Action is rejected — all ${N} positions, not just the convenient ones`,
);

// The same plant with the run's own trace trimmed to match, so the lengths agree and only the
// comparison of states can see it. This is the version that would survive a harness which had
// nothing but an arithmetic check on list lengths.
const trimmed = [];
for (let k = 0; k < N; k++) {
  const damaged = { initData: session.initData, actions: session.actions.filter((_, i) => i !== k) };
  const trimmedLive = {
    states: live.states.filter((_, i) => i !== k),
    observed: [],
    final: live.states[live.states.length - 1],
  };
  trimmed.push({ k, verdict: crossCheck({ init: base.init, update: base.update, session: damaged, live: trimmedLive }) });
}
assert(
  every(trimmed, (d) => !d.verdict.ok).ok,
  "dropping an Action and trimming the run's trace to match is still rejected — the states are " +
    `compared, not counted (${trimmed.filter((d) => !d.verdict.ok).length}/${N} positions caught)`,
);

// ───────────────────────── plant 2: an Action arrives twice ─────────────────────────

console.log("\nplant — one Action recorded twice:");

const dupes = [];
for (let k = 0; k < N; k++) {
  const actions = [...session.actions];
  actions.splice(k, 0, clone(session.actions[k]));
  dupes.push(crossCheck({ init: base.init, update: base.update, session: { initData: session.initData, actions }, live }));
}
assert(every(dupes, (v) => !v.ok).ok, `duplicating any single Action is rejected — all ${N} positions`);

// ───────────────────────── plant 3: the run and the replay part, then meet again ──────────

console.log("\nplant — a run that diverges in the middle and converges again by the end:");

const converging = [];
for (let k = 0; k < N - 1; k++) {
  const states = clone(live.states);
  states[k] = { ...states[k], notice: "a state the replay will never produce" };
  // `final` is left correct on purpose: this is the run that a final-state-only check calls green.
  converging.push({ k, verdict: crossCheck({ init: base.init, update: base.update, session, live: { states, observed: [], final: live.final } }) });
}
assert(
  every(converging, (c) => !c.verdict.ok).ok,
  "a divergence at a single intermediate state is rejected even when the final states agree",
);
assert(
  every(converging, (c) => c.verdict.divergence?.index === c.k).ok,
  "and the Action it names is the one where the two runs actually parted",
);

// ───────────────────────── plant 4: `update` reads a clock ─────────────────────────

console.log("\nplant — an `update` with a hidden input:");

/**
 * A feature that looks pure from the outside and is not. `steps` is honest; `stamp` is the hidden
 * input — a value the Action did not carry and `initData` did not contain, so a replay run at any
 * other instant must produce a different state. This is the shape L2 exists to forbid and the
 * shape a replay cross-check can catch after the fact.
 */
function hiddenInputFeature(read) {
  return {
    initData: { label: "hidden" },
    init: (data) => ({ label: data.label, steps: [], stamp: 0 }),
    update: (state, action) =>
      action.type === "STEP"
        ? [{ ...state, steps: [...state.steps, action.n], stamp: read() }, []]
        : [state, []],
  };
}

async function runHidden(read) {
  const parts = hiddenInputFeature(read);
  const driver = engineRun({ ...parts, perform: async () => null });
  for (const n of [1, 2, 3]) driver.dispatch({ type: "STEP", n });
  return { parts, session: clone(driver.session()), live: driver.live() };
}

const clockRun = await runHidden(() => Date.now());
// Wait for the clock to actually move, so the plant is a certainty rather than a race: a replay
// finishing inside the same millisecond would have agreed by luck and proved nothing.
const started = Date.now();
while (Date.now() === started) { /* spin, sub-millisecond */ }
assert(
  !crossCheck({
    init: clockRun.parts.init,
    update: clockRun.parts.update,
    session: clockRun.session,
    live: clockRun.live,
  }).ok,
  "an `update` that secretly reads Date.now() is rejected — the replay cannot reproduce the run",
);

const randomRun = await runHidden(() => Math.random());
assert(
  !crossCheck({
    init: randomRun.parts.init,
    update: randomRun.parts.update,
    session: randomRun.session,
    live: randomRun.live,
  }).ok,
  "an `update` that secretly reads Math.random() is rejected as well",
);

// And the control for this pair: the same feature with the value passed in as an Action argument,
// which is what L3 asks for, must be accepted. Otherwise the two rejections above could be
// explained by the harness disliking the toy rather than by the hidden input.
const honest = hiddenInputFeature(() => 0);
const honestDriver = engineRun({ ...honest, perform: async () => null });
for (const n of [1, 2, 3]) honestDriver.dispatch({ type: "STEP", n });
assert(
  crossCheck({
    init: honest.init,
    update: honest.update,
    session: clone(honestDriver.session()),
    live: honestDriver.live(),
  }).ok,
  "the same feature with no hidden input is accepted — the rejection was the clock, not the shape",
);

// ───────────────────────── plant 5: a State smuggled into the recording ─────────────────────

console.log("\nplant — a State snapshot smuggled into a session file:");

assert(
  assertNoStateRecorded(session, live.final).length === 0,
  "a genuine session passes the recording check",
);
assert(
  assertNoStateRecorded({ initData: session.initData, actions: session.actions, states: [live.final] }, live.final)
    .length > 0,
  "a third top-level key is rejected — only initData and actions may be recorded",
);
assert(
  assertNoStateRecorded(
    { initData: session.initData, actions: [...session.actions, { type: "SNEAK", ...live.final }] },
    live.final,
  ).length > 0,
  "a State folded into an Action is rejected — the answer sheet cannot ride along in the log",
);

// ───────────────────────── report ─────────────────────────

console.log(
  failures === 0
    ? `\nharness.selftest: ${checks} assertions, all passed — the cross-check detects the divergences planted in it`
    : `\nharness.selftest: ${failures} of ${checks} assertion(s) FAILED — the cross-check cannot be trusted`,
);
process.exit(failures === 0 ? 0 : 1);
