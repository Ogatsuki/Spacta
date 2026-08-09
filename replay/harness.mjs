/**
 * The cross-check itself: does a run rebuild from `(initData, actions[])` alone?
 *
 *   live run:  init(initData) → the production path applies update → S_live
 *   replay:    init(initData) → actions.reduce(update)             → S_replay
 *
 * If the two disagree, the theorem Spacta claims — that a bug is reproducible from the
 * recording alone — is false for that run, and the Action where it stopped being true has a
 * name and an index.
 *
 * Three rules keep this from being a check that cannot fail, and they are the reason the file
 * is written the way it is:
 *
 *   1. The replay may use `init` and `update` and nothing else. It never reads the engine, its
 *      queues or its state. Everything it starts from arrives as JSON that was parsed back from
 *      the session file — so a run that only agreed because both sides shared one mutable object
 *      in memory disagrees here, which is a divergence worth having.
 *   2. Every intermediate state is compared, not only the last one. A run that diverges at
 *      Action 3 and happens to converge again by Action 9 has still broken the claim, and a
 *      final-state check would call it green.
 *   3. Nothing that is compared was ever recorded. The recording holds no State (see
 *      `Recorder` in `shared/spacta/runtime.ts`); the live states come from watching the
 *      production path compute them, the replay states from recomputing them.
 *
 * Tool side, not application side: this lives here rather than under `livingdoc/src/**` because
 * that tree is a measurement zone and a harness inside it would change the numbers the
 * measurement is about.
 */

// ───────────────────────── comparison ─────────────────────────

function isObject(value) {
  return value !== null && typeof value === "object";
}

/**
 * Structural equality, deliberately not `JSON.stringify(a) === JSON.stringify(b)`. Key order is
 * an accident of how an object was built, and a replay that produced the same state by a
 * different assignment order is not a divergence. A missing key and an explicit `undefined` are
 * likewise the same value, which matters because a session file loses the difference.
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((value, i) => deepEqual(value, b[i]));
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function brief(value) {
  const text = value === undefined ? "undefined" : JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

/**
 * Where two states disagree, as paths. A report that says "the states differ" is useless to the
 * agent that has to act on it; a report that says `traces[0].votes: 3 vs 2` names the write that
 * went missing.
 */
export function diffStates(live, replay, limit = 8) {
  const out = [];
  walk("", live, replay);
  return out;

  function walk(path, a, b) {
    if (out.length >= limit || deepEqual(a, b)) return;
    const named = path || "(root)";
    if (!isObject(a) || !isObject(b) || Array.isArray(a) !== Array.isArray(b)) {
      out.push({ path: named, live: brief(a), replay: brief(b) });
      return;
    }
    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        out.push({ path: `${named}.length`, live: a.length, replay: b.length });
      }
      for (let i = 0; i < Math.max(a.length, b.length); i++) walk(`${path}[${i}]`, a[i], b[i]);
      return;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      walk(path ? `${path}.${key}` : key, a[key], b[key]);
    }
  }
}

// ───────────────────────── the replay ─────────────────────────

/**
 * Rebuild every state of a run from the session, using `init` and `update` only.
 *
 * The session is copied through JSON first. Each replay therefore starts from data that has been
 * through a file's worth of round trip, and two replays of the same session cannot pass each
 * other a mutated object — which is how S8 is able to mean anything.
 */
function replayStates(init, update, session) {
  const fresh = JSON.parse(JSON.stringify(session));
  const states = [];
  let state = init(fresh.initData);
  for (const action of fresh.actions) {
    const [next] = update(state, action);
    state = next;
    states.push(state);
  }
  return states;
}

/**
 * Compare a recorded session against what the live run actually did.
 *
 * `live.states[i]` is the state the production path held after applying `session.actions[i]`;
 * `live.final` is the state that path considers authoritative when everything has settled — for
 * the engine that is `runtime.getState()`, for the old hand-written shell it is whatever the last
 * `commit` left behind. The final comparison is made against that authoritative value rather than
 * against the last observed step, so a driver whose visible state is not the state it computed
 * cannot slip through.
 */
