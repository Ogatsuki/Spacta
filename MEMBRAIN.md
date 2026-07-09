# Membrain — Project Conventions (AI Rules)

> This document defines the execution rules only. Compliance is mechanically verified by `npm run verify`.
> Your job is not to "memorize the conventions" but to **fix the code until `verify` passes (returns green)**.
> For the history, context, and insights behind these rules, refer to `docs/membrain-alpha-evaluation.md` (Alpha Evaluation).
>
> Structure: **§0 Bootstrap** / **§1 Law (Invariant & Mechanically Enforced)** / **§2 Form (Decided in Phase 0 & Mutable)** / **§2.5 Judgment (Decided contextually by the implementing AI)** / **§3 Verification Contract** / **§4 Minimal Instructions to AI**
>
> **Trust Hierarchy**: Law (Physically enforced via failure) > Form (Default template, mutable) > Advice (`verify` info) > Judgment (Not inspected by tools, decided by AI and Human).
> This document only defines the "boundaries that must not be broken (§1)". **As long as `verify` is green and the philosophy of §1 is followed, the details of the Form do not matter.**

---

## Why Membrain? (AI-Friendly Architecture)

Membrain enforces strict boundary rules that highly align with LLM coding capabilities, making it an optimized environment for AI-driven development:
* **Token & Complexity Reduction**: 
  * Cross-feature imports are banned (L1). When modifying feature B, you do not need to read or understand feature A. This keeps context size small and prevents regression.
  * Business logic is pure (`*/core.ts`) with no IO/Side-effects (L2). State transitions can be written and updated cleanly without network or DOM noise.
* **Auto-Correction via AST Verification**:
  * Architectural rules are physically enforced by AST analysis (`verify.mjs`). If a rule is violated, run `npm run verify` and fix the errors iteratively.
* **Gardener Workflow**:
  * Humans can quickly write raw, rapid Tailwind CSS designs (including arbitrary values like `bg-[#ff0000]`).
  * The AI's job is to act as the "gardener" (`npm run garden`) to clean up these raw usages and extract them into shared UI design tokens or variants.

---

## §0 Bootstrap (First 5 Steps in Phase 0)

> **Do not write the verifier from scratch.** A complete implementation (`verify/verify.mjs`, including L6 self-verification) is bundled.

1. **Copy**: Copy the bundled `verify/` (verifier + fixtures), `garden/` (cleanup instruction generator), and `starter/` (verified template) directly under the root of your new project.
2. **Wire**: Add `"verify": "node verify/verify.mjs ."` and `"garden": "node garden/garden.mjs ."` to `package.json`, and make `verify` a CI gateway (see §3.4).
3. **Follow the Form**: Implement features following the **default form**: `src/features/<name>/{types,core,shell}` + `src/shared/{runEffect,source}` + `app/**/page.tsx`. The bundled verifier assumes this structure.
4. **Run**: Keep `npm run verify` green. The L6 self-test passing first is proof that the verifier is functioning.
5. **If you want to change the Form**: As stated in §2, the form is free. However, if you change it, make sure the target paths/rules in `verify/verify.mjs` are updated accordingly. The L6 self-test will detect any omissions. **Emptying the verifier's checks is strictly prohibited.**

> When in doubt, read `starter/README.md`. It contains the minimal code for time injection, `runEffect`, and `assertNever`.

---

## The Rule of One Sentence (All you need to remember)

> **Only data crosses the Core boundary. No IO enters, and no calculation escapes.**

The Core (pure calculation) is a semipermeable membrane ("Membrain"). It only passes data (`State` / `Action` / `Effect` / `InitData`).
Side effects (network, time, random numbers, DOM rendering) and external delegation of business calculation never cross the membrane.
All rules below are merely corollaries of this single sentence.

---

## §1 Law — Immutable. Each rule is enforced by a corresponding mechanical tool.

