# Spacta — Overview

Spacta is a way of laying out a Next.js application so that **one feature can be worked on
without holding the rest of the application in your head**, and so that a script — not a
reviewer, not a memory, not a promise — can confirm afterwards that the work stayed inside
its boundary.

This is a **v0.11 early-feedback release**. The architecture runs and the verifier runs; the
scope of what is actually enforced is narrower than the ambition, and this document exists
partly to say exactly how much narrower.

The project's operating rule is: **a hole is allowed, hiding a hole is not.** Everything
below is written to that standard. Where something is unchecked, it says unchecked.

---

## The one sentence

> Only data crosses the Core boundary. No IO enters, and no calculation escapes.

A feature lives entirely in `src/features/<name>/`. Inside it, `core.ts` is a pure state
machine — `(state, action) -> (nextState, effect?)` — that may not touch the network, the
clock, randomness, storage or the DOM. Everything non-deterministic is read at an edge
(`shared/source.ts`), passed *in* as a value, and everything with a consequence is declared
as an `Effect` value and executed *out* at a single dispatch point (`shared/runEffect.ts`).
The vocabulary that crosses the membrane — `State`, `Action`, `Effect`, `InitData` — is
frozen in `types.ts`.

None of these ideas are new. Functional Core / Imperative Shell, the Elm/Redux loop, bounded
contexts, dependency injection of non-determinism — all borrowed. What Spacta adds is that
the boundary is not a convention. `verify` reads the actual TypeScript syntax tree and fails
the build when the boundary is crossed.

---

## What this is for

**Context isolation.** A feature cannot import another feature's internals, and the shared
layer cannot import a feature's internals. So the material needed to change one feature is
that feature's own files, not the whole tree and not the implicit causal web behind it. This
is not only a token-budget argument: even a model that could read the entire codebase would
still face a different problem — "I read everything" and "I can guarantee my change did not
quietly break state handling somewhere else" are not the same claim.

**Lower task complexity.** Exhaustive switches and explicit `Action`/`Effect` types are
tedious for a human to write and cheap for a model. Their payoff is that "work out what
should happen by tracing hidden interactions" becomes "fill in the one missing case" — a
mechanical, pattern-matchable job rather than a judgement call. (Note the tension: isolation
shrinks what has to be *read*, explicitness grows what has to be *written*. Whether the trade
is net cheaper has not been measured.)

**Contract-driven parallel work.** Because each feature publishes a frozen `types.ts`,
separate agents can implement separate features against those contracts without negotiating
internals. In this project's alpha evaluation, several independent agents did exactly that
and integrated with zero collisions — but attribute that correctly: **the Laws did not
prevent the collisions.** The Laws stop sideways (feature to feature) and reverse (shared to
feature) coupling. What parallel agents actually collide over is *shared upstream*, and the
reason they didn't is that the contracts were frozen by a human first. The Laws' contribution
is to confine the merge points to a small number of named places.

**Replacing hope with a rule.** Telling a model "please don't call `fetch` in this file" is a
wish. It may be honoured; there is no mechanism that makes it so, and long lists of
prohibitions compete for the model's attention with the actual task. Spacta moves those
prohibitions out of the prompt and into a script: write the code, run `verify`, fix until
green. This matters, but it is one motivation among the four above — not the whole case.

---

## What a green `verify` actually means

`verify` prints, on every run, what it scanned and what that green does and does not cover.
The guarantee list is generated from the check registry, so it cannot drift away from what
ran. From the reference implementation:

