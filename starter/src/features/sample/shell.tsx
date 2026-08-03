/**
 * shell.tsx = Boundary between UI and IO (client). The frame is moved to layout/shared-ui and
 * the Effect loop lives in shared/spacta/runtime.ts, so what is left here is JSX wiring only:
 * state into props, callbacks into dispatch.
 *
 * Do not write your own effect loop. useSpacta hands the queue to the engine, which performs
 * every Effect through this feature's own `perform` and feeds every outcome back in as an
 * Action — including the outcome of an Effect that carries no correlationId. Non-determinism
 * (now, ids) is minted by the binding adapter and reaches Core as values (L3); Core generates
 * none of it.
 */
"use client";
import { useSpacta } from "@/shared/spacta/react";
import { CounterActions } from "./components/CounterActions";
import { CounterSummary } from "./components/CounterSummary";
import { init, summarize, update } from "./core";
import { perform } from "./perform";
import type { Action, Effect, InitData, State } from "./types";

export function SampleShell({ initData }: { initData: InitData }) {
  const [state, dispatch] = useSpacta<State, Action, Effect>({
    init: () => init(initData),
    update,
    perform,
  });
  const summary = summarize(state);

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
        onIncrement={() =>
          dispatch((mint) => ({ type: "INCREMENT", now: mint.now, correlationId: mint.id() }))
        }
        onReset={() => dispatch((mint) => ({ type: "RESET", now: mint.now }))}
      />
    </section>
  );
}
