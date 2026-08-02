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
| L3 | **Injection**: Pass non-determinism (time, random, IDs) as values in `InitData` or `Action` — **including values that come back from IO** (server-assigned IDs, failures). Do not generate them inside the Core. | Inbound: L2 / L9. Outbound: **structure, not inspection** — the runtime in `shared/spacta` is the only caller of `runEffect`, and it turns *every* outcome into an Action unconditionally, so no code path can drop one. `update` receives `Action \| EffectOutcome`, so tsc rejects a feature with no place for the answer, and the exhaustiveness guard then forces a case for it. `verify` effect-return still requires the receptacle to exist. |
| L4 | **Exhaustiveness**: A switch on `effect.type` must be exhaustive, in one of two ways — terminate it with `assertNever` / a `: never` assignment, or, when the feature declares a single Effect and TypeScript's collapse of a one-element union makes `never` unwritable, make the switch the last statement of a function whose declared return type excludes `undefined`, so tsc reports TS2366 when a member is added. What is dispatched is **one Effect vocabulary per feature**, declared beside the `perform` that carries it out; the single dispatch *mechanism* is the runtime in `shared/spacta`, which is a loop and not a switch. | `verify` effect-runtime (AST, all of `src/**`) |
| L5 | **Source Purity**: Server boundaries and the frames around them should only perform fetch/persistence, delegating aggregation/formatting to Core pure functions. Do not generate non-deterministic values (time, random, IDs) here; inject them. A value **returned by** IO (a DB-assigned id) is a Source read, not generation (L3). | `verify` source-purity (AST. ID/Time generation is `err`, `.reduce()` aggregation is `warn`) |
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
*   **What remains in a shell is JSX wiring: state into props, callbacks into `dispatch`. Nothing else.** The mechanism a shell used to carry — holding state, minting `now` and ids, looping over Effects — belongs to the runtime and its React adapter (`shared/spacta`). Do not write `useState` for feature state, `new Date()` or `crypto.randomUUID()` in a feature: call `useSpacta` and let it mint. Non-determinism still reaches Core as Action values (L3); what changed is only who mints it.
*   Move all pure judgments (save triggers, status transitions, threshold checks) from `shell.tsx` into pure functions in `core.ts`.
*   Once thin, you may split display elements into sibling files under `components/`. Do not create grandchild components.

---

## §3 Scope — What Spacta Does Not Govern

Spacta governs how one screen behaves after it has loaded. Some things are deliberately outside that, and knowing which is which saves you from hunting for a rule that does not exist.

*   **Fetching and persistence are not Spacta's.** `shared/source/*` is imported by `app/**` — the server boundary — and by nothing else; no feature imports it. Data reaches a feature as `InitData`, once, at `init()`. Two features reading the same table are coupled, and no Law here sees that coupling. It is a declared hole rather than an oversight: `npm run measure` reports the `spread` of each shared symbol so the hole stays countable.
*   **An Effect brings back an id, not data.** A feature cannot fetch after the page has loaded. More data arrives as a new `InitData` — a navigation, or a reload — never as the answer to an Effect.
*   **One feature instance performs one Effect at a time.** The runtime serializes: an Action dispatched while an Effect is in flight waits behind it and is never applied to a stale state. That is what makes a run reproducible from `(initData, actions[])`, and it is paid for in concurrency — two independent writes from the same feature do not overlap.

---

## §4 Minimal Instructions to AI

1.  **Write logic in `*/core.ts` by default.** Receive non-deterministic values (time, IDs) as arguments from `InitData` or `Action` (L3).
2.  When adding an Effect, **declare it in your own feature's `types.ts` and add the case to your own `perform`** — the two live side by side, and adding one edits nothing outside your directory. Do not reach for a shared Effect union: an Effect almost always has one constructor, and putting it where every feature can see it makes one feature's vocabulary everybody's dependency. If a second feature needs the same Effect, **write it out again** rather than sharing the declaration (§2: duplication over coupling) — what actually binds two screens that write the same row is the endpoint, and a shared declaration never protected that. Terminate the switch exhaustively (L4).
3.  **Do not write your own effect loop.** Wire state through the runtime in `shared/spacta` and let it drain the queue. An Effect's outcome always comes back as an Action; your `update` must handle `EFFECT_SUCCEEDED` / `EFFECT_FAILED`. An Effect that asked for nothing (`NAVIGATE`, `LOG`) is answered too, with no `correlationId` — write the case that says your feature does nothing with it, rather than leaving the loop to skip it silently. There is one implementation of this loop and there must never be a second: a loop written twice is a loop that disagrees with itself, and the two copies that discarded the server's answer did so without any signal.
4.  If you need aggregation at server boundaries (`page.tsx` / `route.ts` / `layout.tsx`), **write a pure function in Core and call it** (L5). Do not generate IDs/time here.
5.  Once implementation is complete, **run `npm run verify` yourself and fix all errors until green** (L6).
6.  **Do not write raw colors or arbitrary values in UI**. Use the presentation vocabulary in `tailwind.config.ts` or `shared/ui` variants.
7.  **When delegating in parallel, materialize upstream layers first.** Write `shared/ui` and freeze `types.ts` as real files *before* parallelizing `components/`; write shells and `app/` last. Agents may run in parallel only within a layer whose upstream already exists on disk — **a prose description of an API is not a contract; only code is.** `verify` does not check this: build order is a procedure, not a property of the tree.
