/**
 * shell.tsx = Boundary between UI and IO (client). Frame is moved to layout/shared-ui,
 * leaving only state wiring and Action transformation here.
 */
"use client";
import { useState } from "react";
import { runEffect } from "@/shared/runEffect";
import type { Effect } from "@/shared/types";
import { CounterActions } from "./components/CounterActions";
import { CounterSummary } from "./components/CounterSummary";
import { init, summarize, update } from "./core";
import type { Action, InitData, State } from "./types";

/**
 * Mechanism, not judgement. This loop only turns an Effect's outcome into an Action and keeps
 * the queue moving. Every policy question — retry, compensation, whether to carry on — is
 * answered by update() in core.ts, which is why nothing here branches on a feature concept.
 *
 * Do not add an `if` about your domain to this function: such an `if` is a judgement and it
 * belongs in Core. It is written outside the component on purpose — a shell gets rewritten as
 * a feature grows, and this loop should not be rewritten with it.
 *
 * Known limit: the loop starts from the state it was handed, so a dispatch arriving while an
 * Effect is in flight is not reconciled here. starter shows the correct shape, not a finished
 * runtime — see `verify`'s NOT guaranteed list.
 */
async function drain(from: State, queue: Effect[], commit: (state: State) => void): Promise<void> {
  let current = from;
  const pending = [...queue];
  while (pending.length > 0) {
    const effect = pending.shift()!;
    let outcome: Action | null = null;
    try {
      const result = await runEffect(effect); // Execution is isolated in runEffect (L4).
      if ("correlationId" in effect) {
        outcome = { type: "EFFECT_SUCCEEDED", correlationId: effect.correlationId, id: result?.id };
      }
    } catch (error) {
      if ("correlationId" in effect) {
        outcome = {
          type: "EFFECT_FAILED",
          correlationId: effect.correlationId,
          message: error instanceof Error ? error.message : "unknown error",
        };
      }
    }
    if (!outcome) continue; // No correlationId means there is no answer to carry back (e.g. LOG).
    const [next, more] = update(current, outcome);
    current = next;
    pending.push(...more); // Effects born from the answer are queued, never dropped.
    commit(current);
  }
}

export function SampleShell({ initData }: { initData: InitData }) {
  const [state, setState] = useState<State>(() => init(initData));
  const summary = summarize(state);

  // Non-determinism (now, correlationId) is generated at Shell (boundary) and passed as values to
  // Core (L3). Core generates neither.
  function dispatch(make: (now: string, correlationId: string) => Action) {
    const action = make(new Date().toISOString(), crypto.randomUUID());
    const [next, effects] = update(state, action);
    setState(next);
    void drain(next, effects, setState);
  }

  return (
    <section className="space-y-6">
      <CounterSummary
        count={state.count}
        lastTouched={state.lastTouched}
        summary={summary}
        pending={state.pending.length}
        notice={state.notice}
      />
      <CounterActions
        onIncrement={() => dispatch((now, correlationId) => ({ type: "INCREMENT", now, correlationId }))}
        onReset={() => dispatch((now) => ({ type: "RESET", now }))}
      />
    </section>
  );
}