export function crossCheck({ init, update, session, live, replays = 1 }) {
  const runs = [];
  for (let run = 0; run < replays; run++) runs.push(replayStates(init, update, session));
  const replay = runs[0];

  const verdict = {
    actionCount: session.actions.length,
    liveStepCount: live.states.length,
    replays,
    runsAgree: null,
    divergence: null,
    finalOk: null,
    ok: false,
  };

  const shared = Math.min(replay.length, live.states.length);
  for (let i = 0; i < shared; i++) {
    if (deepEqual(live.states[i], replay[i])) continue;
    verdict.divergence = {
      index: i,
      type: session.actions[i]?.type ?? "(none)",
      kind: "state",
      diff: diffStates(live.states[i], replay[i]),
    };
    break;
  }

  // A recording shorter or longer than the run it claims to describe has already broken the
  // claim, even when every state it does contain agrees: the Actions that are missing are exactly
  // the ones the replay could never reproduce.
  if (!verdict.divergence && replay.length !== live.states.length) {
    verdict.divergence = {
      index: shared,
      type: session.actions[shared]?.type ?? "(none)",
      kind: "length",
      diff: [{ path: "(applied Actions)", live: live.states.length, replay: replay.length }],
    };
  }

  // The second channel: states the run published to its subscribers — what a render would have
  // shown. They were not computed by anything the replay shares, so a driver whose visible state
  // is not the state it folded is caught here even when its own step trace looks consistent.
  verdict.observedCount = live.observed?.length ?? 0;
  if (!verdict.divergence) {
    for (const { index, state } of live.observed ?? []) {
      if (index < 0 || index >= replay.length) {
        verdict.divergence = {
          index,
          type: session.actions[index]?.type ?? "(none)",
          kind: "observed outside the recording",
          diff: [{ path: "(Action index)", live: index, replay: `0..${replay.length - 1}` }],
        };
        break;
      }
      if (deepEqual(state, replay[index])) continue;
      verdict.divergence = {
        index,
        type: session.actions[index]?.type ?? "(none)",
        kind: "observed",
        diff: diffStates(state, replay[index]),
      };
      break;
    }
  }

  const replayFinal = replay.length > 0 ? replay[replay.length - 1] : init(JSON.parse(JSON.stringify(session.initData)));
  verdict.finalOk = deepEqual(live.final, replayFinal);
  if (!verdict.divergence && !verdict.finalOk) {
    verdict.divergence = {
      index: replay.length - 1,
      type: "(final state)",
      kind: "final",
      diff: diffStates(live.final, replayFinal),
    };
  }

  if (replays > 1) {
    verdict.runsAgree = runs.every((states) => deepEqual(states, runs[0]));
    if (!verdict.runsAgree && !verdict.divergence) {
      const other = runs.find((states) => !deepEqual(states, runs[0])) ?? [];
      const at = runs[0].findIndex((state, i) => !deepEqual(state, other[i]));
      verdict.divergence = {
        index: at,
        type: session.actions[at]?.type ?? "(none)",
        kind: "non-deterministic replay",
        diff: diffStates(runs[0][at], other[at]),
      };
    }
  }

  verdict.ok = verdict.divergence === null && verdict.finalOk && verdict.runsAgree !== false;
  return verdict;
}

export function formatDivergence(verdict, indent = "        ") {
  const d = verdict.divergence;
  if (!d) return [];
  const lines = [
    `${indent}first divergence: Action #${d.index} (${d.type}) — ${d.kind}`,
    `${indent}  live vs replay:`,
  ];
  for (const entry of d.diff) {
    lines.push(`${indent}    ${entry.path}: ${entry.live}  ≠  ${entry.replay}`);
  }
  return lines;
}

// ───────────────────────── what a recording may contain ─────────────────────────

/**
 * A recording that carried a State would make all of the above agree with itself. This is the
 * check that the recorder stayed honest, and it is written so that it needs no list of field
 * names from any feature: whatever keys the final state has that `initData` does not are the
 * keys only a State could have all of at once, and no value anywhere in the session may have
 * them all. An Action that happens to share one of them (`SET_TAB` carries `tab`) is not a
 * snapshot and is not accused of being one.
 */
export function assertNoStateRecorded(session, liveFinal) {
  const problems = [];
  const keys = Object.keys(session);
  if (keys.length !== 2 || !keys.includes("initData") || !keys.includes("actions")) {
    problems.push(`session holds ${JSON.stringify(keys)} — only initData and actions may be recorded`);
  }
  const initKeys = new Set(Object.keys(session.initData ?? {}));
  const stateOnly = Object.keys(liveFinal ?? {}).filter((key) => !initKeys.has(key));
  if (stateOnly.length > 0) {
    walk(session.actions, "actions");
  }
  return problems;

  function walk(value, path) {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!isObject(value)) return;
    if (stateOnly.every((key) => key in value)) {
      problems.push(`${path} has every State-only field (${stateOnly.join(", ")}) — a State snapshot was recorded`);
    }
    for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
  }
}

// ───────────────────────── honesty (§6.4) ─────────────────────────

/**
 * Printed every time the cross-check reports, green or not. The point of the exercise is to stop
 * claiming more than has been checked, so the run states what it did not look at in the same
 * breath as what it did.
 */
export const NOT_CHECKED = [
  "(4) No ripple into other features — NOT verified, and not verifiable this way.",
  "    Two features that share a table are coupled through the data layer (§2.4); that",
  "    coupling never appears in an in-process Action log, so nothing here can see it.",
  "(1) Locality — only partially checked. A single-feature session that replays cleanly is",
  "    corroboration that the feature's behaviour is its own, not proof that it is.",
  "(*) The live run is engine-driven, not React-rendered. A browser, D1 and `next dev` are",
  "    not reachable here, so S_live is produced by driving the real engine and the real",
  "    feature `core.ts` with `perform` (= runEffect) stubbed. React's batching, Suspense",
  "    and re-render timing are outside what these runs exercise.",
];

export function printNotChecked() {
  console.log("\nWhat this cross-check does NOT verify:");
  for (const line of NOT_CHECKED) console.log(`  ${line}`);
}
