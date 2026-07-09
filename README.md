# Membrain — Generative-AI-Friendly, AST-Enforced Architecture

> **"Only data crosses the Core boundary. No IO enters, and no calculation escapes."**

Membrain is an architectural pattern designed to optimize collaboration between human developers and generative AI agents. It establishes a strict, semipermeable membrane around your core business logic, physically enforcing boundaries through a TypeScript AST (Abstract Syntax Tree) verifier.

Traditional codebase conventions are "hope prompts"—moral guidelines written in markdown that AI agents easily forget or misinterpret. Membrain converts these guidelines into hard, mechanically-enforced invariants. If a rule is violated, `npm run verify` fails.

---

## Why Membrain? (Designed for AI Pair Programming)

When building applications with LLMs, codebases face two critical challenges: **Context Bloat** and **Regression Loops**. Membrain solves both by aligning code structure with the cognitive limits and strengths of AI:

1. **Token & Complexity Reduction**
   * **Horizontal Isolation (L1):** Features are strictly isolated. Feature B cannot import internals from Feature A. When modifying Feature B, you (and the LLM) only need to load Feature B's context. This drastically reduces prompt tokens and eliminates regression risk in unrelated modules.
   * **Pure Business Logic (L2):** The Core (`*/core.ts`) is a pure computational engine. There is zero DOM, zero network, and zero side effects. Pure state transitions are highly readable, easy for LLMs to reason about, and 100% testable.
2. **AST-Based Auto-Correction**
   * Instead of relying on manual code reviews to catch architectural drift, architectural boundaries are physically audited via the TypeScript AST. LLMs excel at correcting their own output when provided with precise, actionable compile/verify errors.
3. **Safe Parallel Development**
   * By freezing data contracts (`types.ts`) beforehand, multiple AI agents can work in parallel to build the Core, Shell, and Source layers independently without merge conflicts or boundary violations.

---

## The Membrane Pattern

The Core acts as a semipermeable membrane ("Membrain"). It only passes pure data structures: `State`, `Action`, `Effect`, and `InitData`.

```
                  [ SHELL / PAGE (Impure Edge) ]
                               │
            Injects InitData   │   Dispatches Action
            or Executes Effect │   from User Interaction
                               ▼
  ╔════════════════════════════╪════════════════════════════╗
  ║                        THE CORE                         ║
  ║                                                         ║
  ║   Pure, deterministic state transitions:                ║
  ║   (State, Action, InitData) => { State, Effect }        ║
  ║                                                         ║
  ║   - No async/await    - No Math.random()                ║
  ║   - No fetch()        - No new Date()                   ║
  ╚═════════════════════════════════════════════════════════╝
```

* **The Core (`core.ts`):** Pure computation. It receives `Action` + `State` (+ `InitData` for non-determinism) and returns the updated `State` along with a list of `Effect` instructions.
* **The Shell (`shell.tsx`):** Coordinates state, maps events to `Action` dispatches, and handles visual representation.
* **The Shared Runtime (`runEffect.ts`):** The single, centralized location where side effects (IO, API requests, database queries) are actually executed.

---

## The 8 Laws of Membrain

Every Membrain-compliant project enforces these rules automatically:

| Rule | Title | Description |
|---|---|---|
| **L1** | **Isolation** | Features must not import the internals of other features. Connections must go through public APIs, DBs, or URLs. |
| **L2** | **Purity** | No side effects or IO in `*/core.ts` (e.g., no `async/await`, `new Date()`, `Math.random()`, `fetch()`, `window`, etc.). |
| **L3** | **Injection** | Pass non-deterministic values (time, random seeds, UUIDs) as inputs in `InitData` or `Action`. Never generate them in the Core. |
| **L4** | **Exhaustiveness** | Execute Effects through `runEffect(...)`. Any handwritten `switch` on effects must terminate with `assertNever` (`: never`) to guarantee compile-time checks. |
| **L5** | **Source Purity** | Server/Page boundaries only perform fetch and persistence. They must delegate aggregation and formatting to Core pure functions, and inject time/UUIDs instead of generating them. |
| **L6** | **Self-Test** | The verifier must run against known violation fixtures in `verify/fixtures/` and prove it rejects them. This prevents meta-level drift. |
| **L7** | **No Reverse Dependency** | The shared layer (`shared/*`) must never import internals from the feature layer (`features/*`). |
| **L8** | **Presentation Purity** | UI elements must not hardcode raw colors (`#hex`), arbitrary Tailwind values (`bg-[...]`), or non-semantic grayscales. They must use the shared theme vocabulary. |

---

## Why AST Static Verification and Not Grep?

Traditional linting or simple grep scripts are easily bypassed. For instance, checking Core purity with `grep "Date.now"` misses `new Date()`. Comment blocks can also confuse regex matchers, resulting in false greens.

Membrain walks the TypeScript compiler's AST. It inspects the actual node syntax (e.g., `NewExpression` targeting `Date` or `AwaitExpression`), providing a robust boundary checker that cannot be fooled by comments or formatting.

---

## Directory Layout (Default Form)

```txt
my-app/
├── app/                  # Next.js App Router (Server Boundaries / Pages)
│   └── page.tsx          # Page Edge: reads Source, injects data, mounts Shell
├── verify/               # Zero-dependency AST Verifier & Fixtures
│   ├── verify.mjs        # AST Verification runner
│   └── fixtures/         # Correct/Incorrect code samples for L6 self-test
└── src/
    ├── shared/           # Common components and helpers
    │   ├── ui/           # Feature-agnostic presentation components (e.g., Button)
    │   ├── runEffect.ts  # The centralized Effect execution runtime
    │   └── source.ts     # The edge for reading non-deterministic values
    └── features/
        └── todo/         # Isolated feature directory
            ├── types.ts  # Membrane Vocabulary (State, Action, Effect, InitData)
            ├── core.ts   # Pure business logic (State transitions)
            └── shell.tsx # Feature UI layout & Action dispatcher
```

---

## Getting Started

Copy the pre-built `verify/` and `starter/` templates directly into your project:

```bash
# 1. Copy verification tools and the starter skeleton
cp -r Membrain/starter/*  my-app/
cp -r Membrain/verify     my-app/verify

# 2. Add validation scripts to package.json
# "verify": "node verify/verify.mjs ."

# 3. Verify compliance (ensures L6 self-test passes out-of-the-box)
npm run verify
```