| # | Law | Enforcing Tool (Part of `npm run verify`) |
|---|---|---|
| L1 | **Isolation**: Features must not import the internals of other features. | `verify` cross-feature-imports (AST) |
| L2 | **Purity**: Do not include IO in `*/core.ts` (`async`/`await`/`new Date`/`Date.now`/`Math.random`/`fetch`/`prisma`/`window`/`document`/`localStorage`). | `verify` core-purity (**AST**, not grep) |
| L3 | **Injection**: Pass non-determinism (time, random, IDs) as values in `InitData` or `Action`. Do not generate them inside the Core. | Requires L2 to be "strictly enforced with no loopholes." Enforce via type definitions like `now: string`. |
| L4 | **Exhaustiveness**: Ideally, execute Effects through the shared runtime `runEffect(...)`. If handwritten `switch` is allowed, terminate it with `assertNever` / `: never`. | `verify` effect-runtime (AST check, not fooled by comments) |
| L5 | **Source Purity**: Server boundaries (`page.tsx` / `route.ts`) should only perform fetch/persistence, delegating aggregation/formatting to Core pure functions. Do not generate non-deterministic values (time, random, IDs) inside the boundary; inject them. | `verify` source-purity (**page.tsx + route.ts**. Non-deterministic generation triggers err / direct aggregation like `.reduce()` triggers warn) |
| L6 | **Verifier Self-Verification**: The verifier must **always reject** known violations planted in `verify/fixtures/`. | `verify` self-test (**Without this, L1–L5 revert to "hope" at the meta-level**) |
| L7 | **Reverse Dependency Prevention**: The shared layer (`shared/*`) must not import the internals of the feature layer (`features/*`). | `verify` shared-features-isolation (AST) |
| L8 | **Presentation Purity** (info/burn-in): Do not hardcode raw colors (`#hex`), arbitrary values (`bg-[...]`), non-semantic grayscale palettes (`gray`/`slate`/`white`/`black` series), or hidden hardcoded color/opacity (`fuchsia-400/10`, etc.) in shell/components. **Status colors** (`red`/`green`/`amber`/`blue` for status indication) and **semantic tokens** derived from `theme` (opacity allowed, e.g., `bg-primary/10`) are allowed. Use the presentation vocabulary from the `theme` (primitive values) and `shared/ui` recipes (`cva`/`tailwind-variants`). | `verify` presentation-purity (AST. **Info only / does not fail**. Detail of colors in `verify/README`. Promotion to fail will be decided after observation) |

Enforcing the Law in one sentence: **The Membrane Rule (One Sentence) + "The membrane is watched by tools, and the watchman itself is tested."**

---

## §2 Form — Decided in Phase 0. Free for each project.

As long as the Laws are satisfied by the tools, you can freely decide the following. However, **you must connect the chosen Form to the verification contract in §3**.

- File Structure: 3-way split of `types/core/shell` or another division (as long as **horizontal isolation** holds).
- Feature Granularity: Page-based or domain-based.
- Gateway: Placed inside features or shared.
- Shared Mutable State (e.g., Cart): **Treat it as a feature itself** with its own Core, accessed via Gateway (direct imports prohibited = subject to L1).
- Verification Tool Implementation: ESLint / dependency-cruiser / custom AST script (the **default is the bundled `verify/verify.mjs`**).
- SPEC template format.

> Details such as where to place types, how to split shells, and which logic to move to Core **are not fixed as Forms**. They are left to §2.5 (Judgment).

**Forms you should not choose**: Intentionally choosing a shape where difficult laws (especially L2/L4) *cannot be enforced*, thereby leaving the verifier empty.
As the price of freedom in Form, only L6 cannot be waived.

### Default Layer Structure (Implemented by `starter/`)

```txt
app/layout.tsx + shared/ui/*        ← Frame and presentation primitives (feature-independent. Variants co-located with cva/tailwind-variants)
tailwind.config.ts theme.extend     ← Sole source of presentation primitives (colors, spacing, border-radius)
features/<name>/{types,core,shell}  ← The feature itself (horizontally isolated)
features/<name>/components/         ← Feature-specific UI components (duplication allowed, localized)
contracts/*.ts                      ← Thin bridges of persistence/API contracts crossing features
```

---

## §2.5 Judgment — Decided contextually by the implementing AI. No tool inspection, no conventions defined.

> This is the **third realm, which is neither §1 (Law) nor §2 (Form)**. "The correct answer changes depending on the situation, so it is not defined in advance."
> When in doubt, apply the guidelines below. If still undecided, choose the option that keeps `verify` green and follows the philosophy of §1.

