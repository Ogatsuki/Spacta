# Membrain Verify — Reference Implementation

The actual running implementation of `MEMBRAIN.md` §1 (Laws) and §3 (Verification Contract).
This codebase serves as concrete proof of the core thesis: "Invariants are physically enforced by tools, not by prose."

## Why AST and Not Grep? (The reason this tool exists)

The Core purity check in the old `BENCHMARK_PROTOCOL.md` relied on grep:

```sh
grep -rn "Date.now\|Math.random\|fetch(" src/features/*/core.ts   # ← Misses `new Date()`
```

This failed to detect `new Date()` and produced a **false green**. In fact, there were 6 instances of `new Date()` in the Core of `iotawise`, but the benchmark reported "Purity OK".

`verify.mjs` walks the TypeScript AST (Abstract Syntax Tree) to detect syntax. This represents the **prevent-strong** level in the reliability hierarchy (prevent-strong > prevent-weak > detect > hope).

## Checks Performed (Corresponding to `MEMBRAIN.md` §1)

| Law | Target | Detection |
|---|---|---|
| L1 | `src/features/**` | Imports from other features (isolation violation). |
| L2 | `**/core.ts` | `async` / `await` / `new Date` / `Date.now` / `Math.random` / `fetch` / `window` / `document` / `localStorage` / `prisma` imports (purity violation). |
| L4 | `**/shell.tsx` | Handwritten `switch` on `effect.type` without `assertNever` / `: never` termination (exhaustiveness violation). |
| L5 | `app/**/page.tsx`, `app/**/route.ts` | Direct non-deterministic writes at server boundaries (`new Date`/`Date.now`/`Math.random`/`crypto.randomUUID` = err) / direct aggregation (`.reduce()` = warn). Both pages and routes undergo the same AST inspection. |
| L7 | `src/shared/**` | `shared/*` importing from `features/*` (reverse dependency / isolation violation). |
| L6 | `verify/fixtures/` | **Verifier self-verification**. Enforces that known violations are rejected and correct files are not false-positived. |
| L8 | `features/**/shell.tsx`, `features/**/components/**` | Direct use of raw colors (`#hex`), arbitrary values (`bg-[...]`), **non-semantic grayscale palettes**, or **hidden hardcoded color/opacity** (`fuchsia-400/10`, etc.). **info / burn-in (does not fail)**. |
| clone | `features/**/shell.tsx`, `features/**/components/**` | Duplication of UI (JSX/className). Checks classNames as sets to absorb Tailwind order variations, using Jaccard similarity. Excludes children JSX returned inside `.map()` callbacks to prevent false positives in parent-child nestings. **info / burn-in (does not fail)**. |
| info | `**/types.ts`, `tsconfig.json` | Sharing budget lines / checks if includes cover `app/` (does not fail). |
| info | `features/**/types.ts` exports | **dead-export**: Exported contracts that are not imported anywhere in `src/` or `app/` (wasted sharing budget). Does not fail during burn-in. |
| info | `features/**/types.ts` exports | **single-owner-export**: Local contracts imported by only one file. Excludes membrane vocabulary like Action/Effect/State/InitData. Never fails. |

L6 is the backbone. Without it, L1–L5 revert to "hope" at the meta-level: we would say "enforce with tools" but wouldn't know if the checks were empty. **Even if the Form is free, this self-verification cannot be waived.**

### L8 Color Token Evaluation (Details on Presentation Purity)

L8 does not "simply ban color." It **specifically info-flags design drift culprits while allowing harmless status colors**.
The target is threefold: "Bind general tone & manner to semantic tokens, suppress hidden hardcoded color+opacity, and allow standard Tailwind for status display." This avoids both false positives (ruining dev experience) and bypasses (leaving drift unchecked).

| Classification | Example | Evaluation | Suggested Migration Target |
|---|---|---|---|
| Raw Color Hex | `#0ea5e9` | **info** | `theme` vocabulary |
| Arbitrary Values | `bg-[#fff]` / `text-[13px]` | **info** | `theme` / `shared/ui` recipes |
| Grayscale Palette | `bg-gray-50` / `bg-slate-950` / `text-white` / `bg-black` | **info** | `bg-background` / `text-foreground` / `bg-card` / `border-border` |
| Hidden Hardcoded Color/Opacity | `bg-fuchsia-400/10` / `border-violet-300/15` / `bg-white/[0.06]` | **info** | `bg-primary/10` / `bg-card/20` (Semantic token + Opacity) |
| Status Colors (Escape Hatch) | `bg-red-50` (error) / `text-green-600` (success) / `bg-amber-100` (warn) / `text-blue-800` (info) | **Allowed** | — |
| Semantic Tokens | `bg-primary` / `border-border` / `bg-card/20` (opacity allowed) | **Allowed** | — |

