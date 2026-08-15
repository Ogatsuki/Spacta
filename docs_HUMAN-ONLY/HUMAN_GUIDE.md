# Spacta — A Machine-Verified Architecture for Letting AI Write Next.js

The hard part of AI coding isn't "the AI can't write it" — it's **having no way to confirm that code reported as done hasn't broken something else.**

Spacta literally isolates each feature of a Next.js app into its own directory, and **a script verifies that the boundary hasn't been breached.** Enforcing the boundary improves both the LLM's answer accuracy and the codebase's maintainability.

Spacta physically separates, per feature, **a layer that only computes (Core) from a layer that touches the outside world.** We call that boundary the **membrane**.

> **Only data crosses the membrane. No IO goes in, no computation comes out.**

*This document was written by AI. there is a file I wrote.[HUMAN_GUIDE_human-write.md](HUMAN_GUIDE_human-write.md)*

---

## How to read this document

Read only the chapters you need.

| Chapter | Content | Audience |
|---|---|---|
| **1. What problem does this solve** | Symptoms, root cause, Spacta's answer | Everyone |
| **2. How it works** | Directories, the loop, real code | People trying it out (Next.js knowledge required) |
| **3. What `verify` guarantees / doesn't** | What green actually means | People trying it out |
| **4. The actual work loop** | Division of labor between human and AI, how to build one feature | People trying it out |
| **5. Gardener** | Cleaning up the UI | People trying it out |
| **6. FAQ** | Existing apps, two features on one screen, testing, etc. | People trying it out |
| **7. What Spacta doesn't solve** | Structural limits | Evaluators |
| **8. Verifying the verifier** | Checking the theorem, mutation testing | Evaluators |
| **9. Current immaturity** | Things that change release to release | Evaluators |
| **10–11. Design background and outlook** | Philosophy, applications to other fields | If you're interested |

**Prerequisites:** Next.js **App Router** (Pages Router is out of scope) / React 18+ / TypeScript **`strict: true`** (exhaustiveness checking is the last line of defense, so this is effectively required). The database is unconstrained — fetching and persistence are outside Spacta's scope (§7-1).

**Command notation:** `npm run verify` below is shorthand for `node verify/verify.mjs .`, defined in `starter/package.json`. No npm package is published yet, so outside the starter, run the commands at the end ("Next steps") directly.

Other notes:

- The execution rules handed to the AI live in [`SPACTA.md`](../docs_AI-ONLY/SPACTA.md) (79 lines). The AI never reads this document.
- Background notes on design decisions are in the [Alpha Evaluation](spacta-alpha-evaluation.md).
- Setup instructions are in [setup.md](setup.md).
- This is a beta. Unverified claims remain. They're listed in §7–§9. Feedback is welcome.
- The foundation adopts FCIS (Functional Core, Imperative Shell).

---

## 1. What problem does this solve

### 1-1. The symptoms

When you have an AI write a Next.js app, this happens:

- **The AI reads a huge number of files for a small change.** Because UI, logic, and state management are coupled, fixing one spot requires understanding everything around it. It burns tokens and accuracy drops.
- **You ask it to fix `dashboard` and `home` breaks.** And the build passes anyway.
- **The AI reports "done."** There's no way to confirm the boundary was actually respected.

The third one is the heaviest. **Next.js grammatically permits tangled code, so unhealthy state management sails right through the build.**

### 1-2. The answer: physical isolation and mechanical verification

**Isolation.** `dashboard` and `home` are each closed inside their own directory. If one imports the other's internals, `verify` reads the syntax tree (AST) and turns red.

