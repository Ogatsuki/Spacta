/**
 * shell.tsx = Boundary between UI and IO (client). Frame is moved to layout/shared-ui,
 * leaving only state wiring and Action transformation here.
 */
"use client";
import { useState } from "react";
import { runEffect } from "@/shared/runEffect";
import { CounterActions } from "./components/CounterActions";
import { CounterSummary } from "./components/CounterSummary";
import { init, summarize, update } from "./core";
import type { Action, InitData, State } from "./types";

export function SampleShell({ initData }: { initData: InitData }) {
  const [state, setState] = useState<State>(() => init(initData));
  const summary = summarize(state);

  // Non-determinism (now) is generated at Shell (boundary) and passed as a value to Core (L3). Core does not generate it.
  async function dispatch(make: (now: string) => Action) {
    const action = make(new Date().toISOString());
    const [next, effects] = update(state, action);
    setState(next);
    for (const e of effects) await runEffect(e); // Execution is isolated in runEffect (L4).
  }

  return (
    <section className="space-y-6">
      <CounterSummary count={state.count} lastTouched={state.lastTouched} summary={summary} />
      <CounterActions
        onIncrement={() => dispatch((now) => ({ type: "INCREMENT", now }))}
        onReset={() => dispatch((now) => ({ type: "RESET", now }))}
      />
    </section>
  );
}