```
  Guaranteed by this green:
    L1  No feature imports another feature's internals
    L2  core.ts holds no IO and no non-determinism
    L3  An Effect that asks for an answer has an Action able to receive it
    L4  Every handwritten switch on effect.type terminates exhaustively
    L5  Server boundaries generate no ids, time or randomness
    L7  shared/ does not import feature internals
    L9  Components and shared/ui perform no IO and no non-determinism
    L10 Feature components are pure functions of their props

  NOT guaranteed by this green:
    - Type integrity (props / contracts)                    -> run `tsc --noEmit` separately
    - Judgement kept out of shell.tsx                       -> not checked
    - Widget-local state in shared/ui staying non-domain    -> not checked
    - Effect results actually reaching Core at runtime      -> partially checked
    - Concurrent dispatch during an in-flight Effect        -> not checked
    - Write-path round trip without correlationId           -> not checked
    - Build order when delegating to parallel agents        -> not checked
    - Presentation consistency                              -> info only (L8), never blocks
    - Semantic correctness                                  -> never checked
```

(Abridged; the real output carries a one-line reason for each entry.)

Read both lists before treating green as permission to skip reading the diff.

Some mechanics worth knowing:

- Exit `0` is green, `1` is red, `2` is `INCONCLUSIVE` — returned when the run walked zero
  files. "Found no violations" and "looked at nothing" are otherwise the same output.
- Individual checks scanning zero files do **not** block — a project with no app router or no
  `components/` yet is legitimate. But such a check is **never listed as guaranteed**. It is
  printed separately under *"NOT verified in this project (0 files matched — the law was not
  enforced here)"*, with the roots it looked in, so a check aimed at the wrong place announces
  itself instead of passing for a law that held.
- L6 verifies the verifier: planted violations in `verify/fixtures/` must be rejected, clean
  fixtures must not be flagged, and every registry glob must select at least one file in the
  reference corpus. The second part exists because a mistyped glob scanning zero files used
  to pass the self-test and then report green.
- L8 (presentation vocabulary), clone detection and export-ownership are **info only**. They
  never fail a build.
- **Green `verify` is not green types.** `verify` inspects structural boundaries; broken
  references and prop mismatches are found by `tsc --noEmit`, which you must run separately.

So the honest formulation is not "green means no bugs". It is: *if there is a bug, it is
local, explicit and deterministic* — reachable from `(state, action)` alone, with no hidden
input and no propagation into another feature.

---

## What Spacta does not solve

This is the most important section, and it is not softened anywhere.

**Coupling through data and schema.** L1 forbids imports. It says nothing about two features
reading the same database table or calling the same API. Delete the code coupling and the
coupling migrates to the schema and the protocol — the same lesson microservices spent a
decade learning. In one real project built this way (4,722 lines), `shared/source/queries.ts`
grew to **508 lines**, roughly three times the size of `shared/types.ts` (175 lines), and a
single `TRACE_SELECT` constant came to be shared by three features. Adding one column to that
table now propagates through three features' read paths at once. **L1 stayed green
throughout.** According to the implementer, the decision that created the coupling — assemble
the read model on the source side — was one that none of the Laws had an opinion about,
for or against.

**Next.js's own implicit semantics.** RSC cache semantics, revalidation timing, the
serialization rules at the client/server boundary — Next.js's largest source of untraceable
behaviour lives here, and Spacta's Laws pass almost all of it straight through. Worse, the
framework is evolving toward *more* implicit machinery (Server Actions, implicit fetch
caching), so Spacta is structurally swimming against the framework's current.

**Changes to shared upstream.** L1 blocks sideways dependencies and L7 blocks reverse ones.
The *correct* direction — `components` and `shell` depending on `shared/ui` — is guarded by no
Law at all. In the same measured project, about 30 files cross that edge. Rename a prop on a
`shared/ui` `Button` and everything downstream breaks; the tool that catches it is `tsc`, not
`verify`. This is why parallel delegation requires materializing upstream layers as real
files before starting downstream ones — and `verify` does not check that either. Build order
is a procedure, not a property of the tree.

**Tension between the Laws themselves.** Because L7 forbids `shared/runEffect.ts` from
importing feature types, keeping a single dispatch point forces the `Effect` union into one
globally shared file. "Add an Effect to feature A" therefore becomes an edit to something
feature B depends on. That is coupling produced by the interaction of two Laws, in a place
L1's isolation cannot reach.

