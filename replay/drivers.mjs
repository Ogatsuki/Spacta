/**
 * The two things that can play the part of "the live run", and the stub that stands in for IO.
 *
 * A real live run — a browser, `next dev`, D1 — is not reachable from here, and faking one would
 * be worse than not having one. What is real in these runs is everything Spacta claims to be
 * about: the engine in `shared/spacta/runtime.ts` is the same file the app ships, and the
 * `update` under test is the feature's own `core.ts`. Only `perform` (= `runEffect`) is replaced,
 * because that is the one function whose job is to leave the process. The limitation is printed
 * next to every result rather than left in a comment.
 *
 * Two drivers, because a cross-check that passes against both would be proving nothing:
 *
 *   engineRun — the engine. One authoritative state, one Action at a time, one Effect in flight.
 *   legacyRun — the hand-written shell loop as it stood before the engine existed: `dispatch`
 *               reads the state its render closed over, and `drain` commits a whole state object
 *               built from its own snapshot. This is §2.6, transcribed rather than described.
 *
 * The transcription lives here, in one place, and `runtime.serialization.test.mjs` uses this one
 * too — a second copy of the old loop could drift from the first and the before/after evidence
 * would quietly stop being about the same thing.
 */
import { createRecorder, createRuntime } from "../starter/src/shared/spacta/runtime.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ───────────────────────── the engine ─────────────────────────

/**
 * Drive the real engine, with the real `core.ts`, recording as it goes.
 *
 * `update` is wrapped so the harness can see the state after each individual Action. The wrapper
 * observes, it does not record: what it collects is the S_live side of the comparison and it
 * never reaches the session file, which still holds `initData` and Actions and nothing else.
 * Without it the finest thing observable from outside would be the state after a whole batch,
 * and the cross-check would only be able to compare batches — which is exactly the coarseness
 * that lets a run diverge in the middle and converge again unnoticed.
 *
 * `observed` is the second channel, and it exists because the first one is close to a tautology
 * on its own: states collected by wrapping `update` will of course fold like `update`. So the
 * run is also watched the way the app watches it — `subscribe` plus `getState`, which is what
 * `useSyncExternalStore` calls and therefore what a render would have shown — and those
 * snapshots are compared against the replay too. Nothing here reaches inside the engine: both
 * functions are the public surface, and the Action index each snapshot belongs to is counted off
 * the harness's own recorder.
 */
export function engineRun({ initData, init, update, perform }) {
  const recorder = createRecorder(initData);
  const states = [];
  const observed = [];
  const runtime = createRuntime({
    init: () => init(initData),
    update: (state, action) => {
      const result = update(state, action);
      states.push(result[0]);
      return result;
    },
    perform,
    record: recorder,
  });

  runtime.subscribe(() => {
    observed.push({ index: recorder.actions.length - 1, state: runtime.getState() });
  });

  return {
    name: "engine",
    dispatch: (action) => runtime.dispatch(action),
    // The engine holds one state and hands it out; there is no render to be behind it.
    rerender: () => {},
    session: () => ({ initData: recorder.initData, actions: recorder.actions }),
    live: () => ({ states, observed, final: runtime.getState() }),
  };
}

// ───────────────────────── the loop from before ─────────────────────────

/**
 * The pre-engine shell, kept alive on purpose.
 *
 * Everything wrong with it is structural and is reproduced here exactly: `dispatch` computes
 * from `rendered`, the state the last render closed over, so two clicks in one tick both start
 * from the same place and the second's result replaces the first's. `drain` carries its own
 * `current`, seeded at the moment the write left, and `commit` writes that whole object back —
 * so an answer arriving late overwrites everything that happened while it was away.
 *
 * It also drops the outcome of any Effect with no `correlationId`, which is how two of the three
 * features in livingdoc came to receive nothing at all without anybody noticing.
 *
 * `rerender()` is the script's way of saying "React painted here": after it, a dispatch sees the
 * committed state. Scripts call it where a real user would have seen the screen update.
 */