**Examples of what is left to Judgment (not exhaustive)**

- **Which logic to move to Core (Default is pushing to Core)**: When in doubt, write it in Core. Convert only the parts flagged red by `verify` L2/L4 (execution of DOM/communication/time/random) into Effect data, and push them to Shell / `runEffect`.
  Litmus test (1 question): If you strip React/DOM/communication/time and make it an "input -> output" function, does it still retain business meaning? If yes, it belongs in Core. Distinguish by whether it **executes** side effects or **only returns instructions (Effect data)**.
  We bias the default toward Core because misplacement cost is asymmetric (business logic leaking to Shell = expensive; UI concerns entering Core = harmless).
- **Where to place types**: Follow the "Type Placement" principles below (not a hard law).
- **Whether to split the shell**: Follow "Keep Shell Thin" below.
- **Whether to split or merge gateway/constants/source**: Decide based on feature scale. If small, a single file is fine.
- **Whether to split features**: Split when they become independent enough to require horizontal isolation. Do not split prematurely.

### Type Placement — Place "near the owner," raise to `types.ts` only when crossing the membrane.

| Category | Condition | Placement |
|---|---|---|
| Single Owner | Used in only one file | **Co-located** in that file |
| Local Shared | Used by a small cluster (2-3 files) | Representative file of the cluster |
| True Shared Contract | Passed across layers (Shell/Core/Source/API) | `types.ts` directly under the feature |
| Inter-feature Contract | Crossing DB/API/Persistence layers | `contracts/*.ts` |

- Only **true shared contracts** should be placed in `types.ts`. Do not spend your sharing budget on unshared types.
- **Exception (Membrane Vocabulary)**: Keep discriminated unions like `Action` / `Effect` / `State` / `InitData` in `types.ts` even if there is currently only one consumer.
- **How to choose the representative file (for local shared)**: The file that owns the **default value, generation, or primary constraints** of that type (e.g., placing threshold type `StrengthThresholds` in Core where defaults are defined). If there is no clear owner, bias toward Core (asymmetric misplacement cost).
- Two extremes to avoid: "Put everything in `types.ts` for now" and "Every module must have its own `types.ts`". Place them **only when local sharing actually occurs**.

### Connection Between Features — Do not import directly; use contracts or the environment.

- Connections between features should go through external boundaries like **API / DB / URL** by default, rather than direct imports (L1 violation).
- Place only data persistence contracts crossing DB/API/external services in `contracts/*.ts`. **Do not raise general types** (reversion to central type storage).
- If common UI components start requiring feature types, do not raise the types. Instead, make the components talk in primitives (`string` / `boolean` / `() => void`) (L7 philosophy).

### Layouts Go Up, Components Go In — Balancing UI Uniformity and Feature Independence

- **Share the frame (layout)**: Pull headers, navigation, and page shells up to `app/layout.tsx` and `shared/ui/*`, and share them across all features. The shell should only draw the contents of the main content area.
- **`shared/ui` only contains presentation primitives that do not know feature nouns**: E.g., `Button`, `Card`, `Badge`, `AppHeader`.
  They accept data as primitive props (e.g., `userName: string`) and must not import feature types, Gateways, or hooks (L7).
  **If `shared/ui` learns a feature noun, move it back into the feature immediately.**
- **Close components within features**: Place feature-specific UI components in `features/<name>/components/`.
  It is okay if similar components are duplicated across multiple features. **Duplication is cheaper than a bloated trunk.**
  Extracting to `shared/ui` should only be done *after* the same shape is actually repeated in two or more features. Do not extract preemptively.
- **Prevent visual drift with presentation vocabulary**: What is shared is not the completed UI, but the **vocabulary**. By default, divide into two layers:
  1. **Primitive values (colors, margins, border radius, typography scale) have `tailwind.config.ts`'s `theme.extend` as their sole source.** Editing here propagates utilities like `bg-primary` throughout the application.
  2. **Component appearance (variant bindings) is co-located with each component in `shared/ui` using `cva`/`tailwind-variants`** (components own their variants = shadcn/ui style). Do not collect them in a central `tokens.ts`.
  Do not write raw colors (`#xxx`), arbitrary values, or out-of-theme palettes directly (L8 detects as info, but does not fail). Do not mix presentation vocabulary into data `types.ts`.

