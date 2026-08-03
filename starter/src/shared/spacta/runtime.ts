/**
 * The engine. Mechanism, not judgement — and not React either.
 *
 * There is no `react` and no `next` in this file, and there must never be one. What lives
 * here is the part of Spacta that has no opinion about the platform: a serialized queue of
 * Effects, the single call site of `perform` (= `runEffect`), the conversion of every
 * outcome into an Action, and the re-queuing of the Effects that outcome gives birth to.
 * That is the unit that gets ported to SwiftUI or Compose; the binding to a particular UI
 * runtime is somebody else's file (`react.ts`).
 *
 * It exists because the loop had been hand-written three times in one project by one
 * author, and two of the three copies threw the server's answer away. A loop that is
 * written once cannot disagree with itself, so the round trip stops being something to
 * verify and becomes something that is simply built. Do not write a second one.
 *
 * Nothing here branches on a domain concept. Every policy question — what a server-assigned
 * id replaces, what a failure undoes, whether to carry on — is answered by `update()` in a
 * feature's `core.ts`. If you find yourself adding an `if` about traces, votes, requests or
 * moderation to this file, that `if` is a judgement and it belongs in Core.
 */

/**
 * The pure state machine a feature hands to the engine.
 *
 * The action parameter is `A | EffectOutcome` on purpose: it is the compiler's half of L3's
 * outbound rule. A feature whose `Action` union has no place for an outcome cannot be passed
 * here at all, so "I forgot the round trip" is a type error at the shell rather than silence
 * at runtime.
 */
export type Update<S, A, E, R = never> = (state: S, action: A | EffectOutcome<R>) => [S, E[]];

/**
 * What an Effect must look like from the engine's side. The engine reads exactly two things
 * off an Effect — that it is a tagged value, and whether it carries a `correlationId` — and
 * knows nothing else about the vocabulary. `type` is in the constraint so that an Effect
 * member without a `correlationId` still has a property in common with it; an all-optional
 * shape would be a weak type and the union would not fit.
 */
export type EffectSource = { type: string; correlationId?: string };

/**
 * The only thing `perform` may hand back: data. No promises inside, no callbacks, nothing
 * the Core could accidentally call. This return type does not cross the membrane — the
 * engine turns it into an Action, and the Action is what crosses.
 *
 * `data` is typed by the feature, not here. The engine never looks inside it: `R` is passed
 * through to the outcome Action exactly as `E` is passed through to `perform`, so the shape
 * of an answer is described in the feature that asked the question and nowhere else. That is
 * the whole reason it is a type parameter rather than a member of a shared union — a shared
 * one would have to name every feature's answer in a single file, which is the coupling the
 * Effect union already has and the one this is trying not to repeat.
 *
 * It defaults to `never`, so a feature that only writes says nothing about answers at all.
 *
 * There was a second field here until v0.11: `id?: string`, from the version when a write's
 * only conceivable answer was the key the database assigned. It was never mechanism — the
 * engine copied it and never read it — and once `R` existed it was one more way to say what
 * `data` already said, in a file that is supposed to branch on no domain concept whatsoever.
 * A feature that wants the server's key now declares `R = { id: string }` and receives it the
 * same way a paginated read receives its rows. Do not add a second channel back: two ways to
 * answer is how the loop that was written three times came to disagree with itself.
 */
export type Perform<E, R = never> = (effect: E) => Promise<{ data?: R } | null | undefined>;

/**
 * The return path of a write, as Actions.
 *
 * `EffectOutcome` is not a fifth membrane word. It is a shape every feature's `Action` union
 * must contain, so that the four words stay `State` / `Action` / `Effect` / `InitData`.
 *
 * `correlationId` is nullable rather than absent because the engine dispatches an outcome for
 * *every* Effect, including the ones that asked for nothing (`NAVIGATE`, `RELOAD`, `LOG`).
 * The old shape had the loop skip those quietly, which is how two features came to receive
 * nothing at all without anybody noticing. A feature that has no use for an unidentified
 * answer now has to write that down as a case — silence becomes a sentence.
 *
 * `data` carries whatever the answer was — a server-assigned id, a page of rows, anything the
 * feature named — and it is typed by the feature that asked. The engine never inspects it. A
 * feature that only writes leaves `R` at its default of `never` and the field is unusable,
 * which is the honest shape for a question that was not asked.
 */
export type EffectOutcome<R = never> =
  | { type: "EFFECT_SUCCEEDED"; correlationId: string | null; data?: R }
  | { type: "EFFECT_FAILED"; correlationId: string | null; message: string };

