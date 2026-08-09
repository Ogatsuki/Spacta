/**
 * The binding adapter: the one file where React is allowed to be part of the mechanism.
 *
 * Two things that the engine deliberately does not know how to do land here. Holding state
 * so that a re-render is triggered when it changes — that is React itself, not Spacta — and
 * minting non-determinism (`now`, ids) at the edge, which is a platform question because
 * `new Date()` and `crypto.randomUUID()` are platform names. Core still receives both as
 * plain values, so L3 is unchanged by this file's existence.
 *
 * Everything React or Next.js may do to a Spacta app in the future — a new async idiom, a
 * new transition API, a new way of holding state — is supposed to land in this file and
 * nowhere else. That is the point of it being separate from `runtime.ts`: the engine is the
 * part that would survive a move to SwiftUI, and this is the part that would be rewritten.
 */
"use client";
import { useState, useSyncExternalStore } from "react";
import { createRuntime } from "./runtime";
import type { EffectSource, Perform, Recorder, Runtime, Update } from "./runtime";

/**
 * The non-determinism a Shell is allowed to hand to Core, minted fresh for one dispatch.
 * `now` is a value because one dispatch happens at one instant; `id` is a function because a
 * single Action may need two (a placeholder id and a correlation id) and they must differ.
 */
export type Mint = { now: string; id: () => string };

/**
 * Send an Action. Pass a plain Action when the feature needs nothing minted, or a function
 * when it does — the callback form exists so that the `new Date()` happens here, at the
 * edge, rather than inside a feature.
 */
export type Dispatch<A> = (action: A | ((mint: Mint) => A)) => void;

function mint(): Mint {
  return { now: new Date().toISOString(), id: () => crypto.randomUUID() };
}

/**
 * Wire a feature's `init` / `update` / `perform` into the engine and give the Shell back the
 * two things it needs: the current state, and a way to send an Action.
 *
 * A `useSpacta` call is the whole mechanism a `shell.tsx` is permitted to contain. What
 * remains after it is JSX wiring — state into props, callbacks into `dispatch` — which is
 * the only part of a shell that is about the feature.
 *
 * `update` is typed `Update<S, A, E, R>`, whose action parameter is `A | EffectOutcome<R>`; a
 * feature whose `Action` union has no place for the answer to a write will not compile here.
 */
export function useSpacta<S, A, E extends EffectSource, R = never>(opts: {
  init: () => S;
  update: Update<S, A, E, R>;
  perform: Perform<E, R>;
  /**
   * Passed straight through to the engine. Nothing is recorded unless a caller builds a recorder
   * and hands it in with the `initData` it built `init` from, which is why the production path
   * records nothing: it does not pass one. A shell that wants a flight recording is asking for
   * one deliberately, and it is the same recording the replay cross-check reads.
   */
  record?: Recorder<A, R>;
}): [S, Dispatch<A>] {
  // One runtime per mounted feature instance, created on first render and kept for the life
  // of the component. `init` is pure, so building it during render costs nothing.
  const [runtime] = useState<Runtime<S, A, R>>(() => createRuntime(opts));

  // The engine is an external store: it owns the state, React only reads it. The server
  // snapshot is the same function because `init(initData)` is deterministic — the whole
  // point of InitData is that the first render agrees on both sides.
  const state = useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);

  const [dispatch] = useState<Dispatch<A>>(() => (action: A | ((mint: Mint) => A)) => {
    // A generic `A` cannot be excluded from a union by `typeof`, so the narrowing is asserted
    // rather than inferred. It is sound: the membrane passes data and never behaviour, so a
    // function arriving here is always the minting callback and never an Action.
    runtime.dispatch(
      typeof action === "function" ? (action as (mint: Mint) => A)(mint()) : (action as A),
    );
  });

  return [state, dispatch];
}
