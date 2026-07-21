# Spacta — AI-First Vibe Coding Guide & Architecture

*Also available in: [日本語](ja/HUMAN_GUIDE.md)*

Welcome to Spacta. This guide outlines how Spacta lets each feature of your app live in its own bounded context — so neither you nor the AI ever has to hold the whole app in your head — and mechanically proves that boundary holds.

---

## 0. What is Spacta

Spacta is built around a few core ideas, in order of importance:

1. **Context Isolation**: Building something Amazon-sized as a Next.js app runs into two separate problems. First, Next.js tightly couples UI and state management, so a single feature change can ripple through broad, tangled logic elsewhere — and there is no mechanical way to confirm it didn't; you're left checking it yourself. Second, even if an AI could untangle that, doing so means holding the whole app's state and logic in context for every single task, which makes each task harder to reason about correctly — not just more expensive to run. Even five years from now, when models can hold the entire codebase in context, that alone won't fix either problem: reading everything isn't the same as guaranteeing that a change to checkout didn't quietly break inventory.
Spacta's answer is physical isolation — every feature is boxed into its own directory (`core.ts` / `shell.tsx` / edge files) and cannot import another feature's internals. When you (or an AI) touch one feature, you only ever need that feature's own files — not the whole `app/` tree, and not the causal tangle it hides. In early evaluations, multiple independent AI agents implemented separate features in parallel against a frozen contract and integrated with zero collisions. This is one of two separate ways Spacta cuts a task down to something AI can reliably handle — the other is trading implicit logic for explicit, verbose structure, covered under *AI Writes, Humans Fine-tune* below.
2. **Contract-driven development**: Each feature exposes a frozen `types.ts` (its `State` / `Action` / `Effect` shapes). Because the contract is fixed upfront, a feature can be implemented independently — by you, by an AI, or by several AI agents working on different features in parallel — without anyone needing to coordinate on the internals.
3. **Mechanical verification (no hope-prompts)**: Telling an AI "please don't put a fetch in this file" in a prompt is a *hope-prompt* — you're hoping it remembers, with no way to check. Spacta backs the isolation claim above with a script (`npm run verify`) that reads the actual code and fails the build if a boundary was crossed. You don't have to trust that isolation held — you can check it.
4. **The Gardener**: Moving fast means UI code accumulates one-off Tailwind values and duplicated markup. `npm run garden` runs an AI pass that consolidates this drift into shared, semantic UI primitives, so speed today doesn't turn into a mess later.

---

## 1. Bridging Spacta and Next.js

If you have built Next.js apps before, Spacta reorganizes your code to keep the AI from entangling features. Here is how Spacta's boundary concepts map to standard Next.js building blocks:

| Spacta Component | Next.js Mapping & Role | Directory |
| :--- | :--- | :--- |
| **Core** | **Pure Logic Layer**. Reducer-like functions (`init`, `update`). Contains zero async operations, zero fetches, and no dynamic date/time generation. Safe to run anywhere. | `features/*/core.ts` |
| **Shell** | **Client Component State Wiring**. Binds the state to UI layout. Translates user interactions into `Action`s. | `features/*/shell.tsx` |
| **Source** (Edge) | **Non-deterministic Gateways**. Reads current time, generates UUIDs, or performs database/API fetch (RSC edge). | `shared/source.ts` |
| **Effect** | **Side-effect Executor**. The single point of dispatch for router navigation, toast notifications, and client fetch. | `shared/runEffect.ts` |

### Paradigm Comparison: Standard Next.js vs. Spacta

To understand *why* Spacta imposes these strict boundaries, here is how it contrasts with standard Next.js development paradigms. Note that Spacta isolates on two distinct axes — the first two rows below are about *purity inside a feature* (Core vs. side-effects), the rest are about *boundaries between features and workflows*:

| Dimension | Standard Next.js | Spacta Architecture |
| :--- | :--- | :--- |
| **Concern Coupling** | State, async fetches (IO), date/time logic, and UI rendering are often tangled in React components. | **Complete Physical Separation**. Pure functional logic (`core.ts`) is strictly isolated from side-effects (`shell.tsx`, `runEffect.ts`). |
| **AI Collaboration** | AI must understand the coupled codebase, leading to unlimited context bloat and high mapping costs. | **Context Containment**. Allows the AI to work only within a separated feature context (not the entire application context), preventing accuracy degradation caused by attention context-switching costs. |
| **Rule Enforcement** | Guidelines exist in documentation or team conventions (**"Hope Prompts"**), which AI models easily ignore or forget. | **Mechanical Verification**. Backs up the isolation claim above: strict boundaries (feature isolation, core purity) are audited and enforced by AST parsing (`npm run verify`). |
| **Data Flow** | State changes, API fetches, and side-effects are scattered across various hooks, causing complex, unpredictable events. | **Single Unidirectional Loop**. Data flows strictly in one closed loop: `UI ➔ Action ➔ Pure Core ➔ New State & Effect ➔ runEffect ➔ UI`. |
| **Visual Maintenance** | Human/AI developers spend manual effort refactoring inline Tailwind values, color names, and layout duplicates. | **Automated Gardening**. An AI gardener (`npm run garden`) aggregates raw styling code into semantic tokens and shared UI primitives. |

---

## 2. The Data Flow Loop

Rather than scattering async states, data flows in a single predictable loop:

```txt
[UI (Shell / Component)] ➔ Action ➔ [Core (core.ts / Pure)] ➔ New State & Effect
           ▲                                                      │         │
           │───────────── Rerenders UI with New State ────────────┘         ▼
           └────────────── Returns result as a new Action ─────────── [runEffect.ts]
```

### Before vs. After Code Comparison

#### Before (Coupled Next.js Component)
A typical React component containing UI, non-deterministic values (`new Date()`), and side effects (`fetch`) tangled together. This is highly prone to AI regression.

