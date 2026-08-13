# Build order when delegating in parallel

`verify` does not check this and cannot: it is a procedure, not a property of the tree. It is
here because it is the one thing on the "not guaranteed" list that costs a whole rebuild when you
get it wrong.

## The rule

**Materialise upstream layers as real files before parallelising anything downstream.**

> A prose description of an API is not a contract. Only code is.

Two agents handed the same paragraph will produce two different prop shapes, and you will find
out at integration.

## The order

1. `shared/ui` primitives, and the feature's `types.ts` — **written to disk and frozen**
2. `features/*/core.ts` — the judgements
3. `features/*/components/*` — may run in parallel, now that props are real types
4. `features/*/perform.ts` and `shell.tsx`
5. `app/**` — the boundaries

Agents may run in parallel **only within a layer whose upstream already exists on disk.**

## Why `types.ts` first

`types.ts` is the membrane vocabulary. Everything downstream is typed by it, so freezing it early
turns integration mistakes into tsc errors at the moment they are made instead of at the end.

If you find you must change a frozen `types.ts` mid-flight, stop the parallel work first. Editing
a contract while three agents are compiling against it produces failures nobody can attribute.

## Before delegating

- [ ] `types.ts` exists and is complete for every feature involved
- [ ] `shared/ui` primitives the components need already exist
- [ ] each agent's brief names the files it may write, and no two lists overlap
- [ ] `verify` is green *now* — parallel work on a red tree makes the new red unattributable
