# Spacta — AI Execution Rules

> **Important**: This document defines the execution rules only. Compliance is mechanically verified by `npm run verify`.
> Your job is not to "memorize the conventions" but to **fix the code until `verify` passes (returns green)**.
>
> **Trust Hierarchy**: Law (Physically enforced via failure) > Form (Default template, mutable) > Advice (`verify` info) > Judgment (Not inspected by tools, decided by AI and Human).
> As long as `verify` is green and the philosophy of §1 is followed, the details of the Form do not matter.

---

## The Rule of One Sentence

> **Only data crosses the Core boundary. No IO enters, and no calculation escapes.**

The Core (pure calculation) is a semipermeable membrane ("Spacta"). It only passes data (`State` / `Action` / `Effect` / `InitData`).
Side effects (network, time, random numbers, DOM rendering) never cross the membrane. All rules below are corollaries of this sentence.

---

## §1 Law — Immutable (Enforced by `npm run verify`)

| # | Law | Enforcing Tool |
|---|---|---|
| L1 | **Isolation**: Features must not import the internals of other features. | `verify` cross-feature-imports (AST) |
| L2 | **Purity**: Do not include IO in `*/core.ts` (`async`/`await`/`new Date`/`Date.now`/`Math.random`/`fetch`/`prisma`/`window`/`document`/`localStorage`). | `verify` core-purity (AST) |
| L3 | **Injection**: Pass non-determinism (time, random, IDs) as values in `InitData` or `Action` — **including values that come back from IO** (server-assigned IDs, failures). Do not generate them inside the Core. | Inbound: L2 / L9. Outbound: `verify` effect-return (an Effect built with `correlationId` requires an Action carrying one) + tsc exhaustiveness makes Core handle it. |
| L4 | **Exhaustiveness**: Switch blocks on `effect.type` must terminate with an exhaustiveness check (`assertNever` / `: never`). | `verify` effect-runtime (AST, all of `src/**` — including `shared/runEffect.ts`) |
| L5 | **Source Purity**: Server boundaries (`page.tsx` / `route.ts`) should only perform fetch/persistence, delegating aggregation/formatting to Core pure functions. Do not generate non-deterministic values (time, random, IDs) here; inject them. A value **returned by** IO (a DB-assigned id) is a Source read, not generation (L3). | `verify` source-purity (AST. ID/Time generation is `err`, `.reduce()` aggregation is `warn`) |
| L6 | **Verifier Self-Verification**: The verifier must **always reject** known violations planted in `verify/fixtures/`. | `verify` self-test (Meta-level protection) |
| L7 | **Reverse Dependency Prevention**: The shared layer (`shared/*`) must not import the internals of the feature layer (`features/*`). | `verify` shared-features-isolation (AST) |
| L8 | **Presentation Vocabulary** (info/burn-in): Do not write raw colors (`#hex`), arbitrary values (`bg-[...]`), non-semantic grayscale palettes, or hidden hardcoded color/opacity (`fuchsia-400/10`) in shell/components. Status colors and semantic tokens are allowed. This is a **minimum bar**: a project may impose a stricter vocabulary via `tailwind.config.ts` and its own prompts. | `verify` presentation-purity (AST. Non-blocking info check) |
| L9 | **Presentation Purity**: Do not perform IO or generate non-determinism in `features/*/components/*` or `shared/ui/*`. `react` and `next/link` are legitimate here; `fetch`, storage, `next/navigation`, time, random and uuid are not — declare an Effect instead. | `verify` presentation-behaviour (AST) |
| L10 | **Component Statelessness**: A file under `features/*/components/*` is a pure function of its props — no `useState` / `useReducer` / `useEffect` / `useLayoutEffect`. State lives in Core. `shared/ui` primitives may keep widget-local state (disclosure, focus, position), which is not domain state. | `verify` component-statelessness (AST) |

---

## §2 Form & §2.5 Judgment — Implementation Guidelines

Details of the Form and Judgment are decided contextually by you. The primary metric is keeping `verify` green. When in doubt, apply the following guidelines:

### Type Placement
*   **Single Owner**: Co-locate the type definition inside the file that consumes it.
*   **Local Shared**: Place in the representative file of the cluster (usually in `core.ts` where defaults are defined).
*   **True Shared Contract**: Place in `types.ts` directly under the feature.
*   **Discriminated Unions**: Keep membrane vocabulary (`Action` / `Effect` / `State` / `InitData`) in `types.ts` even if there is currently only one consumer.

### Layouts Go Up, Components Go In
*   **Frame**: Pull headers, navigation, and page layouts up to `app/layout.tsx` and `shared/ui/*`.
*   **Feature UI**: Place feature-specific UI components in `features/<name>/components/`. Duplication is allowed and preferred over coupling.
*   **Clone info is not an instruction**: a `clone` info is never a reason to add a cross-feature import (L1 forbids it), nor to promote a feature-specific component into `shared/ui`. Promote only after the same shape has actually repeated in two or more features.
*   **Shared UI**: `shared/ui` must only contain presentation primitives that are decoupled from feature-specific concepts (e.g. `Button`, `Card`). They must not import feature types (L7).

### Keep Shells Thin
*   **A `shell.tsx` is optional.** A feature with no interaction (`page.tsx` → `components/` only) does not need one. Do not create an empty shell just because `starter/` has one.
*   Move all pure judgments (save triggers, status transitions, threshold checks) from `shell.tsx` into pure functions in `core.ts`.
*   Once thin, you may split display elements into sibling files under `components/`. Do not create grandchild components.

---

## §4 Minimal Instructions to AI

1.  **Write logic in `*/core.ts` by default.** Receive non-deterministic values (time, IDs) as arguments from `InitData` or `Action` (L3).
2.  When adding an Effect, **add the case to the `runEffect` runtime case table**. Do not write custom switch statements in features if possible (L4).
3.  If you need aggregation at server boundaries (`page.tsx` / `route.ts`), **write a pure function in Core and call it** (L5). Do not generate IDs/time here.
4.  Once implementation is complete, **run `npm run verify` yourself and fix all errors until green** (L6).
5.  **Do not write raw colors or arbitrary values in UI**. Use the presentation vocabulary in `tailwind.config.ts` or `shared/ui` variants.
6.  **When delegating in parallel, materialize upstream layers first.** Write `shared/ui` and freeze `types.ts` as real files *before* parallelizing `components/`; write shells and `app/` last. Agents may run in parallel only within a layer whose upstream already exists on disk — **a prose description of an API is not a contract; only code is.** `verify` does not check this: build order is a procedure, not a property of the tree.