**Contract.** Each feature exposes its input/output types (`State` / `Action` / `Effect` / `InitData`) in `types.ts`. These four are the vocabulary that crosses the membrane. If you implement to satisfy the types, **the implementation is complete without reading a single line of another feature** (you do read `shared/ui` components — what you don't need to read is other features).

What you hand the AI isn't "the whole app's spec" but "one type contract."

In early evaluation, **with the human freezing the contract first**, multiple AI agents implemented separate features in parallel and merged with zero conflicts.

### 1-3. Don't use hope-prompts

Instructing via prompt, "please don't write `fetch` in this file," is a prose request unenforced by any tool. We call this a **hope-prompt**. There's no guarantee it's followed.

Worse, the more prohibitions you list, the more the AI's attention spreads thin. When things to watch for are scattered widely, the odds of dropping one during inference go up ([Alpha Evaluation α5](spacta-alpha-evaluation.md)).

Spacta moves prohibitions out of the prompt and into the verifier.

- Write the rule: "if IO is needed, *declare* an Effect from Core"
- Don't write the hope: "don't write `fetch` in Core"

The AI is freed from the work of "checking whether it's complying with the prompt." If it violates the rule, `verify` returns red, so it just fixes it until green.

### 1-4. State machines as a kind of AI-friendly verbosity

Spacta requires exhaustive switch statements and explicit typing on every branch. It's verbose for a human to write by hand, but **for an AI, generation cost is near zero and it's a form that reproduces accurately.**

The effect: the work of "trace hidden interactions to infer what should happen" turns into **the pattern-matchable work of "fill in the one missing case."** Judgment calls disappear, and `tsc` becomes the last check.

*(A note on cost: verbose code increases output tokens. Input tokens and reasoning cost go down from isolation. Whether the net is cheaper or more expensive hasn't been measured.)*

### 1-5. Green doesn't mean "no bugs"

Code that writes `count + 2` where it should write `count + 1` passes green just fine.

Green only means these three things:

- If there's a bug, it's contained inside one feature's core
- It's reproducible purely from `(initData, actions[])` (no hidden inputs)
- There's no spillover to other features at the code level (coupling via the data layer can still exist → §7-1)

Spacta doesn't prove the absence of implicit connections — **it removes unnecessary connections and routes what remains through the type contract.** As a result, "is this correct?" stops being a question that requires surveying the whole app and becomes **a question answerable by reading one pure function.** The fact that the object of reasoning fits in one file is what the AI-fit actually consists of.

### 1-6. What you can take away without the tool

Even without adopting Spacta, these five apply to any Next.js codebase:

1. **Put logic in pure functions.** Don't write `fetch`, `new Date()`, or `Math.random()` there
2. **Inject non-determinism as arguments.** Capture time and IDs outside and pass them in as values. **This includes server-issued IDs**
3. **Declare side effects instead of executing them.** Return what should happen as a value; concentrate execution in one place on the outside
4. **That execution loop is singular per project.** Writing two of them makes them diverge from each other (a concrete case is in §8-2)
5. **Pass initial data exactly once.** Don't let outside code poke at state mid-stream

`verify` is a device that stops you from forgetting these five. They hold even without the device.

---

## 2. How it works

`starter/` is the reference implementation — a minimal Next.js project that's green, and simultaneously the test subject for the verifier itself. The code below is excerpted from the real thing in `starter/src/features/sample/`.

### 2-1. Directories

```txt
src/
  features/
    sample/
      types.ts      # Contract. State / Action / Effect / InitData / Answer
      core.ts       # Pure logic. (state, action) => [nextState, effect[]]
      perform.ts    # Executes this feature's Effects (IO)
      shell.tsx      # JSX wiring only. Holds no state
      components/   # Pure functions of props. No useState, no fetch
  shared/
    spacta/
      runtime.ts    # Engine. Runs the Effect queue serially, always converts results back into Actions
      react.ts      # Binding adapter. Holds React state, captures time and IDs
    runEffect.ts    # Transport only (POST, return JSON). Doesn't know what's being sent
    source.ts       # Entry point for non-determinism. Time, UUIDs, DB/API fetches (server side)
    ui/             # Feature-agnostic display components (Button, Card…)
```

| Part | Role | Location |
|---|---|---|
| **Core** | Pure logic. `init` / `update`. Contains no async, fetch, or `new Date()`. Safe to run anywhere | `features/*/core.ts` |
| **Perform** | Executes that feature's Effects. Lives next to where the Effect vocabulary is declared (`types.ts`) | `features/*/perform.ts` |
| **Shell** | JSX wiring only. State to props, operations to `Action`. Holds no state of its own | `features/*/shell.tsx` |
| **Engine** | Runs the Effect queue serially and is the only place that calls `perform`. Always converts results into `Action` and hands them back to Core. Contains no domain branching, and knows neither React nor Next.js. **Not a place you edit** | `shared/spacta/runtime.ts` |
| **Binding adapter** | Holds state to trigger re-renders, and captures time and IDs. The one place where React/Next.js changes land | `shared/spacta/react.ts` |
| **Source** | Entry point for non-determinism. Time, UUIDs, DB/API fetches (server side) | `shared/source.ts` |
| **Transport** | Just POSTs and returns JSON. Names no vocabulary | `shared/runEffect.ts` |

**Why the Effect vocabulary is split per feature.** It used to be that `shared/runEffect.ts` was the single dispatch point for every Effect, and combined with L7 (`shared` can't import feature types), the `Effect` union ended up collected into one file shared across all features. Adding one Effect to feature A became an edit to a dependency of feature B — a coupling.

The criterion used to dismantle this:

> **Does it change when you add one more feature?**
> - **No** → **mechanism** (`post`, the engine) → fine to concentrate in one place
> - **Yes** → **vocabulary** (`Effect`, `Answer`) → don't concentrate it; let each feature own it

The shared declaration wasn't preventing coupling — it just looked managed. What binds two screens is the endpoint, not the declaration. Change `/api/bookmarks` and both break regardless of a shared declaration. **If two features need the same Effect, write it out in both** (duplication over coupling).

### 2-2. The data-flow loop

Instead of scattering state changes, data flows through one loop.

```txt
  [UI: shell.tsx / components]
            │  Action (user operation)
            ▼
  [Core: core.ts (pure)]
            │
            ├──▶ new State ──▶ re-render (back to UI)
            │
            └──▶ Effect[] (declaration of IO to run)
                        │
                        ▼
                  [Engine] ──▶ perform.ts (actual IO)
                        │
                        │  success or failure, always converted into an Action
                        └──────────────▶ back to Core
```

What matters is the last return line. **The result of an Effect — success or failure — always crosses the membrane back as an Action.** The reason the return-path wiring never gets forgotten is that the engine is built that way. There is exactly one implementation of the loop per project (the story behind this design is in §8-2).

### 2-3. Before / After

#### Before — a coupled Next.js component

The typical case where UI, non-determinism (`new Date()`), and side effects (`fetch`) all sit in the same place.

```tsx
// src/components/Counter.tsx
'use client';
import { useState, useEffect } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  const [lastTouched, setLastTouched] = useState('');

  useEffect(() => {
    fetch(`/api/log?count=${count}`);        // ❌ Side effect inside the UI (untraceable)
  }, [count]);

  const handleIncrement = () => {
    setCount(count + 1);
    setLastTouched(new Date().toISOString()); // ❌ Non-determinism inside the UI (untestable)
  };

  return (
    <div>
      <p>Count: {count} (Updated: {lastTouched})</p>
      <button onClick={handleIncrement}>Increment</button>
    </div>
  );
}
```

#### After — separated by Spacta

**One term first.** `correlationId` below is a **serial number for a write request.** After an optimistic update (update the screen first, send to the server after), Core uses it to match up which write a given result belongs to. **It's distinct from a server-issued ID** — it's minted on the client.

**① `types.ts` — the contract**

```ts
export type InitData = { now: string; initialCount: number };

export type State = {
  count: number;
  lastTouched: string;
  pending: string[];      // correlationIds of in-flight writes. Owned by Core (not Shell)
  notice: string | null;
};

// This feature's own Effect vocabulary. There is no shared union.
// Adding a member here changes nothing outside this directory.
export type Effect =
  | { type: "SAVE"; correlationId: string; key: string; value: string }
  | { type: "LOG"; message: string };

// The shape of the answer is also declared by the feature that asked the question.
export type Answer = { id: string };

export type Action =
  | { type: "INCREMENT"; now: string; correlationId: string }
  | { type: "RESET"; now: string }
  // Return path for writes. Core must handle both.
  // correlationId is null for the result of an Effect that isn't asking for an answer (LOG).
  | { type: "EFFECT_SUCCEEDED"; correlationId: string | null; data?: Answer }
  | { type: "EFFECT_FAILED";    correlationId: string | null; message: string };
```

**② `core.ts` — pure computation only**

```ts
export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      // Optimistic update: apply it first, record the write as in-flight
      const next: State = {
        ...state,
        count: state.count + 1,
        lastTouched: action.now,          // ✅ time is injected via the Action
        pending: [...state.pending, action.correlationId],
      };
      return [next, [{ type: "SAVE", correlationId: action.correlationId,
                       key: "count", value: String(next.count) }]]; // ✅ declared, not executed
    }

    case "EFFECT_SUCCEEDED": {
      if (action.correlationId === null) return [state, []];   // LOG's answer. Not a write
      // This counter has nowhere to store a server id, so it just clears the in-flight record.
      // A feature that keeps a saved row on screen adopts action.data.id here (see below).
      return [{ ...state, pending: state.pending.filter(c => c !== action.correlationId) }, []];
    }

    case "EFFECT_FAILED": {
      // Compensation. Roll back only the recorded write
      if (action.correlationId === null) return [state, []];
      if (!state.pending.includes(action.correlationId)) return [state, []];
      return [{ ...state,
                count: state.count - 1,   // ← whether this compensation is semantically correct is outside verify's scope (§1-5)
                pending: state.pending.filter(c => c !== action.correlationId),
                notice: action.message }, []];
    }

    case "RESET":
      return [{ ...state, count: 0, lastTouched: action.now },
              [{ type: "LOG", message: "reset" }]];

    default: {
      const _exhaustive: never = action;  // tsc fails if a branch is missing
      throw new Error(String(_exhaustive));
    }
  }
}
```

> **A feature that actually adopts `Answer` writes `EFFECT_SUCCEEDED` like this:**
>
> ```ts
> case "EFFECT_SUCCEEDED": {
>   if (action.correlationId === null) return [state, []];
>   const id = action.data?.id ?? null;
>   const rows = id === null
>     ? state.rows
>     : state.rows.map(r =>
>         r.tempId === action.correlationId
>           ? { ...r, id, tempId: null }        // ← replace the temp id with the server-issued id
>           : r);
>   return [{ ...state, rows,
>             pending: state.pending.filter(c => c !== action.correlationId) }, []];
> }
> ```
>
> **A bug where a feature that should use `action.data` doesn't actually use it has previously slipped through undetected** (§8-3). The counter above simply has nothing to adopt — it's not an example of "you don't need to adopt it."

**③ `perform.ts` — this feature's IO**

```ts
import { post } from "@/shared/runEffect";   // post<T>(url, payload): Promise<T | null>
import { assertNever } from "@/shared/types";
import type { Answer, Effect } from "./types";

export async function perform(effect: Effect): Promise<{ data?: Answer } | null> {
  switch (effect.type) {
    case "SAVE": {
      // The returned id is server-issued. It must not be generated inside Core
      const answer = await post<Answer>("/api/sample", { key: effect.key, value: effect.value });
      return answer && { data: answer };   // post returns null on 204
    }
    case "LOG":
      console.log(effect.message);
      return null;              // an Effect that doesn't ask for an answer has nothing to bring back
    default:
      return assertNever(effect);
  }
}
```

**④ `shell.tsx` — JSX wiring only**

```tsx
"use client";
import { useSpacta } from "@/shared/spacta/react";
import { CounterActions } from "./components/CounterActions";
import { CounterSummary } from "./components/CounterSummary";
import { init, summarize, update } from "./core";
import { perform } from "./perform";
import type { Action, Answer, Effect, InitData, State } from "./types";

export function SampleShell({ initData }: { initData: InitData }) {
  // State is held by the engine, which also runs the Effect queue serially.
  // now and id are captured outside the membrane (the adapter) and reach Core as Action values.
  const [state, dispatch] = useSpacta<State, Action, Effect, Answer>({
    init: () => init(initData), update, perform,
  });

  return (
    <section className="space-y-6">
      <CounterSummary
        count={state.count}
        lastTouched={state.lastTouched}
        summary={summarize(state)}      // display formatting also lives in a pure function (Core)
        pending={state.pending.length}
        notice={state.notice}
      />
      <CounterActions
        onIncrement={() =>
          dispatch((mint) => ({ type: "INCREMENT", now: mint.now, correlationId: mint.id() }))}
        onReset={() => dispatch((mint) => ({ type: "RESET", now: mint.now }))}
      />
    </section>
  );
}
```

There's no `useState`, `new Date()`, or `crypto.randomUUID()` in `shell.tsx`. That's because holding state, capturing non-determinism, and running the Effect loop are all mechanisms — not things you rewrite per feature.

> Note that **shell actually following this discipline is not checked.** `verify`'s output prints `Judgement kept out of shell.tsx → not checked`. This is one of the few places in Spacta a human still needs to look at.

### 2-4. Comparison with standard Next.js

| Aspect | Standard Next.js | Spacta |
|---|---|---|
| **Coupling of concerns** | State, fetch, time, and rendering mixed inside a component | **Physical separation.** `core.ts` is isolated from side effects |
| **AI collaboration** | Requires understanding the whole coupled codebase | **Bounded context.** Work can happen with just one feature's files |
| **Rule enforcement** | Documentation and team convention (hope-prompt). The AI can ignore or forget it | **Mechanical verification.** Enforced via AST analysis (`verify`) |
| **Data flow** | State changes, fetches, and side effects scattered across various hooks | **A single-direction loop.** UI → Action → Core → State & Effect → perform → Action |
| **Visual upkeep** | Manually refactor inline Tailwind values and duplicated layout | **Automated detection.** `garden` produces a cleanup work order (§5) |

---

## 3. What `verify` guarantees / doesn't

Isolation only means something if you can trust it. Instead of asserting "the boundary should be respected," Spacta walks TypeScript's syntax tree to check.

**There are 10 Laws.** Below are 7 representative ones — **L5, L6, and L8 are omitted here** (L6 is the verifier checking itself, covered below; L8 is informational only). All 10 are in [`SPACTA.md`](../docs_AI-ONLY/SPACTA.md).

| | Content |
|---|---|
| **L1 Isolation** | A feature doesn't import another feature's internals |
| **L2 Purity** | `core.ts` may contain no IO or non-determinism (`fetch` / `new Date` / `Math.random` / `await` …) |
| **L3 Injection** | Non-determinism is passed as a value. **This includes server-issued IDs** |
| **L4 Exhaustiveness** | A switch over `effect.type` must close exhaustively |
| **L7 No reverse dependency** | `shared/*` doesn't import `features/*` internals |
| **L9 / L10** | No IO and no `useState` in `components/` and `shared/ui`. Because this is where the most is delegated to the AI |

One addition to L4. There are two forms of closing exhaustively. Closing with `assertNever` / `: never` is the default, but **a feature that declares only one Effect can't write `never`, because TypeScript collapses a single-member union.** In that case, place the switch as the last statement of a function whose return type doesn't include `undefined` (adding a member then triggers TS2366).

**There is no exception mechanism for Laws** (no ignore / disable comments). Not having an escape hatch is a deliberate design choice. Only `garden`'s cleanup suggestions can be deferred, via `// garden:keep <reason>`, and even deferred items stay in the work order.

### Actual output

Every time `verify` runs, it prints what it scanned and how many, and what this particular green does and doesn't guarantee.

```
  Scanned:
    L1  cross-feature-imports         6 files   ✓ 0
    L2  core-purity                   1 files   ✓ 0
    ...
    —   engine-portability            1 files   ✓ 0
    —   data-layer-import             6 files   ✓ 0

  Tiers: sample T3
    A tier states what this project adopted, not a violation: no tier changes the exit code.

✓ Laws (L1, L2, L3, L4, L5, L7, L9, L10): No violations
✓ Blocking checks that are not Laws (engine-portability, data-layer-import): No violations

  Guaranteed by this green:
    L1  No feature imports another feature's internals  (6 files)
    ...
  NOT guaranteed by this green:
    - Type integrity (props / contracts)              → run `tsc --noEmit` separately
    - Judgement kept out of shell.tsx                 → not checked
    - Effect results actually reaching Core at runtime → partially checked
    - Write-path round trip in features below T3      → not checked
    - Semantic correctness                            → never checked
```

Before treating green as a reason to skip reading the diff, check these two lists. In particular:

- **Type integrity isn't included in green.** Run `tsc --noEmit` separately (the `--tsc` flag runs it together).
- **Shell staying free of judgment isn't included in green either.**

Run time is 0.8s for a 57-file project, 0.25s for the starter — fast enough to run every iteration.

### Tiers — printing what each feature adopted

`verify` prints green even for a feature that has only partially adopted Spacta. That doesn't mean the round trip was verified for that feature. So it prints, per feature, what was actually adopted.

| Tier | Meaning |
|---|---|
| **T1** | Has `core.ts` but declares no Effects (e.g. a read-only screen) |
| **T2** | Declares Effects, but doesn't carry a `correlationId`, or its return cases aren't all present. **The write-path round trip is not verified** |
| **T3** | Effects carry an identifier, and Core handles both success and failure. **The round trip closes** |

**Tier is determined automatically by `verify` from the shape of `core.ts`** (whether an Effect carries a `correlationId`, whether Core has both `EFFECT_SUCCEEDED` / `EFFECT_FAILED` cases). It is not self-reported.

**But it's a judgment of shape, not a guarantee the round trip is meaningfully correct.** There were, in fact, two features judged T3 that had zero behavioral tests (§8-3). Tier displays how much of Spacta was adopted — it's not a guarantee of correct behavior.

**Tier is not a violation, so it never turns red and never changes the exit code.** Forcing a round trip on a feature that doesn't need one is overreach, and it trains users to ignore warnings. What a partial adopter gets back is a sense of safety that isn't actually backed by anything — which is worse than no guarantee at all.

### Other mechanics

**Checks that stop green without being a Law.** The Laws stay at 10; separately there are 2 checks that stop green (the engine may not import `react`/`next`; a feature may not import the data layer). Because these aren't properties Spacta claims universally, they aren't the 11th Law.

**Zero files scanned is not green.** When the number of files scanned is zero, `verify` returns `INCONCLUSIVE` (exit code 2) instead of claiming green. "No violations found" and "nothing was looked at" mean the same thing if you can't tell them apart.

**L6 verifies the verifier itself.** That it always rejects known violations planted in `verify/fixtures/`, that it doesn't false-positive on healthy specimens, and that every glob in the registry selects at least one file in the reference corpus. The third exists because a check with a typo'd glob that scanned zero files once passed its own self-test while reporting green.

**L1 only sees static imports.** It walks `import ... from "..."` declarations. **It does not see dynamic `import()`, `require()`, or a string-built path.** It's meant to catch unintentional violations, not to prevent deliberate ones.

---

## 4. The actual work loop

### 4-1. The AI writes the implementation. The human's job is "freeze" and "order"

* **The AI writes all of the implementation** — the pure logic in `core.ts` as well as the UI structure in `shell.tsx` and `components/`.

* **Two jobs remain for the human, and neither is optional.**
  1. **Freeze the contract (`types.ts`) first.** This is the condition under which §1-2's "zero conflicts" held. The AI can write it, but a human is the one who locks it in
  2. **Nail down upstream as real files before delegating downstream.** The order is `shared/ui` → `components/` → `shell` → `app/`. **A prose description of an API is not a contract. Only code is a contract** (§7-3)

  Skip either of these and Laws stay green while parallel work collides anyway.

* **What's optional is UI polish.** What AI is good at is the mechanical, repetitive structure heavily represented in training data — reducers, validation, state transitions. What AI can't reach is the accumulated sense of "what looks right and works right." Because `shell.tsx` never touches `core.ts`'s logic, adjusting the UI is structurally safe. If what's generated works fine, ship it as-is.

### 4-2. How to build one feature

```
1. Human      Write State / Action / Effect / InitData in features/todo/types.ts and freeze it
                 ↓
2. Human→AI   "Read SPACTA.md and features/todo/types.ts, and implement core.ts"
                 ※ No other feature's files are handed over. This is the whole point of Spacta
                 ↓
3. AI         Implement → verify → fix it yourself if red → repeat until green
                 ↓
4. Human      Also check types with verify --tsc (type integrity isn't part of verify's green)
                 ↓
5. AI         Implement perform.ts → components/ → shell.tsx (same loop)
                 ※ In upstream-first order. If delegating in parallel, only once upstream is real files
                 ↓
6. Human      Adjust the look, or run garden to get a cleanup work order (§5)
```

What you hand the AI is just **`SPACTA.md` (79 lines) and that feature's `types.ts`.** Not other features' files, and not this human-facing guide either.

---

## 5. Gardener (`garden`)

The faster you write, the more ad-hoc Tailwind values (`bg-[#ff0000]`) and duplicated markup accumulate in the UI code.

**`garden` itself doesn't call an LLM.** It's a deterministic script that collects `verify`'s info/warn output (things the machine detects but that had no one assigned to fix them) and turns them into a machine-actionable work order JSON (`garden-report.json`). Because detection and fixing are kept separate, **running `garden` does not change any code.**

- Feel free to be sloppy while writing
- Once `garden` produces a work order, hand it to a coding agent (Claude Code, etc.) to execute. **That decision and the cost are on the user**
- If `verify` is red, the work order carries no tasks (fixing Laws comes before tidying up)
- A deliberate deferral can be marked on the line with `// garden:keep <reason>`. Deferred items stay in the work order
- `verify` must still be green after cleanup. **Roll back with git** — the tool itself doesn't roll anything back

*One more note: keeping the UI visually consistent can't be maintained closed within a single feature. When aligning design across pages, we recommend reviewing multiple features' UI side by side while adjusting (this doesn't violate isolation, since it isn't an import). This is a recommendation for the tuning phase, not a rule for how implementation work is divided.*

---

## 6. FAQ

**Q. Can this be added to an existing Next.js app afterward?**
Structurally, yes. `verify` prints a tier per feature, so you can migrate features one at a time and raise them from T1 → T3. That said, there's no existing case of retrofitting an app yet.

**Q. What if I want two features on one screen?**
`app/page.tsx` (the server boundary) can lay out both shells side by side. **L1 only walks inside `src/features/`, so `app/` is free to import multiple features.** The two features don't share state, though. If you find yourself wanting to share it, that may be a sign it's actually one feature.

**Q. What about state shared across all features, like auth?**
Read it at the server boundary (`app/**/page.tsx`) and **hand it out as part of each feature's `InitData`.** **Spacta has no client-side global store.** "Login state changed" is a new `InitData` (i.e. a navigation or reload), not an Effect.

**Q. Where do forms and routing go?**
Form state lives in the feature's `State`, submission is an `Effect`, and validation is a pure function in `core.ts`. Routing becomes an Effect like `NAVIGATE`, executed from `perform.ts` (`next/navigation` is forbidden inside components — L9).

**Q. Can I use Server Actions?**
Not forbidden, but not recommended either. Spacta's position is "IO exits through a single path via `perform`," and Server Actions carve a second path outside that. As noted in §7-2, Next.js's implicit machinery is an area Spacta's Laws largely let pass through.

**Q. How do I write tests?**
`core.ts` is a pure function, so you just pass `(state, action)` and check the return value. No framework needed. What Spacta actually recommends is **writing behavioral assertions.** A feature without them can be broken without anyone detecting it (§8-3).

**Q. Are there exceptions for Laws?**
No (§3).

---

## 7. What Spacta doesn't solve

This chapter lists the structural limits that remain no matter how many releases go by. The operating principle is: "having a hole is fine; hiding a hole is not."

As a premise: **Spacta by itself is not a paradigm shift.** It's one early implementation of the approach of "confining AI-written code to machine-verifiable structure."

**What's structurally solved:**

- Code-level coupling between features (L1 / L7)
- Implicit connections between logic and the outside world (L2 / L3) — Core's output is determined solely by `(state, action)`
- Forgotten branches (L4)
- The hope-prompt problem — a problem framing specific to the AI era, and Spacta's most original contribution

What follows is not solved.

### 7-1. Coupling through data

L1 forbids imports, but if a checkout feature and an inventory feature touch the same DB table or the same API, action-at-a-distance comes back through the data layer. It's structurally identical to the lesson microservices learned (remove code coupling and the coupling migrates into schema and protocol). **`verify` only looks at code.**

> *A measurement from a reference app (unpublished): feature zones total 64 files / 4,593 lines, versus **7 files / 1,250 lines for the data adapter layer.** The contract file (`shared/types.ts`) is 37 lines, so **the data layer is 33x the contract.** A single SQL constant, `TRACE_SELECT`, is shared across multiple features' read paths, so a decision to add one column to a table ripples through all of them at once. **L1 stays green.** What produced this coupling was a design choice — "assemble the read model on the source side" — that **none of the 10 Laws was for or against.***

`npm run measure` reports the usage spread of each shared symbol, so the amount of coupling can be measured. It can't be prevented.

### 7-2. Next.js's own implicitness

RSC cache semantics, revalidation timing, serialization across the client/server boundary — this is where Next.js's hardest-to-trace behavior lives, and Spacta's Laws mostly let it pass through untouched. On top of that, Next.js itself keeps evolving toward more implicit machinery — Server Actions, implicit fetch caching. **Spacta is pointed structurally against the direction the framework is moving.**

### 7-3. Changes to a shared upstream

L1 stops sideways coupling, L7 stops reverse coupling, but **no Law protects the correctly-directed vertical dependency** (`components` / `shell` → `shared/ui`). Rename a prop on `shared/ui`'s `Button` and everything downstream breaks at once — but what catches that is `tsc`, not `verify`. §4-1's "nail down upstream first" exists precisely for this reason.

### 7-4. Whether a feature is actually using the engine

L4 only fires when it finds "a switch branching on `effect.type`." **`verify` does not detect a feature that skipped the engine and wrote its own loop.** Consolidating the loop into a single implementation has made this structurally less likely, but it isn't closed by a check.

### 7-5. Semantic correctness

`count + 2` passes green (§1-5). `verify` checks boundaries, not meaning.

### 7-6. Where this sits on the ladder of assurance

Software assurance has stages:

> **Syntactic boundary checking (lint) → static analysis → property-based testing → model checking → formal proof**

Safety-critical systems (MISRA, ISO 26262, SPARK Ada, seL4) sit on the upper rungs. **Spacta's `verify` sits on the bottom rung — syntactic boundary checking.**

This is a deliberate choice. It's the lowest-cost rung, and the only one that fits into an AI's write→run→fix loop. No other rung stays affordable running every single iteration.

The path upward is structurally open. Core being a pure state machine means it can be fed directly into property-based testing or model checking as-is.

**In sum, it's true that "this only solves part of Next.js's problems."** But that part hits the mark for the specific goal of creating a unit AI agents can safely write in parallel. Not solving everything and solving one part correctly can both be true at once.

---

## 8. Verifying the verifier

This is where Spacta differs most from other architectural conventions. **It's not that checks exist — it's that there's a process for checking whether those checks actually work.**

### 8-1. The claimed theorem

A pure core has the property that just recording an Action log turns it into a flight recorder. Spacta's claimed theorem is:

> **If `verify` is green, a bug in feature F is (1) contained inside F, (2) reproducible purely from `(initData, actions[])`, and (3) has no hidden inputs.**

Rust's borrow checker has value not because the checker itself is special, but because the theorem "if this structural property holds, this whole class of bugs becomes impossible" has been proven. Spacta's theorem was initially just asserted, never checked.

### 8-2. Replay reconciliation, and what it found

`replay/` holds the reconciliation machinery. It records only `initData` and the sequence of Actions — not State (recording State would make reconciliation trivially succeed and verify nothing). Reconciliation re-derives state from that record using only `init` and `update`, and checks not just the final state but the intermediate state after each Action is applied.

Implementing this revealed **a real counterexample to part (2) of the theorem.** The Effect loop had been hand-written three times within the same project by the same author, and two of the three discarded the server's answer. Because the loop wasn't serialized, the final state from replaying the Action log didn't match what the user actually saw on screen.

This bug **survived while `verify` was green, `tsc` had zero errors, and E2E tests passed.** All three gates went blind at the same single point simultaneously.

The fix was structural, not another check. `shared/spacta/runtime.ts` became the sole implementation of the loop, and it unconditionally returns a result as an Action even for Effects with no identifier. **If the sole implementation is correct, the round trip stops being something you need to verify.** That said, per §7-4, this doesn't mean `verify` now traces the wiring itself.

Since then, part (2) has held for every scenario driven through the engine. Running the same scenarios through the old hand-written loops diverges.

### 8-3. Mutation testing — the reconciliation harness itself wasn't detecting anything

The process of "plant a hole, watch the check fail" was run five times, and **all five times something was found.** The heaviest one:

> Planting a hole where the `pageview` feature **doesn't adopt the server-issued ID** passed both 14 replay-reconciliation checks and 45 serialization-test assertions. Nothing caught it.

The one reason the round-trip mechanism exists had never once been checked for that feature. Because data left as a temp ID stays deterministic, the replay matches itself.

Five for five findings was enough to stop doing this by hand, so `tools/mutate.mjs` was built. It plants round-trip-breaking mutations into a T3 feature's `core.ts`, runs the behavioral gate, and **reports whichever mutations survived (i.e., went unchecked).**

The first run: **5 of 10 mutations survived.** Two features had zero behavioral assertions, and `verify` had judged both of them T3 (unsurprising, since they satisfied the shape). **Replay reconciliation caught 0 of the 10 mutations** — confirming in practice the design property that it only checks reproducibility. After fixes: 10 killed / 0 survived.

### 8-4. It also prints what it can't check

Data-layer sharing (§7-1) **never shows up in an in-process Action log.** So the theorem's "no spillover to other features" is unverifiable by this method, and reconciliation states that fact in its output every time.

As a side effect, this yields auditability. State transitions during an incident can be replayed deterministically, and "why did it end up in this state" can be answered with a record attached. The absence of bugs can't be proven, but after-the-fact traceability can be secured structurally.

---

## 9. Current immaturity

Content in this chapter changes release to release. It's a different kind of thing from the structural limits in §7.

- **The tooling is 30x the size of the Laws.** `verify.mjs` at 2,600+ lines guards `SPACTA.md`'s 79 lines. Single implementation, single author
- **The reference app is small.** 4 of its 10 features are T1 and never round-trip. Only 5 features exercise the flagship mechanism
- **No npm package is published.** For now, run `node verify/verify.mjs <projectRoot>` directly
- **Structure changes across minor versions.** Dismantling the shared `Effect` union (§2-1) is one example. **Expect breaking changes at this scale until 1.0.** Migrations are noted in the CHANGELOG
- **The central claim is measured on exactly one sample.** "The reference surface needed to add or change one feature doesn't grow" needs to be checked on an app in a different domain
- **Whether an AI given only `SPACTA.md` can build an app in a different domain** is unverified
- **Volume complexity doesn't decrease.** Spacta's membrane only separates behavioral complexity. Lines of JSX, CSS variation, and animation state counts don't shrink. This distinction is also unmeasured

---

## 10. Design background

*(Everything past this point is background. Skip it freely if you just want to use the tool. Also, the claims in these two chapters are outlooks — they don't have the empirical backing that §7–§8 do.)*

### 10-1. The trade rate changed

Both FCIS and Elm predate this. Neither went mainstream, for a simple reason: **it cost too much for a human to be worth it.** Exhaustive switch statements, explicit typing on every branch — the price a human paid in writing effort, in exchange for verifiability, was too high.

Generative AI changed that rate. For an AI, repetitive, explicit structure is near-zero cost to generate, and it's a form that reproduces accurately. **Once the writing cost disappears, verifiability is what's left over, as pure gain.**

> **In the AI era, the rate at which you trade "writing cost" for "verifiability" changed dramatically. Redo the design at the new rate.**

At the same time, AI brought a new problem along with it: a human can't tell at a glance whether a generated state machine is correct. Spacta wires both sides into one loop — using what AI is good at (mass-producing explicit structure) while plugging what AI can't guarantee (compliance) with `verify`. **The individual patterns are all borrowed; the design of this loop is what Spacta actually is.**

### 10-2. The real lineage isn't Elm — it's structured programming

If you thought "isn't this the same as Redux / Elm," that instinct is correct. What's new isn't the pattern — it's that the boundary is physically enforced and mechanically verified, rather than a convention.

But the lineage worth tracing, I think, isn't Elm — it's **structured programming.**

The core of Dijkstra's "goto considered harmful" was that goto makes control flow untraceable, which makes it impossible to *locally* reason about a program's correctness. In the 2013 Bookout v. Toyota case, an expert witness pointed to roughly 10,000 global variables and numerous MISRA violations in the engine control software. What decided the case wasn't proof that a bug existed — it was **the demonstration that this code's causality couldn't be reasoned about, period.** Untraceability itself became evidence of negligence.

Spacta's L1/L2 are the data-flow version of the same claim — call it **"implicit connections considered harmful."** The framing "don't eliminate bugs, make bugs local, explicit, and deterministic" sits squarely in this lineage.

But there's a lesson from history worth heeding here too. Structured programming became a paradigm shift not because it was a set of conventions, but because it got **baked into language specifications.** By that standard, Spacta is a convention plus a linter layered on top of Next.js. For it to become a paradigm shift, this constraint would need to be adopted at the framework or language layer.

---

## 11. Beyond Next.js

Carrying Spacta's thinking into other languages and fields reveals a counterintuitive asymmetry: **the value is thin in fields where mistakes aren't tolerated, and thick in fields where AI is writing huge amounts of code without a verification culture.**

### 11-1. Places with prior art (don't attack — learn)

- **Java / banking:** ArchUnit has been doing "check architectural boundaries at the AST level and fail the build" for close to a decade (equivalent to L1/L7). Event sourcing is exactly "deterministic replay from an Action log," and it grew directly out of audit requirements in ledger systems
- **Automotive / safety-critical:** MISRA, ISO 26262, static analysis, formal proof. Guarantees several rungs stronger than Spacta's syntactic checking are already mandated
- **Rust:** the most suggestive example. **The Rust compiler itself already functions as a "verify loop."** Have an AI write Rust and a loop naturally emerges — "fix it until the borrow checker passes" — isomorphic to Spacta's "fix it until green." This, I believe, is the real reason AI and Rust are said to fit well together

These are places to import design decisions from, not places to attack.

### 11-2. Domains where this thinking looks promising

1. **AI agents / LLM orchestration itself.** Right now, agent code — tool calls, retries, state management, prompt composition — is a young field with no architectural discipline. Turn the agent's control logic into a pure state machine (`(state, event) → (nextState, toolCall)`), push LLM calls and tool execution entirely to the edges, and **agent execution becomes fully replayable.** "Why did it call this tool at that moment" gets a deterministic answer from the log. Since it's the same TypeScript, Spacta's `verify` applies as-is
2. **As a working protocol for legacy migration** (C++→Rust, COBOL→Java). The real hard problem is "when multiple AI agents translate in parallel, how do you mechanically judge correctness" — the same problem shape as Spacta's early evaluation (parallel implementation against a frozen contract). But boundary linting alone isn't enough here; you also need to verify semantic equivalence, which raises the bar above (1)
3. **Mobile (SwiftUI / Jetpack Compose).** Swift's TCA is essentially "Elm for Swift," and the pattern is already established. What's missing is the verify-equivalent of mechanical enforcement, and the AI-loop design

### 11-3. Build per language, or cross languages

Decomposing Spacta into layers makes the answer visible.

- **Law (L1–L10, the thinking)** — fully language-independent. Can be written as a spec
- **Verifier** — needed per language (the AST is language-specific)
- **Form (directory layout, framework mapping)** — needed per framework

This is **the same structure as LSP (Language Server Protocol).** LSP spread to every language with "one protocol, a server per language." Cut the Laws out as a language-neutral spec, and each language community can implement the verifier as a plugin.

Another way to see it: in languages with an effect system, like Haskell or Koka, L2 comes free from the type system. In other words, **the verifier's real identity is a lint-based shim retrofitting the effect system and module boundaries that mainstream languages are missing.**

---

## Next steps

* **Setup:** [setup.md](setup.md)
* **Execution rules for the AI (79 lines):** [`SPACTA.md`](../docs_AI-ONLY/SPACTA.md)
* **Settled design decisions, and the checks that enforce them:** [`spacta-decisions.md`](../docs_AI-ONLY/spacta-decisions.md)
* **What's still unsettled:** [`spacta-open-questions.md`](../docs_AI-ONLY/spacta-open-questions.md)
* **Design notes (attention, cognitive load):** [Alpha Evaluation](spacta-alpha-evaluation.md)

How to run the tools (no npm package is published, so run these directly):

```sh
node verify/verify.mjs <projectRoot>          # boundary only
node verify/verify.mjs <projectRoot> --tsc    # boundary, then types
node metrics/measure.mjs <projectRoot>        # measure the spread of shared symbols
node garden/garden.mjs <projectRoot>          # emit the cleanup work order (JSON)
```

Also works with bun (`bun verify/verify.mjs <projectRoot>`). Point it at a directory that contains `src/` or `app/`. Point it anywhere else and it scans zero files, refuses to claim green, and returns exit code 2.

**The most useful feedback is two things: "this part is confusing" and "isn't this a claim `verify` doesn't actually check."**
