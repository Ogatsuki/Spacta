# Spacta Starter — Verified "Default Form" Template

A minimal project template measured and confirmed to be **100% compliant** under `npm run verify`.
It serves as the default reference template to jump-start Phase 0 bootstrap and prevent development drift. It represents the default *Form* described in `SPACTA.md` §2.
`spacta-verify` operates assuming this structure:
`app/layout.tsx` + `src/shared/{ui,runEffect,source}` + `src/features/<name>/{types,core,perform,shell,components}` + `app/**/page.tsx`.

> **The purpose of this starter is to prevent developers and AIs from writing verification tooling from scratch.** A finished verifier arrives with `npm install spacta` and runs as `npx spacta-verify`.
> Your focus should be on implementing features, not reinventing AST validation scripts (`SPACTA.md` §0/§3).
>
> **Nothing here is a copy of the engine.** `shell.tsx` imports `useSpacta` from `spacta/react`,
> the way any dependency is imported. Earlier versions shipped the engine's TypeScript source
> inside `src/shared/spacta/` and every adopter carried their own copy of it; those copies went
> silently stale twice, which is why the package exists.

## What's Inside (Minimal examples satisfying each law)

| File | Role | Corresponding Law |
|------|------|-------------------|
| `app/layout.tsx` | Common frame for all pages. Features only draw the inner content. | §2.5 (Layouts Go Up) |
| `tailwind.config.ts` | The sole source of presentation primitives (`theme.extend`) such as colors, margins, and border-radius. | L8 (Presentation Purity) source |
| `src/shared/ui/*` | Presentation primitives that do not know feature names. Variants are co-located using `tailwind-variants`. | L7 (Reverse Dependency Prevention) |
| `src/shared/types.ts` | `assertNever` helper, and nothing else. Neither the `Effect` union nor the answer type belongs here — both are each feature's own. | L4 (Exhaustiveness) |
| `src/shared/runEffect.ts` | The transport (`post`). HTTP, generic in what comes back, naming no field — mechanism, not vocabulary. | L7 (Reverse Dependency Prevention) |
| `src/shared/source.ts` | The "edge" for reading time and IO (neither Core nor Page). | Escape hatch for L3 (Injection) / L5 (Source Purity) |
| `src/features/sample/types.ts` | `InitData` / `State` / `Action` / `Effect` discriminated unions, plus `Answer` — this feature's whole membrane vocabulary and the shape of its replies. | — |
| `src/features/sample/core.ts` | Pure `init` / `update` / `summarize` (no IO, `now` is injected). | L2 (Purity) / L3 (Injection) |
| `src/features/sample/perform.ts` | This feature's IO — the switch that turns *its own* Effects into requests. | L1 (Isolation) / L4 (Exhaustiveness) |
| `src/features/sample/shell.tsx` | Thin shell containing only state wiring. | L1 (Isolation) / L4 (Exhaustiveness) |
| `src/features/sample/components/*` | Feature-specific UI components. Localized without fear of duplication. | §2.5 (Components Go In) |
| `app/page.tsx` | Server Page. Only reads values from `source` and calls the `shell`. | L5 (Source Purity) |

Key points that trip up new AIs:
- **Do not generate time inside Core.** `source.readNow()` reads it at the edge, and passes it as `InitData.now` (L3).
  Writing `new Date()` in `core.ts` flags red under L2 (Purity). Writing it in `page.tsx` flags red under L5 (Source Purity). Put it in the edge (`source.ts`/`shell.tsx`).
- **An Effect switch belongs in the feature's own `perform.ts`.** Writing a handwritten switch on `effect.type` in `shell.tsx` flags red under L4 (Exhaustiveness). Do not put one back in `shared/runEffect.ts` either: a shared switch makes one feature's vocabulary everybody's dependency, which is exactly what declaring `Effect` per feature removed.
- **Never write your own effect loop.** `useSpacta` hands the queue to the engine in the `spacta` package, which is the only caller of `perform` and turns *every* outcome into an Action — including the answer to an Effect that asked for nothing. A loop written twice is a loop that disagrees with itself.
- **There is one channel for an answer, and the feature names its shape.** Declare `Answer` in your own `types.ts`, pass it as the fourth argument to `useSpacta`, and it arrives as `action.data` on `EFFECT_SUCCEEDED`. A server-assigned id and a page of rows travel the same way — do not add a second field for one of them.
- **Cross-feature imports are restricted.** Importing the internals of an adjacent feature flags red under L1 (Isolation). Always go through `@/shared` or stay local to the feature.
- **Raise common frames and vocabulary.** Extract common layouts and layout-agnostic presentation vocabulary. Feature-specific look-and-feel should be confined within `components/`.
- **Avoid hardcoding layout or presentation values directly in shells or components.** First, use the `theme.extend` vocabulary in `tailwind.config.ts` (e.g., `bg-primary`).
  Share utility tokens, not monolithic UIs. Co-locate variant mappings (such as color tones or sizes) directly inside components in `shared/ui` using `tailwind-variants` (`tv()`). Do not group class strings into a centralized `tokens.ts` file.

