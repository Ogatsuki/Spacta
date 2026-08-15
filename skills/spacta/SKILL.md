---
name: spacta
description: Working in a Spacta project — any repo with a SPACTA.md, a `spacta` dependency, or a `src/features/*/core.ts` layout. Covers the ten Laws, where each kind of code goes (core.ts / perform.ts / shell.tsx / components), how to close a write's round trip so an Effect's answer reaches Core, and how to check behaviour with `spacta/replay` — which `verify` never checks. Load before editing anything under features/, shared/, or the app router in such a project, and before adding an Effect or an API route.
---

# Spacta

**Only data crosses the Core boundary. No IO enters, and no calculation escapes.** Everything
below is a corollary.

Your job is not to memorise conventions. It is to **make `verify` green and keep it green** —
and then to check the things `verify` says it never checks.

```sh
npx spacta-verify .      # the Laws. Exit 1 on a violation
npx spacta-measure .     # the numbers. Never a pass/fail
npx spacta-garden .      # info/warn turned into a work order
```

## Where code goes

| File | Holds | Never holds |
|---|---|---|
| `features/<f>/core.ts` | every judgement: validation, ordering, optimistic updates, compensation | `async`, `await`, `new Date`, `Math.random`, `fetch`, `window` (L2) |
| `features/<f>/types.ts` | `State` `Action` `Effect` `InitData` `Answer` — this feature's vocabulary | another feature's anything (L1) |
| `features/<f>/perform.ts` | this feature's Effects becoming IO, one `case` each | judgement, state writes |
| `features/<f>/shell.tsx` | JSX wiring: state into props, callbacks into `dispatch` | judgement, `useState` for feature state, an Effect loop |
| `features/<f>/components/*` | pure functions of props | `useState`/`useEffect`, IO, non-determinism (L9, L10) |
| `shared/source/*` | fetch and persistence, imported only by `app/**` | aggregation, formatting, generated ids/time (L5) |
| the `spacta` package (`spacta/runtime`, `spacta/react`) | the engine. One Effect loop for everyone | anything you write — never a copy of it in `src/` |

## The ten Laws, in one line each

L1 isolation: no feature imports another's internals · L2 purity: no IO in `core.ts` ·
L3 injection: time, random and ids arrive as values, **including what comes back from IO** ·
L4 exhaustiveness: a switch on `effect.type` terminates with `assertNever` or as the last
statement of a function whose return type excludes `undefined` · L5 source purity: boundaries
fetch, Core aggregates · L6 the verifier rejects planted violations · L7 `shared/` never imports
a feature · L8 no raw colours or arbitrary values · L9 no IO or non-determinism in components ·
L10 feature components keep no state.

Read §1 of `SPACTA.md` for the full text: `node_modules/spacta/docs_AI-ONLY/SPACTA.md`. It ships
with the package, so it is the rulebook for the verifier this project actually runs.

## Adding an Effect

1. Declare it in **your own** `types.ts`. Do not reach for a shared union — if a second feature
   needs the same Effect, write it out again. What couples two screens is the endpoint, and a
   shared declaration never protected that.
2. Add the `case` to **your own** `perform.ts`.
3. Handle `EFFECT_SUCCEEDED` / `EFFECT_FAILED` in `update`. Both. Every Effect is answered,
   including ones that asked nothing (`NAVIGATE`), and an Effect that asked nothing arrives with
   `correlationId: null` — write the case that says your feature does nothing with it rather
   than letting the loop skip it silently.
4. If the answer carries data, declare `Answer` in your `types.ts` and read `action.data`.
5. **Never write your own effect loop.** There is one, in the engine, and there must never be a
   second: a loop written twice is a loop that disagrees with itself.

An optimistic write must record enough in `State` to *undo itself by name*. `pending` holds
what was done, not merely that something was — compensation has to undo the right one when two
writes are in flight.

## What a green `verify` does not tell you

It prints this list itself on every run. Each line is something you still have to do:

| Not checked | What to do about it |
|---|---|
| **Semantic correctness** — never checked | Write scenarios: [references/behaviour.md](references/behaviour.md) |
| Type integrity | `tsc --noEmit`, separately |
| Judgement kept out of `shell.tsx` | Read the shell yourself: [references/form.md](references/form.md) |
| Write-path round trip below T3 | Raise the tier: [references/behaviour.md](references/behaviour.md) |
| Build order when delegating in parallel | [references/build-order.md](references/build-order.md) |

**A green `verify` and a wrong feature are entirely compatible.** The Laws are about structure.
If you changed behaviour and asserted nothing, you have shipped an unchecked claim.

## Do not

- Do not silence a check to make it pass. If a Law is wrong for this project, say so to the user
  — changing what is enforced is their decision, not yours.
- Do not create `shell.tsx` for a feature with no interaction.
- Do not promote a component into `shared/ui` because a `clone` info appeared. Promote only after
  the same shape has actually repeated in two or more features.
- Do not read `docs_HUMAN-ONLY/`.