```typescript
// src/components/Counter.tsx (Client Component)
'use client';
import { useState, useEffect } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    // ❌ Side Effect inside UI (untracked)
    fetch(`/api/log?count=${count}`);
  }, [count]);

  const handleIncrement = () => {
    setCount(count + 1);
    // ❌ Non-deterministic value inside UI (untestable)
    setLastUpdated(new Date().toISOString());
  };

  return (
    <div>
      <p>Count: {count} (Updated: {lastUpdated})</p>
      <button onClick={handleIncrement}>Increment</button>
    </div>
  );
}
```

#### After (Spacta Separation)
The UI remains simple, while the calculations and side effects are separated. AI can safely regenerate the math in `core.ts` without touching your CSS.

```typescript
// 1. src/features/counter/core.ts (Pure calculations)
export function update(state: State, action: Action): { nextState: State; effect?: Effect } {
  switch (action.type) {
    case 'INCREMENT':
      return {
        nextState: {
          ...state,
          count: state.count + 1,
          lastUpdated: action.now, // ✅ Non-deterministic time injected from edge via Action
        },
        effect: { type: 'LOG_COUNT', count: state.count + 1 } // ✅ Declared, not executed
      };
  }
}

// 2. src/features/counter/shell.tsx (Thin UI Shell / State Hook)
'use client';
import { useReducer } from 'react';
import { update } from './core';

export function CounterShell({ initialNow }: { initialNow: string }) {
  const [state, dispatch] = useReducer(update, { count: 0, lastUpdated: initialNow });

  return (
    <div>
      <p>Count: {state.count} (Updated: {state.lastUpdated})</p>
      <button onClick={() => dispatch({ type: 'INCREMENT', now: new Date().toISOString() })}>
        Increment
      </button>
    </div>
  );
}
```

---

## 3. The Core Vision: AI Writes, Humans Fine-tune

In standard development, writing state machines, validation rules, and integration boilerplate is tedious. Under the Spacta model:

* **AI-First Development**: **AI writes 100% of the initial codebase**—both the pure business logic in `core.ts` and the UI structure in `shell.tsx` or `components/`.
* **Optional Human Intervention**: You are not a mandatory bottleneck. This isn't about AI being "smarter" at logic and humans "smarter" at design — it's about relative fit. AI's edge shows up in dense, mechanical, repetitive structure it has seen countless times before (reducers, validation rules, state transitions). What it has no real access to is your tacit judgment: the accumulated feel for what looks and works right, and the ability to eyeball the whole picture while writing. That's exactly the kind of judgment pixel-perfect UI work demands — which is why it's the one place you're explicitly invited to step in. Because `shell.tsx` never touches `core.ts`'s logic, tweaking the UI is safe by construction, not just by convention. If the AI's generation works, you can ship it. However, if the UI needs to be pixel-perfect, or if the design demands subjective refinement, **you can step in to tweak the layout, styles, or CSS at any time**. 
* **Explicit Structure Lowers Complexity, Not Just Volume**: Verbosity that would exhaust a human to write by hand — exhaustive switch cases, an explicit `Action`/`Effect` type for every branch — doesn't just avoid costing AI accuracy; it actively lowers the complexity of the task itself. An exhaustive, explicit state machine turns "trace the hidden interactions and infer what should happen" into "fill in the one case that's missing" — a mechanical, pattern-matchable task, not a judgment call. The failure mode to worry about is compressed, implicit logic, not verbose, explicit logic. *(Note this pulls against isolation's cost story: isolation shrinks the input context an AI has to read, while explicit state-machine structure grows the output it has to write. Whether that nets out cheaper or more expensive at scale hasn't been measured — flagged here as an open question, not a settled claim.)*
* **Zero Arbitrary Percentages**: There are no rigid quotas (like "90% AI / 10% Human"). You choose when and where to write code.

---

## 4. Why AST-based Verification? (`npm run verify`)

Isolation is only as good as your ability to trust it. AI models tend to hallucinate or forget instructions (e.g., *"please do not write new Date() inside core"*), so Spacta doesn't ask you to trust that the boundary held — it replaces "hope prompts" with **mechanical verification** via a TypeScript AST parser (`verify.mjs`).

* **L1 Isolation**: Banning cross-feature imports ensures that the AI can work on Feature B without loading or breaking Feature A.
* **L2 Purity**: Core files are physically audited to ensure no IO, fetches, or time generation slip in.
* **The Ref's Job**: The verifier is your referee. As a vibe coder, you don't need to double-check the AI's architectural discipline. If `npm run verify` turns green, the boundaries are intact.

---

## 5. The Gardener Workflow & Mindset (`npm run garden`)

* **Write Fast, Refactor Later**: While you or the AI write UI, feel free to use inline arbitrary Tailwind values (like `bg-[#ff0000]`) or duplicate layout markup to move fast.
* **Gardener Refactoring**: Running `npm run garden` instructs the AI gardener to refactor raw colors/spacing, consolidate layout duplicates, and pull them into shared UI primitives (`src/shared/ui`).
* **Vibe Coder Mindset**: The AI gardener's refactoring is heuristic and might occasionally require small visual adjustments. Accept that the output might not be perfect in exchange for high-velocity prototyping.
* **Still Backed by Verification**: Gardening is never a free pass around the boundaries above — every gardening task must keep `npm run verify` green, and if a change would break isolation or purity, it's reverted rather than kept.

---

## Next Steps
* To set up a new project, follow [docs_HUMAN-ONLY/setup.md](setup.md).
* For the detailed design logs of Spacta's alpha evaluations, refer to [docs_HUMAN-ONLY/spacta-alpha-evaluation.md](spacta-alpha-evaluation.md).