- **Grayscales** (`gray`/`slate`/`zinc`/`neutral`/`stone`/`white`/`black`) dictate the "outer shell colors" of containers, text, and borders. They must be aligned to semantic tokens (drift here is the primary cause of "looking like a different app").
- **Color + Opacity** (`<color>-<shade>/NN` or `/[...]`) are hidden hardcodings that bypass hex detection but lock in a specific color's opacity, blocking light/dark mode adaptation. Replace with semantic tokens + opacity (defining CSS variables as HSL/RGB values so Tailwind's opacity modifier works, e.g., `bg-primary/10`).
- **Status Colors** (`red`/`green`/`emerald`/`orange`/`amber`/`yellow`/`blue`/`sky`) frequently appear in alerts/badges with fixed semantic meanings, and are thus **allowed** (including with opacity). Enforcing rules here yields too much noise.
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

Add this to `package.json` to make it a CI gate (`MEMBRAIN.md` §3.4):

```json
{ "scripts": { "verify": "node verify/verify.mjs ." } }
```

> typescript is resolved from the target project's `node_modules`. Placing it directly under the project root requires zero additional dependencies.
> **`verify` (without `--tsc`) is not type checking.** L1–L8 inspect structural boundaries. Unused imports or broken references left after moving files will be green in verify and only red in `tsc`. Always run `node verify.mjs <projectRoot> --tsc` (or `npm run verify:tsc` / `tsc --noEmit`). **Green verify ≠ Green types** (`MEMBRAIN.md` §3).

## Real-world Example: How L6 Caught Its Own Bug During Development

In the initial implementation, the L4 exhaustiveness check was written using a simple regex on the file text: `/:\s*never\b/`.
However, the test fixture had a **comment** stating `assertNever / missing : never termination`.
The regex matched the comment string instead of the code, incorrectly evaluating it as "exhaustiveness satisfied," which meant the verifier failed to reject the bad fixture, causing L6 to fail.

This is the exact "grep hole" criticized in our design rationale (the inability to distinguish between comments and code).
The fix was to change to AST-based evaluation (inspecting for `NeverKeyword` nodes or the presence of an `assertNever` call).
**The verifier of the verifier (L6) caught the verifier's false green.** Without this self-verification, the bug would have gone completely unnoticed.

## Limitations (Honest Disclosure)

- **L5 is close to detect**. Server boundary (page/route) aggregation is a "warning" rather than a "fail" because AST cannot strictly determine if code constitutes business logic. This remains a hope-adjacent area. Generating non-deterministic values (`new Date`/`Date.now`/`Math.random`/`crypto.randomUUID`) is strictly an err. Routes are allowed to perform IO (`await` fetch/DB), so the IO itself is not target of L5 (only generation and direct aggregation are restricted).
- **L1 relative import evaluation is heuristic** (`../<other>/`). Refinement is required depending on your path aliases configuration.
- **L8 is a heuristic based on color sets**. It flags grayscales and color+opacity, while allowing status colors and semantic tokens. It is not perfect and can miss new Tailwind aliases, acting purely as an **info/burn-in**. True UI alignment (fonts, rounded corners, overall feel) lies outside color tokens, handled by the `frontend-design` skill / human reviews.
- **Clone detection is a heuristic (Jaccard similarity ≥ 0.9, token count ≥ 5)**. It compares the set of "child tag names + className tokens" for root JSX elements. Since it compares classNames as sets, **it is unaffected by Tailwind class ordering**. Child JSX returned by `.map()` is excluded from parent comparison to avoid false nesting duplicates. It merely flags **suspected** duplications as info. Deciding whether to dry up duplication is left to the gardener/human.
- **Does not check semantic intent**. Green `verify` does not guarantee the app behaves correctly. It only ensures borders aren't broken and the structure is clean (`MEMBRAIN.md` §4.5).
- Designed as a custom AST script to avoid dependencies on ESLint flat config (which broke due to circular references in the benchmark project). In production, you can replace this with dependency-cruiser, etc. (`MEMBRAIN.md` §2).

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