**The write path's return route — partly closed, and only partly.** L3 says to inject
non-determinism as values, and server-assigned IDs are non-determinism. Until v0.9.3 the
outbound half was unenforced, and it produced a real defect: optimistic updates were not
compensated on failure and temporary client-side IDs (`temp_*`) were sent to the server, while
`verify` was green, `tsc` reported zero errors, and an end-to-end test passed. **Three gates
went blind at the same single point.**

What is enforced now: if a feature's Core builds an `Effect` carrying a `correlationId`, that
feature must declare an Action able to *receive* the answer — not merely one that requests the
write — and TypeScript's exhaustiveness check then forces `update()` to handle it. What is
still not enforced: that the answer is actually wired back at runtime. A `runEffect` result
that the Shell quietly discards remains green. And the check is **opt-in by construction** — a
feature that never mints a `correlationId` is not checked at all, so a codebase that ignores
the pattern entirely gets no write-path guarantee and no warning about it. Adoption is
deliberately graduated; the price is that green says less in an un-migrated feature.

**Semantic correctness.** Writing `count + 2` where you meant `count + 1` passes green. The
verifier checks boundaries, not meaning. It never claims otherwise.

The fair summary is that Spacta solves a *part* of the problem of building Next.js
applications. That is true and it is not a concession — the part it solves happens to be the
part that determines whether an agent can safely be handed one unit of work.

---

## Where this sits on the assurance ladder

Software assurance has rungs:

> syntactic boundary linting -> static analysis -> property-based testing -> model checking ->
> formal proof

Safety-critical practice (MISRA, ISO 26262, SPARK Ada, seL4) operates several rungs up.
**Spacta's `verify` is on the bottom rung — syntactic boundary checking.** That is a
deliberate choice, not an oversight: it is the cheapest rung and the easiest to put inside an
AI's write-run-fix loop, and it is the only rung whose cost survives being run on every
iteration. The point of naming the rung is that a project should not be allowed to imply it
is standing higher than it is.

The route upward is at least structurally open: a pure state machine with all inputs explicit
is directly usable as input to property-based testing or model checking, and an append-only
log of `Action`s would be replayable as a flight recorder. Both are *unimplemented ideas* at
v0.9. The flight recorder's precondition — that IO results re-enter Core as Actions rather than
as hidden inputs to `update()` — is what v0.9.3's write-path work was for; the pattern now
exists and is checked at the declaration, but nothing yet records the log.

---

## How to read this repository

- **`SPACTA.md` is the rulebook.** It is written for an AI agent, and it is the normative
  source for L1-L10. Its trust hierarchy is worth internalizing:
  *Law (enforced by failure) > Form (default template, mutable) > Advice (`verify` info) >
  Judgement (not inspected by tools).* Only the first is guaranteed.
- **The `verify` output's Guaranteed / NOT guaranteed block is the contract.** Not this
  document, not the README. If the two ever disagree, the printed block is right — it is
  derived from the code that ran.
- **`starter/` is the reference implementation.** A minimal project that is green, and also
  the corpus the verifier's own wiring test runs against. It shows the default *Form*; the
  Form is mutable, the Laws are not.
- **`verify/README.md`** documents each check's exact scope, its severity, and an explicit
  limitations section.

Run it yourself:

```sh
npm install spacta
npx spacta-verify <projectRoot>          # boundaries only
npx spacta-verify <projectRoot> --tsc    # boundaries, then types
```

Point it at a directory that actually contains `src/` or `app/`. Pointed anywhere else it
walks zero files and exits `2`.

---

Deeper philosophical background exists in Japanese, in
[`docs_HUMAN-ONLY/ja/HUMAN_GUIDE.md`](ja/HUMAN_GUIDE.md).

This document is independent of that guide by design: it is not a translation and not a
summary, and it carries no obligation to track the Japanese guide's structure as that guide
grows. It is meant to be correct on its own terms, and to be corrected on its own terms.
Feedback on what is confusing, or on any claim here that the verifier does not actually
check, is the most useful thing you can send at v0.11.