/** One running feature instance. The state lives in here, not in a closure. */
export type Runtime<S, A, R = never> = {
  /** The authoritative state. Identity changes only when `update` returned a new one. */
  getState: () => S;
  dispatch: (action: A | EffectOutcome<R>) => void;
  /** Notified after a batch of Actions has been applied. Returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
};

/**
 * The flight recorder: `initData`, the Actions in the order they were applied, and nothing else.
 *
 * There is no `S` anywhere in this type, and the absence is the whole design. A recorder that
 * could hold a State would make the replay cross-check compare a state against itself and agree
 * every time — it would verify nothing while looking green. What is written down is the *input*
 * of a run, because the claim being checked is that a run can be rebuilt from that input alone:
 * feed `initData` to `init`, fold `update` over the Actions, and the state that comes out should
 * be the state the run actually had. Anything else in here would be the answer sheet.
 *
 * `initData` is handed in by the caller rather than taken from the engine because `init` is
 * `() => S`: the engine is given a thunk and never sees the value behind it. Passing that value
 * a second time is a deliberate act, which is the right shape for a switch that must be off
 * unless somebody meant it.
 *
 * It is not a fifth membrane word. `InitData` and `Action` are two of the four that already
 * cross; a recording is a list of them, written down.
 */
export type Recorder<A, R = never> = {
  readonly initData: unknown;
  readonly actions: (A | EffectOutcome<R>)[];
};

/** An empty recorder. Only code that wants a recording ever calls this. */
export function createRecorder<A, R = never>(initData: unknown): Recorder<A, R> {
  return { initData, actions: [] };
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}

/**
 * Build a running instance of a feature.
 *
 * Serialization, which is the whole reason the state is held here: the engine owns one
 * authoritative `state`, one FIFO of Actions and one FIFO of Effects. `apply()` is the only
 * writer of `state` and it never runs concurrently with itself, so Actions land strictly one
 * at a time and each one sees the result of the one before it. `drain()` is the only caller
 * of `perform` and it too never runs concurrently with itself, so a second dispatch arriving
 * while an Effect is in flight cannot start a rival loop carrying a state snapshot of its own.
 *
 * That pair is what closes the lost update: the old shells read `state` from a React closure
 * and committed a whole state object back, so a vote answered while a comment was still in
 * flight overwrote the comment. Here there is nothing to overwrite — the later Action is
 * queued behind the earlier one and applied to the state the earlier one produced.
 *
 * `apply()` is also the single point where every Action meets the state, which is where the
 * opt-in recorder attaches — see `record` below.
 */
export function createRuntime<S, A, E extends EffectSource, R = never>(opts: {
  init: () => S;
  update: Update<S, A, E, R>;
  perform: Perform<E, R>;
  /**
   * Opt-in Action log. Absent means no recording, which is what production passes.
   *
   * The decision is an argument rather than something this file works out for itself: there is
   * no `process`, no `import.meta`, no notion of a development build in here, and putting one
   * in would give the engine a platform. Whoever builds the runtime knows whether this run is
   * being recorded; the engine only knows whether it was handed somewhere to write.
   */
  record?: Recorder<A, R>;
}): Runtime<S, A, R> {
  let state = opts.init();
  const inbox: (A | EffectOutcome<R>)[] = [];
  const queue: E[] = [];
  const listeners = new Set<() => void>();
  let applying = false;
  let draining = false;

  function announce(): void {
    for (const listener of [...listeners]) listener();
  }

  function apply(): void {
    // A dispatch that arrives from inside a listener finds the pump already running; it has
    // been queued, and the loop below will reach it. Re-entering here would interleave two
    // Actions, which is the one thing this engine exists to make impossible.
    if (applying) return;
    applying = true;
    try {
      while (inbox.length > 0) {
        const action = inbox.shift()!;
        // The recorder attaches here and only here. Every Action of every feature passes through
        // this line on its way to `update`, so the cost of recording is O(1) in the number of
        // features: a seventh feature adds no line to this file and none to its own. Written down
        // before `update` runs, so an Action that makes Core throw is present in the log that
        // reproduces the throw rather than missing from it.
        opts.record?.actions.push(action);
        const [next, effects] = opts.update(state, action);
        state = next;
        for (const effect of effects) queue.push(effect);
      }
    } finally {
      applying = false;
    }
    announce();
    void drain();
  }

  async function drain(): Promise<void> {
    if (draining) return; // Exactly one drain per instance. This is the serialization.
    draining = true;
    try {
      while (queue.length > 0) {
        const effect = queue.shift()!;
        const correlationId = effect.correlationId ?? null;
        let outcome: EffectOutcome<R>;
        try {
          const result = await opts.perform(effect); // IO is isolated in perform (L4).
          // `data` rides along untouched. `JSON.stringify` drops it when it is undefined, so a
          // feature that answers with nothing records exactly the session it recorded before.
          outcome = { type: "EFFECT_SUCCEEDED", correlationId, data: result?.data };
        } catch (error) {
          outcome = { type: "EFFECT_FAILED", correlationId, message: messageOf(error) };
        }
        // Unconditional. There is no branch here that could drop an answer, and none may be
        // added: an Effect with nothing to say still says so, and Core decides what that means.
        inbox.push(outcome);
        apply(); // Effects born from the answer are queued by apply(), never dropped.
      }
    } finally {
      draining = false;
    }
  }

  return {
    getState: () => state,
    dispatch: (action) => {
      inbox.push(action);
      apply();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
