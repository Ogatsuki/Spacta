/**
 * shell.tsx = UI と IO の縁（client）。枠は layout/shared-ui へ上げ、
 * ここには state 配線と Action 変換だけを残す。
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

  // 非決定性(now)は Shell(縁)で生成し、値として Core へ渡す（L3）。Core は生成しない。
  async function dispatch(make: (now: string) => Action) {
    const action = make(new Date().toISOString());
    const [next, effects] = update(state, action);
    setState(next);
    for (const e of effects) await runEffect(e); // 実行は runEffect に隔離（L4）
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
