# Spacta Verify — Reference Implementation

The actual running implementation of `SPACTA.md` §1 (Laws) and §3 (Verification Contract).
This codebase serves as concrete proof of the core thesis: "Invariants are physically enforced by tools, not by prose."

## Why AST Analysis Over Simple Regex?

The Core purity check in the original benchmark protocol relied on regex scanning:

```sh
grep -rn "Date.now\|Math.random\|fetch(" src/features/*/core.ts   # ← Misses `new Date()`
```

This failed to detect `new Date()` calls and produced a **false green**. The `iotawise` codebase contained six instances of `new Date()` inside its Core layer, yet the grep-based benchmark reported "Purity OK".

`verify.mjs` traverses the TypeScript AST (Abstract Syntax Tree) to inspect the structure of the code, so an individual check decides on syntax instead of on text — `new Date()` cannot hide from it the way it hid from the grep. That is a property of each check, not a claim about the tool: this is **syntactic boundary linting**, the bottom rung of the assurance ladder (boundary linting → static analysis → property-based testing → model checking → formal proof), and a check pointed at the wrong directory still enforces nothing at all. Read the trust boundary printed at the end of every run, not this paragraph, for what a given green actually covered.

## Checks Performed (Corresponding to `SPACTA.md` §1)

The table below is **generated from the `CHECKS` registry** in `verify.mjs` — it is not a hand-written copy. Regenerate it with `node verify/verify.mjs --write-docs` (use `bun` if node is unavailable). A normal verify run reports a `docs-drift` **err** when the block and the registry disagree, so a drifted table cannot be committed and still go green. Edit `CHECKS`, never the table.

<!-- checks:begin -->
<!-- Generated from the CHECKS registry in verify.mjs by `node verify/verify.mjs --write-docs`.
     Do not edit by hand: a normal verify run reports an err when this block and CHECKS disagree. -->

| Law | Check | Severity | Walks | Matches | Guarantee on green | Kind |
|---|---|---|---|---|---|---|
| L1 | `cross-feature-imports` | err | `src/features/` | `/\.(ts\|tsx)$/` | No feature imports another feature's internals | per file |
| L2 | `core-purity` | err | `src/` | `/(^\|\/)core\.ts$/` | core.ts holds no IO and no non-determinism | per file |
| L3 | `effect-return` | err | `src/features/` | `/(^\|\/)core\.ts$/` | An Effect that asks for an answer has an Action able to receive it | batch |
| L4 | `effect-runtime` | err | `src/` | `/\.(ts\|tsx)$/` | Every handwritten switch on effect.type terminates exhaustively | per file |
| L5 | `source-purity` | err | `app/`, `src/app/` | `/(^\|\/)(page\|route)\.tsx?$/` | Server boundaries generate no ids, time or randomness | per file |
| L7 | `shared-features-isolation` | err | `src/shared/` | `/\.(ts\|tsx)$/` | shared/ does not import feature internals | per file |
| L9 | `presentation-behaviour` | err | `src/` | `/\/features\/[^/]+\/components\/.*\.tsx$/` or `/\/shared\/ui\/.*\.tsx$/` | Components and shared/ui perform no IO and no non-determinism | per file |
| L10 | `component-statelessness` | err | `src/features/` | `/\/components\/.*\.tsx$/` | Feature components are pure functions of their props | per file |
| L8 | `presentation-purity` | info | `src/features/` | `/(^\|\/)shell\.tsx$/` or `/\/components\/.*\.tsx$/` | — | per file |
| — | `clone` | info | `src/features/` | `/(^\|\/)shell\.tsx$/` or `/\/components\/.*\.tsx$/` | — | batch |
| — | `export-ownership` | info | `src/features/` | `/(^\|\/)types\.ts$/` | — | batch |
<!-- checks:end -->

Rows are the machine-readable scope. What follows is the part a table cannot carry — why each scope is drawn where it is:

- **L2 / L9 forbidden sets are not the same set.** Core rejects `async`/`await`/`new Date`/`Date.now`/`Math.random`/`fetch`/`window`/`document`/`localStorage`/`sessionStorage` and imports of `prisma`/`*-gateway`/`react`/`next`. Presentation rejects IO and non-determinism (`fetch`/`XMLHttpRequest`/storage, time, random, `crypto.randomUUID`) plus `next/navigation`, but `react` and `next/link` are legitimate presentation vocabulary and are never flagged; `window`/`document` are deliberately absent so `shared/ui` can wire DOM events (Dialog/Tabs/Combobox), which never moves data across the membrane.
- **L3 is scoped by construction site, not by declaration.** `Effect` is a single global union in `shared/types.ts` (L7 forces that), so "this feature's Effect" does not exist at the type level; a `core.ts` does, and it belongs to exactly one feature. If a `core.ts` builds an object literal carrying both `type` and `correlationId`, the feature's `types.ts` must declare an `Action` able to receive that answer — a member carrying a `correlationId` that is not itself the action requesting the write. The check is opt-in by construction: a feature that never uses `correlationId` is never examined.
- **L4's scope is the whole `src/` tree, not `shell.tsx`.** A shell-only walk left features with no `shell.tsx` completely unchecked and never scanned `shared/runEffect.ts` — the one switch that most needs an exhaustive terminator. No false positives result: the checker returns early for any file without a `switch` on `effect.type`.
- **L5 walks both app router locations** (`app/` and `src/app/`), because Next.js accepts either. Non-deterministic generation is an `err`; direct `.reduce()` aggregation is a `warn`. Pages and routes get the same AST inspection.
- **L10 is scoped to feature components only.** `shared/ui` is deliberately out of scope: widget-local state (disclosure, focus trap, popover position) is not domain state and never crosses the membrane.
- **`export-ownership` produces two diagnostics.** `dead-export` = an exported contract imported nowhere in `src/` or the app router (dead contract, wasted sharing budget); `single-owner-export` = a contract imported by exactly one file, excluding the `Action`/`Effect`/`State`/`InitData` membrane vocabulary. Consumers are the full `src/` tree plus the app router, because pages and routes import feature types.
- **Not in the registry** (they walk no per-check glob): the L6 self-test and wiring test; the `types.ts` line budget (shared = 250, feature = 200) and `tsconfig` app inclusion, both info notes; and the `docs-drift` err above.
- **A check that matched 0 files is never listed as guaranteed.** The trust boundary prints such checks under `NOT verified in this project` with the roots it walked, because "this law found no problems" and "this law was never pointed at your code" are otherwise indistinguishable. That is reported, not fatal: a project may legitimately have no app router or no `shared/ui` yet.

The L6 self-test suite is the backbone of the verifier. Without it, the entire verification system reverts to a 'hope'-based model: we would claim to enforce rules via tooling without actually verifying that the tools work. Self-test alone is not sufficient: it feeds fixture text straight into the checker functions, so it never exercises a `CHECKS` entry's `root`/`match` — a mistyped glob that selects zero files would still pass the self-test and then report green on a real scan. The wiring test closes that gap by asserting each registry glob selects more than zero files (`> 0`, deliberately not a tuned threshold) in the reference corpus (`starter/`, shipped next to the verifier); if that corpus is absent the run exits `2` (INCONCLUSIVE) instead of continuing, because a `SKIPPED` line that still allows a green would let anyone delete the wiring test by deleting a directory. **Regardless of how you structure your codebase, this self-test check cannot be bypassed.**

### L8 Color Token Evaluation (Details on Presentation Purity)

L8 does not indiscriminately ban color. Instead, it **flags high-risk indicators of design drift while allowing standard utility colors**.
Its goal is threefold: align typography and layouts to semantic tokens, restrict color/opacity overrides, and permit utility colors for status indicators. This avoids unnecessary developer friction while keeping design systems aligned.

| Classification | Example | Evaluation | Suggested Migration Target |
|---|---|---|---|
| Raw Color Hex | `#0ea5e9` | **info** | `theme` vocabulary |
| Arbitrary Values | `bg-[#fff]` / `text-[13px]` | **info** | `theme` / `shared/ui` recipes |
| Grayscale Palette | `bg-gray-50` / `bg-slate-950` / `text-white` / `bg-black` | **info** | `bg-background` / `text-foreground` / `bg-card` / `border-border` |
| Hidden Hardcoded Color/Opacity | `bg-fuchsia-400/10` / `border-violet-300/15` / `bg-white/[0.06]` | **info** | `bg-primary/10` / `bg-card/20` (Semantic token + Opacity) |
| Status Colors (Escape Hatch) | `bg-red-50` (error) / `text-green-600` (success) / `bg-amber-100` (warn) / `text-blue-800` (info) | **Allowed** | — |
| Semantic Tokens | `bg-primary` / `border-border` / `bg-card/20` (opacity allowed) | **Allowed** | — |