## Usage (Phase 0 Bootstrap)

```sh
# 1) Copy the application shape — and only that. There is no verify/ or garden/ to carry.
cp -r node_modules/spacta/starter/{app,src,tailwind.config.ts,tsconfig.json} myapp/

# 2) Install. The engine and the verifier arrive together, at one version.
cd myapp && npm install spacta          # then typescript, tailwindcss, tailwind-variants

# 3) Run the verifier out of node_modules
npx spacta-verify .            # Runs L1–L10 checks, including the L6 self-test.
npx spacta-verify . --tsc      # Finally, verify TypeScript types via tsc --noEmit.
```

> `spacta-verify` (without `--tsc`) runs successfully using **only TypeScript** as a parser. React/Next.js types are only required when running the type checker (`--tsc`).
> Enforce `npm run verify` as a gate in CI (pre-commit / GitHub Actions) to prevent design drift (`SPACTA.md` §3.4).
> The full bootstrap, including the agent-facing half (`npx spacta-init`), is in
> [`docs_HUMAN-ONLY/setup.md`](../docs_HUMAN-ONLY/setup.md).

## Adding Features

1. Create `src/features/<new>/` and write `types.ts` / `core.ts` / `shell.tsx` imitating the `sample` feature.
   As display elements grow, create `components/` and move feature-specific UI there.
   A feature with no IO needs no `perform.ts`; add one the first time Core declares an Effect.
2. When adding an Effect, add it to **both** the `Effect` type in your own `src/features/<new>/types.ts`
   and the case in your own `src/features/<new>/perform.ts` — the two live side by side, and neither edit
   leaves your directory (forgetting the case will fail `tsc` via `assertNever`).
   If another feature already declares the same Effect, **write it out again** rather than sharing the
   declaration: what actually couples two screens is the endpoint they both POST to, and a shared
   declaration never protected that (`SPACTA.md` §2 — duplication over coupling).
3. If a common layout wrapper is needed, raise it to `app/layout.tsx` or `shared/ui`. If it starts knowing feature nouns, keep it inside features.
4. Fix the code until `npm run verify` turns green. A red status is a bug to be fixed, not a warning (`SPACTA.md` §4).

## Details of Form Can Be Decided Flexibly (`SPACTA.md` §2.5)

This starter is a **safe default form**, not the only correct structure. Next.js applications vary widely, and rigid structures do not fit all.
As long as `verify` is green and §1 laws are followed, you can contextually decide:

- **Type Placement**: Keep types colocated in their usage files if they have a single consumer; raise only feature-membrane contracts to `types.ts`. Keep `Action` / `Effect` / `State` / `InitData` in `types.ts` even if there is only 1 consumer (membrane vocabulary).
- **Shell Splitting**: State-wiring Shells should be "thin" (free of business logic), not necessarily short. First move validation and decision logic to `core.ts`. Once it is thin, you may split display components into sub-components under `components/` to keep individual files readable. Keep cohesive container hooks and workflow hook definitions together.
- **Layout and Presentation Vocabulary**: Raise common frames to `app/layout.tsx` / `shared/ui`, and place colors/margins/border-radius in `tailwind.config.ts`'s `theme.extend`. Component variant bindings (tone/size, etc.) should be co-located using `tailwind-variants` in each component in `shared/ui`. Do not place a central `tokens.ts` (object mapping classes). Only place feature-agnostic presentation primitives in `shared/ui`. Keep feature-specific components inside the feature even if they look similar.
- **Splitting gateway/constants/source**: If the feature is small, integrate them into a single file. Split them only when local sharing actually occurs.
