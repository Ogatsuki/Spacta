# Membrain Starter — Verified "Default Form" Skeleton

A minimal project template measured and confirmed to be **100% green** under `npm run verify`.
It serves as the "copy source" to prevent new AIs from getting lost during Phase 0 bootstrap. It is the default *form* described in `MEMBRAIN.md` §2.
The bundled `../verify/verify.mjs` operates assuming this structure:
`app/layout.tsx` + `src/shared/{ui,runEffect,source}` + `src/features/<name>/{types,core,shell,components}` + `app/**/page.tsx`.

> **The purpose of this starter is to prevent the AI from writing the verifier from scratch.** A finished verifier is bundled.
> Your job is implementation, not reinventing AST verifiers (`MEMBRAIN.md` §0/§3).

## What's Inside (Minimal examples satisfying each law)

| File | Role | Corresponding Law |
|------|------|-------------------|
| `app/layout.tsx` | Common frame for all pages. Features only draw the inner content. | §2.5 (Layouts Go Up) |
| `tailwind.config.ts` | The sole source of presentation primitives (`theme.extend`) such as colors, margins, and border-radius. | L8 (Presentation Purity) source |
| `src/shared/ui/*` | Presentation primitives that do not know feature names. Variants are co-located using `tailwind-variants`. | L7 Philosophy |
| `src/shared/types.ts` | `Effect` union + `assertNever` helper. | L4 (Guardian of Exhaustiveness) |
| `src/shared/runEffect.ts` | The **only** place where Effects are executed (switch + `assertNever`). | L4 |
| `src/shared/source.ts` | The "edge" for reading time and IO (neither Core nor Page). | Escape hatch for L3/L5 |
| `src/features/sample/types.ts` | `InitData` / `State` / `Action` discriminated unions. | — |
| `src/features/sample/core.ts` | Pure `init` / `update` / `summarize` (no IO, `now` is injected). | L2 / L3 |
| `src/features/sample/shell.tsx` | Thin shell containing only state wiring. | L1 / L4 |
| `src/features/sample/components/*` | Feature-specific UI components. Localized without fear of duplication. | §2.5 (Components Go In) |
| `app/page.tsx` | Server Page. Only reads values from `source` and calls the `shell`. | L5 |

Key points that trip up new AIs:
- **Do not generate time inside Core.** `source.readNow()` reads it at the edge, and passes it as `InitData.now` (L3).
  Writing `new Date()` in `core.ts` flags red in L2. Writing it in `page.tsx` flags red in L5. Put it in the edge (`source.ts`/`shell.tsx`).
- **Effect switches are allowed ONLY in `runEffect.ts`.** Writing a handwritten switch on `effect.type` in `shell.tsx` flags red in L4.
- **Cross-feature imports are restricted.** Importing the internals of an adjacent feature flags red in L1. Always go through `@/shared` or stay local to the feature.
- **Raise common frames and vocabulary.** `layout.tsx` and `shared/ui` do not know feature nouns. Feature-specific look-and-feel should be confined within `components/`.
- **Do not hardcode presentation values in shells/components.** First, use the `theme.extend` vocabulary in `tailwind.config.ts` (e.g., `bg-primary`).
  Share the vocabulary, not the finished UI. Co-locate variant bindings (tone/size, etc.) in each component in `shared/ui` using `tailwind-variants` (`tv()`). Do not collect class strings in a central `tokens.ts`.

## Usage (Phase 0 Bootstrap)

```sh
# 1) Copy this starter and ../verify to the root of your new project
cp -r Membrain/starter/*  myapp/
cp -r Membrain/verify     myapp/verify

# 2) Install the actual framework (e.g., Next.js + React)
cd myapp && npm install        # typescript/tailwindcss/tailwind-variants are pre-configured in devDependencies. Add react/next as needed.

# 3) Run the verifier (green with zero dependencies for Membrain laws)
npm run verify                 # Runs L1–L7 checks, including the L6 self-test.
npm run verify:tsc             # Finally, pass tsc --noEmit (requires react types).
```

> `npm run verify` (without `--tsc`) turns **green with just typescript**. React/Next types are only required during `--tsc`.
> Enforce `npm run verify` as a gate in CI (pre-commit / GitHub Actions) (`MEMBRAIN.md` §3.4).

## Adding Features

1. Create `src/features/<new>/` and write `types.ts` / `core.ts` / `shell.tsx` imitating the `sample` feature.
   As display elements grow, create `components/` and move feature-specific UI there.
2. When adding an Effect, add to **both** the `Effect` type in `src/shared/types.ts` and the case inside `src/shared/runEffect.ts`
   (forgetting to add it will fail `tsc` due to `assertNever`).
3. If a common frame is needed, raise it to `app/layout.tsx` or `shared/ui`. However, if it starts knowing feature nouns, do not place it in `shared/`.
4. Fix the code until `npm run verify` turns green. Red is a "bug to be fixed," not a warning (`MEMBRAIN.md` §4).

## Details of Form Can Be Decided Flexibly (`MEMBRAIN.md` §2.5)

This starter is a **safe default form**, not the only correct answer. Next.js applications vary widely, and rigid forms do not fit all.
As long as `verify` is green and §1 laws are followed, the implementing AI can contextually decide:

- **Type Placement**: Keep single-owner types inside their usage files, raise only membrane contracts to `types.ts`.
  Keep `Action` / `Effect` / `State` / `InitData` in `types.ts` even if there is only 1 consumer (membrane vocabulary).
- **Shell Splitting**: Shells should be "thin," not "short." First move judgment logic to `core.ts`.
  Once it is a sufficiently thin leaf, you may split display components into sibling files in `components/` (splitting leaves into smaller leaves, keeping isolation invariant). Keep cohesive judgment units (container + workflow hooks) together.
- **Layout and Presentation Vocabulary**: Raise common frames to `app/layout.tsx` / `shared/ui`, and place colors/margins/border-radius in `tailwind.config.ts`'s `theme.extend`. Component variant bindings (tone/size, etc.) should be co-located using `tailwind-variants` in each component in `shared/ui`. Do not place a central `tokens.ts` (object mapping classes).
  Only place feature-agnostic presentation primitives in `shared/ui`. Keep feature-specific components inside the feature even if they look similar.
- **Splitting gateway/constants/source**: If the feature is small, integrate them into a single file. Split them only when local sharing actually occurs.