export function legacyRun({ initData, init, update, perform }) {
  const recorder = createRecorder(initData);
  const states = [];
  let committed = init(initData);
  let rendered = committed;

  function note(action, state) {
    recorder.actions.push(action);
    states.push(state);
  }

  async function drain(from, queue, commit) {
    let current = from;
    const remaining = [...queue];
    while (remaining.length > 0) {
      const effect = remaining.shift();
      let outcome = null;
      try {
        const result = await perform(effect);
        if (effect.correlationId) {
          outcome = { type: "EFFECT_SUCCEEDED", correlationId: effect.correlationId, data: result?.data };
        }
      } catch (error) {
        if (effect.correlationId) {
          const message = error instanceof Error && error.message ? error.message : String(error);
          outcome = { type: "EFFECT_FAILED", correlationId: effect.correlationId, message };
        }
      }
      if (!outcome) continue; // the discarded path: an Effect with no id answers to nobody
      const [next, more] = update(current, outcome);
      current = next;
      remaining.push(...more);
      note(outcome, current);
      commit(current);
    }
  }

  function dispatchFrom(from, action) {
    const [next, effects] = update(from, action);
    committed = next;
    note(action, next);
    void drain(next, effects, (state) => {
      committed = state;
    });
  }

  return {
    name: "legacy",
    dispatch: (action) => dispatchFrom(rendered, action),
    /** Used by the serialization test, which needs to name the render snapshot itself. */
    dispatchFrom,
    rerender: () => {
      rendered = committed;
    },
    state: () => committed,
    session: () => ({ initData: recorder.initData, actions: recorder.actions }),
    live: () => ({ states, final: committed }),
  };
}

export const DRIVERS = { engine: engineRun, legacy: legacyRun };

// ───────────────────────── the IO stub ─────────────────────────

/**
 * `perform`, replaced by something a scenario can control.
 *
 * A delay is expressed as "the script has not settled this call yet" rather than as a number of
 * milliseconds, and out-of-order settlement as the order the script chooses to settle in. Real
 * timers would make the recorded sessions differ from run to run, and a session file that
 * changes when nothing changed is not evidence of anything.
 *
 * Note what this makes visible about the engine: with `order: "reverse"` the stub will answer the
 * newest outstanding call first, but the engine only ever has one call outstanding per feature
 * instance. Out-of-order settlement is something only the old loop — and a session that runs two
 * features at once — can actually exhibit.
 */
export function createIO() {
  const calls = [];

  function perform(effect) {
    return new Promise((resolve, reject) => {
      calls.push({ effect, resolve, reject, done: false });
    });
  }

  async function quiet(rounds = 16) {
    for (let i = 0; i < rounds; i++) await tick();
  }

  /**
   * `perform` hands back exactly one thing: `data`, whatever the feature that asked said its
   * answer looks like — a server-assigned id, a page of rows, either. It has to survive the
   * stub. Resolving with `{ id }` alone — which this did while the engine had a second field
   * for it — would drop a page of rows between here and the engine, and the scenario would pass
   * green having carried nothing. `.mjs` is not type-checked, so nothing else would have said so.
   */
  function settle(index, answer) {
    const call = calls[index];
    call.done = true;
    if (answer && answer.fail) return call.reject(new Error(answer.fail));
    if (!answer || answer.data === undefined) return call.resolve(null);
    call.resolve({ data: answer.data });
  }

  return {
    perform,
    calls,
    quiet,

    /** Wait until the run has asked for at least `n` Effects. */
    async waitFor(n) {
      for (let i = 0; i < 200 && calls.length < n; i++) await tick();
      if (calls.length < n) throw new Error(`only ${calls.length} of ${n} Effects were performed`);
      await quiet(2);
    },

    /** Settle one outstanding call, so a script can answer a write while others are still away. */
    async answer(index, answer) {
      settle(index, answer);
      await quiet();
    },

    /**
     * Answer everything, including the Effects that are born from the answers, until the run has
     * nothing left in flight. `outcome(index, effect)` returns `{ data }` or `{ fail: message }`.
     */
    async settleAll({ order = "arrival", outcome = (index) => ({ data: { id: `srv_${index + 1}` } }) } = {}) {
      for (let guard = 0; guard < 100; guard++) {
        await quiet();
        const open = calls.map((call, index) => index).filter((index) => !calls[index].done);
        if (open.length === 0) break;
        const pick = order === "reverse" ? open[open.length - 1] : open[0];
        settle(pick, outcome(pick, calls[pick].effect));
      }
      await quiet();
    },
  };
}