- **Grayscale utilities** dictate the background, text, and border styling of structural frames. They must be resolved to semantic tokens (e.g., `bg-background` or `text-foreground`), as divergence in grayscales is the primary source of visual inconsistency across different pages.
- **Opacity modifiers** attached to raw colors (e.g., `bg-fuchsia-400/10`) lock in specific hues, which blocks them from adapting to light/dark modes. Replace these with semantic tokens combined with opacity (such as `bg-primary/10`).
- **Status-related colors** (`red`/`green`/`emerald`/`orange`/`amber`/`yellow`/`blue`/`sky`) are widely used for notifications, badges, and alerts. They are **allowed** (including with opacity modifiers) because restricting them produces excessive noise with minimal architectural benefit.
- Everything is **info/burn-in (does not fail)**. Cleanup targets are generated by `npm run garden` as a gardening instruction document.

## Usage

```sh
# Running verify on a root directory (resolves typescript dependency from the target project):
node verify/verify.mjs <projectRoot>

# Running verify when verify is outside the target project:
node verify.mjs                       # Targets ../../project by default
node verify.mjs <projectRoot> --tsc   # Also runs tsc --noEmit at the end
node verify.mjs <projectRoot> --json  # Outputs machine-readable JSON (consumed by garden)

# Maintenance mode: regenerate the check table in verify/README.md from the CHECKS registry.
# Runs no checks and reports no result — it only writes the table.
node verify/verify.mjs --write-docs
```

Add this to `package.json` to make it a CI gate (`SPACTA.md` §3.4). This is what this repository's own `package.json` actually uses:

```json
{ "scripts": { "verify": "node verify/verify.mjs starter" } }
```

