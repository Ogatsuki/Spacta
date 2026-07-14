# Spacta — AI-First Vibe Coding Guide & Architecture

Welcome to Spacta. 
Spacts is a AI-friendly framework for vibe coder width Next.js App.

When we develop Next.js App, the logic and code will go to entangled and complicated one, that is no garanteed the "correct code" and no way to find out wrong logic point automatically.
This is Human-frirendly because the common components reduce total code ammount Human writes and  to maintenance but not for not AI-friendly.
one task need AI to read lots of file that is impor



---

## 0. What is Spacta


Spacta has 3 features mainly.

1. 


## 1. The Core Vision: AI Writes, Humans Fine-tune

In standard development, writing state machines, validation rules, and integration boilerplate is tedious. Under the Spacta model:

* **AI-First Development**: **AI writes 100% of the initial codebase**—both the pure business logic in `core.ts` and the UI structure in `shell.tsx` or `components/`.
* **Optional Human Intervention**: You are not a mandatory bottleneck. If the AI's generation works, you can ship it. However, if the UI needs to be pixel-perfect, or if the design demands subjective refinement, **you can step in to tweak the layout, styles, or CSS at any time**. 

---

## 2. Bridging Spacta and Next.js

If you have built Next.js apps before, Spacta reorganizes your code to keep the AI from entangling features. Here is how Spacta's boundary concepts map to standard Next.js building blocks:

| Spacta Component | Next.js Mapping & Role | Directory |
| :--- | :--- | :--- |
| **Core** | **Pure Logic Layer**. Reducer-like functions (`init`, `update`). Contains zero async operations, zero fetches, and no dynamic date/time generation. Safe to run anywhere. | `features/*/core.ts` |
| **Shell** | **Client Component State Wiring**. Binds the state to UI layout. Translates user interactions into `Action`s. | `features/*/shell.tsx` |
| **Source** (Edge) | **Non-deterministic Gateways**. Reads current time, generates UUIDs, or performs database/API fetch (RSC edge). | `shared/source.ts` |
| **Effect** | **Side-effect Executor**. The single point of dispatch for router navigation, toast notifications, and client fetch. | `shared/runEffect.ts` |

### Paradigm Comparison: Standard Next.js vs. Spacta

To understand *why* Spacta imposes these strict boundaries, here is how it contrasts with standard Next.js development paradigms:

| Dimension | Standard Next.js | Spacta Architecture |
| :--- | :--- | :--- |
| **Concern Coupling** | State, async fetches (IO), date/time logic, and UI rendering are often tangled in React components. | **Complete Physical Separation**. Pure functional logic (`core.ts`) is strictly isolated from side-effects (`shell.tsx`, `runEffect.ts`). |
| **Rule Enforcement** | Guidelines exist in documentation or team conventions (**"Hope Prompts"**), which AI models easily ignore or forget. | **Mechanical Verification**. Strict boundaries (feature isolation, core purity) are audited and enforced by AST parsing (`npm run verify`). |
| **Data Flow** | State changes, API fetches, and side-effects are scattered across various hooks, causing complex, unpredictable events. | **Single Unidirectional Loop**. Data flows strictly in one closed loop: `UI ➔ Action ➔ Pure Core ➔ New State & Effect ➔ runEffect ➔ UI`. |
| **AI Collaboration** | AI must understand the coupled codebase, leading to unlimited context bloat and high mapping costs. | **Context Containment**. Allows the AI to work only within a separated feature context (not the entire application context), preventing accuracy degradation caused by attention context-switching costs. |
| **Visual Maintenance** | Human/AI developers spend manual effort refactoring inline Tailwind values, color names, and layout duplicates. | **Automated Gardening**. An AI gardener (`npm run garden`) aggregates raw styling code into semantic tokens and shared UI primitives. |

---

## 3. The Data Flow Loop

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

## 4. Why AST-based Verification? (`npm run verify`)

AI models tend to hallucinate or forget instructions (e.g., *"please do not write new Date() inside core"*). Spacta replaces "hope prompts" with **mechanical verification** via a TypeScript AST parser (`verify.mjs`).

* **L1 Isolation**: Banning cross-feature imports ensures that the AI can work on Feature B without loading or breaking Feature A.
* **L2 Purity**: Core files are physically audited to ensure no IO, fetches, or time generation slip in.
* **The Ref's Job**: The verifier is your referee. As a vibe coder, you don't need to double-check the AI's architectural discipline. If `npm run verify` turns green, the boundaries are intact.

---

## 5. The Gardener Workflow & Mindset (`npm run garden`)

* **Write Fast, Refactor Later**: While you or the AI write UI, feel free to use inline arbitrary Tailwind values (like `bg-[#ff0000]`) or duplicate layout markup to move fast.
* **Gardener Refactoring**: Running `npm run garden` instructs the AI gardener to refactor raw colors/spacing, consolidate layout duplicates, and pull them into shared UI primitives (`src/shared/ui`).
* **Vibe Coder Mindset**: The AI gardener's refactoring is heuristic and might occasionally require small visual adjustments. Accept that the output might not be perfect in exchange for high-velocity prototyping.

---

## Next Steps
* To set up a new project, follow [docs_HUMAN-ONLY/setup.md](setup.md).
* For the detailed design logs of Spacta's alpha evaluations, refer to [docs_HUMAN-ONLY/spacta-alpha-evaluation.md](spacta-alpha-evaluation.md).