### Shells Should Be "Thin", Not "Short". If It Is a Leaf, You May Split It.

`shell.tsx` is a **leaf** (called only by `app/**/page.tsx`, and no one imports the internal of the shell). `verify` does not impose line count gates on shells.

- **Allow long leaves. Do not allow thick leaves (leaves with judgment).** Thin means only drawing data returned by Core and converting user operations into Actions.
- First step: Move **pure judgments** (save triggers, terminal state handling, threshold checks, etc.) from shell to state transitions / pure functions in `core.ts`.
- **Conditions for splitting**: Once the shell is sufficiently "thin" with judgments removed, you may split display components into `components/` sibling files.
  Keep splitting flat (parent to direct child) and do not create grandchild components.
  Do not pass individual event handlers down through prop drilling; aggregate them into a single `dispatch(Action)` call.
- The criteria for splitting is not size but the **quality of the boundary**: `Gain = reduction in write overhead - increase in coupling across the boundary`.
  Minimize the "number of files touched for a typical edit," not the line count. If this number increases, keep it in a single file.

### Preventing Reverse Dependency in Shared Runtimes — Shared Must Not Know Features

Common runtimes like `shared/runEffect.ts` importing specific `features/*` types or modules is prohibited by L7. Solve this with one of the following:

1. **Colocate inside the feature**: Move `runEffect` to co-locate with the feature (`features/<name>/runEffect.ts`).
2. **Registry (Dispatcher) Pattern**: `shared/runEffect` only has type-independent interfaces, and registers handlers from each feature at runtime.
   * **Caution**: Using a registry relaxes static exhaustiveness checks (L4). Combine with startup assertions to verify runtime exhaustiveness.

---

## §3 Verification Contract (What Phase 0 output must satisfy)

Phase 0 (Opus or human) **must prepare** the following in addition to the code. A project can only claim to be "Membrain compliant" when these are met.

> **These are already satisfied by the bundled `verify/` (verifier + fixtures).** Phase 0's job is simply to copy and wire them (§0).
> Only when you change the Form or add a Law, confirm and update them to prevent breaking.

1. `npm run verify` executes each law and returns a **non-zero exit code** if there is any violation.
2. Place **intentionally broken test fixtures** (and correct fixtures to avoid false positives) in `verify/fixtures/`. Reference implementation in this repository:
   - `fixtures/bad-core.core.ts` (Core containing `new Date()`/`await`/`prisma`) ➔ Must be rejected by L2.
   - `fixtures/good.core.ts` (Clean core with injected values) ➔ Must **not be false-positived** by L2.
   - `fixtures/bad-cross-import.ts` (Importing adjacent feature) ➔ Must be rejected by L1.
   - `fixtures/bad-shell-switch.shell.tsx` (Handwritten Effect switch without exhaustiveness termination) ➔ Must be rejected by L4.
   - `fixtures/bad-shared-import.shared.ts` (Shared importing a feature) ➔ Must be rejected by L7.
   - `fixtures/good-shared.shared.ts` (Correct shared that does not know features) ➔ Must **not be false-positived** by L7.
   - `fixtures/bad-route.route.ts` (Generating `new Date`/`crypto.randomUUID` or direct aggregation with `.reduce()` in route) ➔ Must be rejected by L5 (non-deterministic generation is err / aggregation is warn).
   - `fixtures/good-route.route.ts` (Injected, fetch/persistence-only route) ➔ Must **not be false-positived** by L5.
   - `fixtures/bad-presentation.shell.tsx` (Direct write of raw color, arbitrary value, grayscale palette, or color/opacity) ➔ Must trigger L8 info.
   - `fixtures/good-presentation.shell.tsx` (Presentation using only theme utilities, status colors, and semantic tokens with opacity) ➔ Must **not be false-positived** by L8.
   - `fixtures/dead-export.types.ts` (Unreferenced export) ➔ Must trigger dead-export info.
   - `fixtures/single-owner-export.types.ts` (Export referenced by only one file) ➔ Must trigger single-owner-export info.
   - `fixtures/shared-export.types.ts` (Export referenced by two files) ➔ Must not false-positive dead/single-owner.
   - `fixtures/clone-a.shell.tsx` / `fixtures/clone-b.shell.tsx` (Identical UI with only className order changed) ➔ Must trigger clone info (absorbs Tailwind order variations through set comparison).
   - `fixtures/clone-distinct.shell.tsx` (UI with different structure and classNames) ➔ Must **not be false-positived** by clone.
   - `fixtures/clone-map-callback.shell.tsx` (Parent `<ul>` and child `<li>` returned in `.map()`) ➔ Parent-child nesting must **not be false-positived** by clone (excludes child JSX from parent comparison).