> Point `verify` at a directory that actually contains `src/` or `app/`. Pointing it at a directory with neither (for example this repo's own root, which holds `verify/` and `starter/` but no top-level `src/`) makes it walk zero files and exit `2` (INCONCLUSIVE) — this was previously documented here as `node verify/verify.mjs .` and was a real self-inflicted bug in this repo, since "0 files scanned" is not the same as "0 violations".

Exit codes:
- `0` = Green — no `err` violations (warn/info findings alone still exit `0`).
- `1` = Red — `err` violations found, or the L6 self-test / wiring test itself failed.
- `2` = INCONCLUSIVE — the run cannot claim to have verified anything, either because 0 files were scanned, or because the L6 wiring test found no reference corpus (`starter/`) and the registry globs are therefore unverified. The verifier refuses to call either state green, because "found no violations" and "looked at nothing" are otherwise indistinguishable.

Note that a *single* check matching 0 files is not INCONCLUSIVE — the run can still be green, because a project may legitimately have no app router or no `shared/ui`. Such a check is instead moved out of `Guaranteed by this green` and printed under `NOT verified in this project`, with the roots it walked, so the green never claims a law it did not enforce.

> typescript is resolved from the target project's `node_modules`. Placing it directly under the project root requires zero additional dependencies.
> **`verify` (without `--tsc`) is not type checking.** L1–L10 inspect structural boundaries. Unused imports or broken references left after moving files will be green in verify and only red in `tsc`. Always run `node verify.mjs <projectRoot> --tsc` (or `npm run verify:tsc` / `tsc --noEmit`). **Green verify ≠ Green types** (`SPACTA.md` §3).

## Real-world Example: How L6 Caught Its Own Bug During Development

In the initial implementation, the L4 exhaustiveness check was written using a simple regex on the file text: `/:\s*never\b/`.
However, the test fixture had a **comment** stating `assertNever / missing : never termination`.
The regex matched the comment string instead of the code, incorrectly evaluating it as "exhaustiveness satisfied," which meant the verifier failed to reject the bad fixture, causing L6 to fail.

This is the exact "grep hole" criticized in our design rationale (the inability to distinguish between comments and code).
The fix was to change to AST-based evaluation (inspecting for `NeverKeyword` nodes or the presence of an `assertNever` call).
**The verifier of the verifier (L6) caught the verifier's false green.** Without this self-verification, the bug would have gone completely unnoticed.

## Limitations (Honest Disclosure)

- **L5 is close to detect**. Server boundary (page/route) aggregation is a "warning" rather than a "fail" because AST cannot strictly determine if code constitutes business logic. This remains a hope-adjacent area. Generating non-deterministic values (`new Date`/`Date.now`/`Math.random`/`crypto.randomUUID`) is strictly an err. Routes are allowed to perform IO (`await` fetch/DB), so the IO itself is not target of L5 (only generation and direct aggregation are restricted).
- **L1 relative import evaluation is robust**. It resolves paths using `path.resolve`, ensuring accurate cross-feature boundaries regardless of import depth or path structure.
- **L8 is a heuristic based on color sets**. It flags grayscales and color+opacity, while allowing status colors and semantic tokens. It is not perfect and can miss new Tailwind aliases, acting purely as an **info/burn-in**. True UI alignment (fonts, rounded corners, overall feel) lies outside color tokens, handled by the `frontend-design` skill / human reviews.
- **Clone detection is a heuristic (Jaccard similarity ≥ 0.9, token count ≥ 5)**. It compares the set of "child tag names + className tokens" for root JSX elements. Since it compares classNames as sets, **it is unaffected by Tailwind class ordering**. Child JSX returned by `.map()` is excluded from parent comparison to avoid false nesting duplicates. It merely flags **suspected** duplications as info. Deciding whether to dry up duplication is left to the gardener/human.
- **L3 `effect-return` checks the receptacle, not the round trip**. It proves the feature *declares* an Action able to receive an Effect's answer; it does not trace that the Shell actually dispatches it, nor that Core does anything useful with it. It is also opt-in by construction: a feature that never puts a `correlationId` on an Effect is never examined, so a project that never adopts the pattern stays green with zero write-path guarantees. Both facts are printed in the trust boundary. Deliberate false negatives, chosen because a false positive here is worse: if the `Action` union cannot be found next to `core.ts`, or a union member resolves to a type the checker cannot read, it reports nothing.
- **Does not check semantic intent**. Green `verify` does not guarantee the app behaves correctly. It only ensures borders aren't broken and the structure is clean (`SPACTA.md` §4.5).
- Designed as a custom AST script to avoid dependencies on ESLint flat config (which broke due to circular references in the benchmark project). In production, you can replace this with dependency-cruiser, etc. (`SPACTA.md` §2).

## Files

```
verify/
  verify.mjs                 Verifier core (AST. Exposes checkers as pure functions for reuse in self-tests)
  fixtures/
    bad-core.core.ts         L2: Contains new Date/await/prisma/fetch (should be rejected)
    good.core.ts             L2: Clean injected core (should not be false-positived)
    bad-effect-return.core.ts   L3: Core builds an Effect carrying a correlationId (used by all three L3 cases)
    bad-effect-return.types.ts  L3: Action union whose only correlationId member is the one requesting the write
                                    = partial adoption, no return path (the pair above must be rejected)
    good-effect-return.types.ts L3: Same Action plus EFFECT_SUCCEEDED/EFFECT_FAILED (should not be false-positived)
    no-correlation.core.ts      L3: Core that never uses correlationId; paired with the bad types it must stay
                                    silent — the executable record that this check is opt-in by construction
    bad-cross-import.ts      L1: Imports adjacent feature (should be rejected)
    bad-shell-switch.shell.tsx  L4: Handwritten switch without exhaustiveness termination (should be rejected)
    bad-shared-import.shared.ts L7: Shared importing a feature (should be rejected)
    good-shared.shared.ts       L7: Shared that does not know features (should not be false-positived)
    bad-route.route.ts          L5: route generating new Date/crypto.randomUUID or reduce aggregation (should be rejected)
    good-route.route.ts         L5: Injected, fetch/persistence-only route (should not be false-positived)
    bad-presentation.shell.tsx  L8: Raw color/arbitrary values/grayscales/color+opacity (should trigger info)
    good-presentation.shell.tsx L8: Semantic tokens/status colors (should not be false-positived)
    bad-presentation-io.component.tsx  L9: async/await/fetch, new Date/Math.random/crypto.randomUUID, localStorage, and a next/navigation import in a feature component (should be rejected)
    good-presentation-io.component.tsx L9: react type import + next/link only, time received as a prop (should not be false-positived)
    bad-component-state.component.tsx  L10: useState/useEffect in a feature component (should be rejected)
    good-shared-ui.ui.tsx      L9/L10: interactive shared/ui primitive using useState/useEffect and document.addEventListener; must stay green — the executable record that L10 scopes to feature components only, not shared/ui, and that L9 deliberately does not ban window/document
    clone-a.shell.tsx / clone-b.shell.tsx  clone: UI with only className order changed (should trigger info)
    clone-distinct.shell.tsx    clone: Different UI structure and classNames (should not be false-positived)
    clone-map-callback.shell.tsx clone: Parent ul + map-nested li (should not be false-positived)
    dead-export.types.ts        dead-export: DeadType is not imported anywhere (should trigger info)
    dead-export.consumer.ts     Consumer of above (only imports UsedType)
    single-owner-export.types.ts single-owner-export: Export imported by only one file (should trigger info)
    single-owner-export.consumer.ts
    shared-export.types.ts      dead/single-owner: Export imported by two files (should not be false-positived)
    shared-export.consumer-a.ts / -b.ts  Two consumers of above
  README.md                  This file. Its check table is generated from CHECKS
                             (node verify/verify.mjs --write-docs); a drifted table is an err
```
