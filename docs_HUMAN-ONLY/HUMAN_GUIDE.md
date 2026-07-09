# Membrain Human Guide & Architectural Overview

Welcome to Membrain. This document provides a human-centric overview of the Membrain architecture, its philosophy, and developer guide.

> **Note for AI Developers**: Do not read this file. Refer directly to [MEMBRAIN.md](file:///MEMBRAIN.md) for execution rules.

---

## What is Membrain?

Membrain is a Next.js development architecture designed from the ground up to be **AI-friendly**. It optimizes the collaboration between humans and Generative AI (e.g., 90% AI / 10% Human workflow) by enforcing strict, tool-verified architectural boundaries.

The core metaphor of Membrain is a **semipermeable membrane** surrounding the business logic of your application.

> **The Membrane Rule**:
> *Only data crosses the Core boundary. No IO enters, and no calculation escapes.*

---

## Architectural Philosophy & Benefits

### 1. Token & Complexity Reduction
In standard React/Next.js projects, feature coupling makes the codebase hard for AI to reason about. AI must read dozens of files just to change a small button.
Membrain solves this via **L1 Isolation** (Cross-feature imports are banned). When modifying Feature B, you do not need to load or understand Feature A. This keeps the AI context window small and prevents regressions.

### 2. Core Purity
All business calculations must reside in pure, synchronous functions within `*/core.ts` (L2 Purity). There is no asynchronous logic, time generation, or API calls inside the Core. This makes logic highly testable, predictable, and simple for AI to generate.

### 3. AST-based Physical Enforcement
Prose instructions like "please do not import this" are easily forgotten by AI (and humans). We call these **hope prompts**.
Membrain replaces hope with **mechanical verification** (`verify.mjs` walking the TypeScript AST). If a rule is violated, `npm run verify` fails. The AI's job is not to memorize rules, but to fix code until the verifier turns green.

### 4. The Gardener Workflow
*   **Humans** write rapid layouts, inline Tailwind CSS (including arbitrary values like `bg-[#ff0000]`), and prototypes.
*   **AI** acts as the "gardener" (`npm run garden`) to clean up raw CSS values, refactor duplicates, and extract them into shared UI design tokens or variants.

---

## Folder Structure (Default Form)

```txt
app/layout.tsx                      ← Outer shell & frame shared across all pages
src/shared/ui/*                     ← Feature-independent UI primitives (Button, Card, etc.)
src/shared/runEffect.ts             ← The runtime where side-effects actually execute
src/shared/source.ts                ← The edge for reading non-deterministic inputs (time, API)
src/features/<feature_name>/
  ├── types.ts                      ← The membrane contract (discriminated unions)
  ├── core.ts                       ← Pure functions (init, update, summarize)
  ├── shell.tsx                     ← Thin UI shell wiring state and dispatching actions
  └── components/                   ← Feature-specific UI components (duplication allowed)
```

---

## Next Steps
*   To set up a new project, follow [docs_HUMAN-ONLY/setup.md](setup.md).
*   For the history, context, and detailed design logs of Membrain's alpha evaluations, refer to [docs_HUMAN-ONLY/membrain-alpha-evaluation.md](membrain-alpha-evaluation.md).