3. The self-test step of `verify` runs the verifier against these fixtures and **confirms all bad ones are rejected**.
   If any violation is bypassed (meaning the verifier is broken), fail the `verify` command itself.
4. Set `npm run verify` as a gate in CI (pre-commit / GitHub Actions). Verification on local only is no different from "hope".

> The verification contract guarantees **that the verifier is functioning**, not "whether the AI followed the conventions." The former is not trusted. Only the latter is trusted.
> Green `verify` does not mean completion. Verification checks structural compliance, not semantic correctness.
> **Note that `npm run verify` (without `--tsc`) does not include type checking.** Type safety is separate; unused imports or broken references left after type migration will be green in verify and only red in `tsc`. Always run `npm run verify:tsc` (or `tsc --noEmit`) to finish (§0.4 / §4.4).

> Reference implementation: `verify/verify.mjs` (TypeScript AST-based). `node verify/verify.mjs <projectRoot>`. See `verify/README.md` for details.

---

## §4 Minimal Instructions to AI (Only for things tools cannot catch, and humans/AI must do intentionally)

1. **Write logic in `*/core.ts` by default.** Move only the parts flagged red by `verify` L2/L4 to Shell/`runEffect` as Effect data. If you need time, random numbers, or IDs in Core, **do not generate them**; receive them from `InitData` or `Action` arguments (L3).
2. When adding an Effect, **add the corresponding case to the `runEffect` runtime case table**. Do not write custom switch statements in features (L4).
3. If you need aggregation at server boundaries (`page.tsx` / `route.ts`), **write a pure function in Core and call it** (L5). The same function can be used in tests. Do not generate non-deterministic values (time, random, IDs) at the boundary; read them at the edge of `source` and inject them as `InitData` or arguments.
4. Once implementation is complete, **run `npm run verify` yourself and fix it until it turns green**. Red is a "bug to be fixed," not a "noisy warning" (L6).
5. The correctness of the *intent* (correct behavior) is not inspected by tools. **Review the intent using human or advanced model brains**.
6. For details that the tool does not fail, **feel free to decide flexibly while keeping verify green** (§2.5). When in doubt, judge by "whether it is data crossing the membrane or edge concerns."
7. **When adding or heavily modifying UI, read existing presentation vocabulary (`theme` and `shared/ui` recipes) before implementation, and review whether it "looks like the same app" after implementation.** Do not write raw colors or arbitrary values; pull them from `theme`/`shared/ui` (L8 detects as info, but does not fail, so the final defense line is human review).
8. **Leave L8 as info.** Humans can write raw Tailwind or arbitrary values during prototyping. At milestones, the AI will **clean up (gardening)** and extract them into `theme` or `shared/ui` recipes. Explanatory search is loose for humans, gardening is strict for AI. Cleanup targets are listed by `npm run garden` in the **gardening cleanup document** (procedure/guardrails in `garden/GARDENER.md`).

> The minimal code for 1–3 is in `starter/`. Do not memorize; use it as your starting template.
>
> If you want to write "please be careful" or "do not forget" beyond this, it should be an invariant shifted to §1 (enforced by tools), not an instruction in §4.
> **If you want to add lines to this document, first question whether it can be enforced by a tool.** Any prose added will eventually be broken.
> For history, context, and insights, write them in `docs/membrain-alpha-evaluation.md`. This document is the trunk of execution rules, and trunks hate bloat.
