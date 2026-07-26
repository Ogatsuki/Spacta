# Spacta Verify — Reference Implementation

The actual running implementation of `SPACTA.md` §1 (Laws) and §3 (Verification Contract).
This codebase serves as concrete proof of the core thesis: "Invariants are physically enforced by tools, not by prose."

## Why AST Analysis Over Simple Regex?

The Core purity check in the original benchmark protocol relied on regex scanning:

```sh
grep -rn "Date.now\|Math.random\|fetch(" src/features/*/core.ts   # ← Misses `new Date()`
```

This failed to detect `new Date()` calls and produced a **false green**. The `iotawise` codebase contained six instances of `new Date()` inside its Core layer, yet the grep-based benchmark reported "Purity OK".

`verify.mjs` traverses the TypeScript AST (Abstract Syntax Tree) to inspect the structure of the code. This achieves a **strong-prevention** guarantee in the architectural reliability hierarchy (strong-prevention > weak-prevention > detection > hope).

## Checks Performed (Corresponding to `SPACTA.md` §1)

| Law / Rule | Target | Detection (Diagnostic Name) |
|---|---|---|
| L1 | `src/features/**` | Imports from other features (**Isolation** violation). |
| L2 | `src/**/core.ts` | Async, await, new Date, Date.now, Math.random, fetch, window, document, localStorage, sessionStorage, or imports of `prisma`/`*-gateway`/`react`/`next` (**Purity** violation). |
| L4 | `src/**` (`.ts`/`.tsx`, whole tree) | Handwritten `switch` on `effect.type` without `assertNever` / `: never` termination (**Exhaustiveness** violation). Scope is deliberately not limited to `shell.tsx`: a shell-only walk left features with no `shell.tsx` completely unchecked and never scanned `shared/runEffect.ts` — the one switch that most needs an exhaustive terminator. No false positives result, since the checker returns early for any file without a `switch` on `effect.type`. |
| L5 | `app/**/page.tsx`, `app/**/route.ts` | Direct non-deterministic generation (`new Date`/`Date.now`/`Math.random`/`crypto.randomUUID` = err) / direct aggregation (`.reduce()` = warn) at server boundaries (**Source Purity** violation). Both pages and routes undergo the same AST inspection. |
| L7 | `src/shared/**` | `shared/*` importing from `features/*` (**Reverse Dependency Prevention** violation). |
| L9 | `src/features/*/components/**/*.tsx`, `src/shared/ui/**/*.tsx` | Async functions, `await`, `new Date()`, `Date.now`, `Math.random`, `crypto.randomUUID`/`getRandomValues`, `fetch`/`XMLHttpRequest`/`localStorage`/`sessionStorage`, or imports of `prisma`/`*-gateway`/`next/navigation` (**Presentation Behaviour** violation). `react` and `next/link` are legitimate presentation vocabulary and are never flagged; `window`/`document` are deliberately absent from the forbidden set so shared/ui can wire DOM events (Dialog/Tabs/Combobox), since that never moves data across the membrane. |
| L10 | `src/features/*/components/**/*.tsx` | `useState`/`useReducer`/`useEffect`/`useLayoutEffect` calls (**Component Statelessness** violation) — feature components must be pure functions of their props. Scoped to feature components only: `shared/ui` is deliberately out of scope, because widget-local state (disclosure, focus trap, popover position) is not domain state and never crosses the membrane. |
| L6 | `verify/fixtures/`, `starter/` | **Verifier self-verification**, in two parts: (1) self-test — proves each checker function rejects planted violations and does not false-positive; (2) wiring test — proves every `CHECKS` registry glob actually selects at least one file in the reference corpus (`starter/`), since the self-test feeds fixture text directly into the checker functions and never exercises a check's `root`/`match`. |
| L8 | `src/features/**/shell.tsx`, `src/features/**/components/**/*.tsx` | Direct use of raw colors (`#hex`), arbitrary values (`bg-[...]`), non-semantic grayscale palettes, or hidden hardcoded color/opacity (**Presentation Purity** violation, info/burn-in only). |
| clone | `src/features/**/shell.tsx`, `src/features/**/components/**/*.tsx` | UI duplication based on JSX structure and Jaccard similarity of classNames (**UI Duplication** info/burn-in). |
| info | `src/**/types.ts`, `tsconfig.json` | types.ts line budget check (shared = 250, feature = 200) / tsconfig app inclusion. |
| dead-export | `src/features/**/types.ts` exports | Exported contracts that are not imported anywhere in `src/` or `app/` (**Dead Export** info). |
| single-owner-export | `src/features/**/types.ts` exports | Local contracts imported by only one file, excluding Action/Effect/State/InitData (**Single Owner Export** info). |

The L6 self-test suite is the backbone of the verifier. Without it, the entire verification system reverts to a 'hope'-based model: we would claim to enforce rules via tooling without actually verifying that the tools work. Self-test alone is not sufficient: it feeds fixture text straight into the checker functions, so it never exercises a `CHECKS` entry's `root`/`match` — a mistyped glob that selects zero files would still pass the self-test and then report green on a real scan. The wiring test closes that gap by asserting each registry glob selects more than zero files (`> 0`, deliberately not a tuned threshold) in the reference corpus (`starter/`, shipped next to the verifier); if that corpus is absent, it prints `SKIPPED` and says the globs are unverified, rather than silently passing. **Regardless of how you structure your codebase, this self-test check cannot be bypassed.**

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
```

Add this to `package.json` to make it a CI gate (`SPACTA.md` §3.4). This is what this repository's own `package.json` actually uses:

```json
{ "scripts": { "verify": "node verify/verify.mjs starter" } }
```

> Point `verify` at a directory that actually contains `src/` or `app/`. Pointing it at a directory with neither (for example this repo's own root, which holds `verify/` and `starter/` but no top-level `src/`) makes it walk zero files and exit `2` (INCONCLUSIVE) — this was previously documented here as `node verify/verify.mjs .` and was a real self-inflicted bug in this repo, since "0 files scanned" is not the same as "0 violations".

Exit codes:
- `0` = Green — no `err` violations (warn/info findings alone still exit `0`).
- `1` = Red — `err` violations found, or the L6 self-test / wiring test itself failed.
- `2` = INCONCLUSIVE — 0 files were scanned. The verifier refuses to call an empty scan green, because "found no violations" and "looked at nothing" are otherwise indistinguishable.

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
- **Does not check semantic intent**. Green `verify` does not guarantee the app behaves correctly. It only ensures borders aren't broken and the structure is clean (`SPACTA.md` §4.5).
- Designed as a custom AST script to avoid dependencies on ESLint flat config (which broke due to circular references in the benchmark project). In production, you can replace this with dependency-cruiser, etc. (`SPACTA.md` §2).

## Files

```
verify/
  verify.mjs                 Verifier core (AST. Exposes checkers as pure functions for reuse in self-tests)
  fixtures/
    bad-core.core.ts         L2: Contains new Date/await/prisma/fetch (should be rejected)
    good.core.ts             L2: Clean injected core (should not be false-positived)
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
  README.md                  This file
```
