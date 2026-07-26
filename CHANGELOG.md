# Changelog

## 0.9.3 — Closing the write path's return route

0.9.1 and 0.9.2 made green honest about what the verifier *walks*. This release closes the one
gap that needed a judgement call rather than an implementation: **the result of an Effect had
no way back into Core.** L3 already demanded that non-determinism — explicitly including
server-assigned IDs and failures — be injected as values, but only the inbound half was
enforced, because L3 had no scan of its own and delegated to L2, which only reads `core.ts`.

The whole release adds **zero new Laws and zero net lines to `SPACTA.md`** (still 67). The
enforcement is split: `verify` requires the receptacle to exist, TypeScript's exhaustiveness
check forces `update()` to handle it. Nothing new had to be memorised.

### Breaking — what a green `verify` means has changed

- A feature whose Core builds an `Effect` carrying a `correlationId` now **fails** unless it
  declares an Action able to receive the answer. Existing projects are unaffected until they
  adopt `correlationId`: the check keys off construction sites, so adoption is per feature.
- A check that scanned **0 files is no longer listed as guaranteed** (see below). Output that
  previously claimed a law held may now say the law was not verified. The code did not change;
  the claim did.
- Running the verifier with no reference corpus beside it now exits `2`, not `0`.

### Added

- **L3 `effect-return` (err).** If a feature's `core.ts` constructs an Effect literal carrying a
  `correlationId`, that feature's `types.ts` must declare an Action able to receive the answer.

  The scoping is the interesting part. `Effect` is a single union in `shared/types.ts` shared by
  every feature — L7 forces this, and the human guide records it as a tension between Laws — so
  *"this feature's Effect"* does not exist at the type level. **Construction sites do.** Keying
  the check off where an Effect is built, rather than where it is declared, sidesteps the
  globalised vocabulary instead of fighting it. Measured against a real 6-feature project, one
  of which had adopted the pattern: 0 findings, 0 false positives.

  The receptacle must be an Action that is *not* the one requesting the write. Without that
  refinement the check is nearly vacuous, since the Shell already passes a `correlationId`
  inbound on the requesting Action.

  Deliberate false negatives: no Action declaration beside `core.ts`, an unresolvable union
  member, or no `correlationId` anywhere → silent. False positives are worse than false
  negatives for a Law.
- **The write-path pattern is in `starter/`.** `EffectResult`, an `Effect` carrying a
  `correlationId`, `runEffect` returning data and throwing on failure, `EFFECT_SUCCEEDED` /
  `EFFECT_FAILED` in the Action union, id injection and compensation in Core, and a `drain`
  queue that does not drop Effects born from an answer.

  `EffectResult` is **not** a fifth membrane vocabulary. It never crosses the membrane: the
  Shell turns it into an Action, and the Action crosses. The vocabulary stays four.

  `drain` is written as a module-level function, outside the component, and says in its own
  comment that a domain `if` placed there is a judgement belonging in Core. A shell gets
  rewritten as a feature grows; this loop should not be rewritten with it.
- **`starter/app/api/sample/route.ts`.** L5 declared it scanned `route.ts` and no `route.ts`
  existed — the declaration had outrun the example. Adding it surfaced a real contradiction:
  L5 makes generating an ID at a boundary an `err`, while the write path depends on the server
  assigning one. The resolution the example demonstrates is that **the handler never invents
  the id — the database assigns it and the route carries it back.** L5's wording gained one
  clause for this, since at a `route.ts` there is no upstream to "inject" from: a value
  *returned by* IO is a Source read, not generation.

### Changed — honesty of the output

- **A check that scanned 0 files is never printed as guaranteed.** Only a whole-run total of
  zero triggered `INCONCLUSIVE`; a single check at zero printed `—` and the guarantee list
  still asserted its promise. Found concretely: Next.js officially supports `src/app/`, and in
  that layout L5 walked zero files while the trust boundary reported *"Server boundaries
  generate no ids, time or randomness"*. **The mechanism the project uses to be honest was
  asserting something it had not checked.** Such checks now print under *"NOT verified in this
  project (0 files matched — the law was not enforced here)"* with the roots they searched.

  Zero files still does not fail the run: a project may legitimately have no app router or no
  `components/` yet, and making that fatal would put the honest state out of reach and train
  people to silence the check. Saying it out loud is the fix; refusing to run is not.
- **L5 and the export-ownership consumer walk find the app router at `app/` or `src/app/`.**
- **A missing reference corpus is `INCONCLUSIVE` (exit 2), not a printed `SKIPPED` that still
  went green.** Deleting `starter/` silently removed the wiring test — an escape hatch of
  exactly the kind 0.9.2 added the test to close. A declaration that does not block is not a
  check.
- **`verify/README.md`'s check table is generated from `CHECKS`,** wrapped in
  `<!-- checks:begin/end -->` and regenerated by `--write-docs`. A `docs-drift` err fires when
  the block and the registry disagree, so a stale table cannot be committed green. Generating
  alone would have left a wish that someone runs the script. The duplicated law list in
  `verify.mjs`'s header is gone, replaced by a pointer to `SPACTA.md` — two sources of truth
  were what caused the drift.
- **`verify/README.md` no longer claims "strong-prevention" for the tool.** The human guide
  places the same tool on the bottom rung of the assurance ladder. The claim is now scoped to
  what an individual check does, and notes that a misaimed check enforces nothing.
- **Comment-language boundary is stated.** `verify.mjs`'s internal comments stay Japanese;
  every printed string and every `CHECKS.promise` must be English. The boundary was already
  being observed and is now written down.
- `SPACTA.md` L3's enforcement column now describes the split between `verify` and `tsc`.
  Stale `L1–L8` references (post-L9/L10) corrected in `starter/README.md` and the human guide.

### Known gaps

- **The round trip is still not traced.** The receptacle is required; a Shell that discards a
  `runEffect` result stays green. No cheap AST test for the actual wiring is known.
- **The check is opt-in by construction.** A feature that never mints a `correlationId` gets no
  write-path guarantee — and no warning. Stated in `NOT guaranteed`.
- **Concurrency is untouched.** `drain` starts from the state it was handed; a dispatch landing
  mid-flight is not reconciled. `starter/` shows the correct shape, not a finished runtime.
- **Framework file conventions are still enumerated by name.** The `src/app/` hole above was one
  instance; `layout.tsx`, `error.tsx` and `middleware.ts` remain outside every `err` check. The
  structural fix — classify by role behind a platform adapter, and report an unclassified file
  rather than ignoring it — is not in this release.

## 0.9.2 — Verifying that the checks are aimed at something

Continues 0.9.1's theme — closing the distance between what a Law declares and what the
verifier actually walks — with no change to the philosophy. Nothing here required a
judgement call; the one remaining gap that does (the write path) is still open.

### Added

- **L6 wiring test.** `verify` now also proves that each `CHECKS` entry's glob selects at
  least one file in a reference corpus (`starter/`, shipped next to the verifier). This
  closes the gap stated under 0.9.1's *Known gaps*: the fixture self-test feeds text
  straight into each checker **function** and never exercises `root` / `match`, so a
  mistyped glob selecting 0 files passed the self-test and then reported green — 0 files
  yield 0 violations. It is "empty scan green" one level down: the run walks 80 files, one
  law walks 0, and nothing says so.

  The assertion is `> 0`, deliberately not a tuned threshold — the only claim is that a glob
  is wired to something. No checker executes during the test; **file selection alone is
  under test.** A failure names the offending check and exits `1`. When the corpus is absent
  (the verifier copied into a project that has no `starter/`), the test prints `SKIPPED` and
  states that the registry globs are unverified — it never silently passes, because a silent
  pass is the defect it exists to catch. (0.9.3 replaced that `SKIPPED` with `INCONCLUSIVE`:
  printing a warning and continuing to green was still an escape hatch.)

### Changed

- **`verify/README.md` matches the implementation again.** Its check table still described
  L4 as scanning `shell.tsx` only, omitted L9 and L10 entirely, understated L8's targets, and
  recommended `node verify/verify.mjs .` — the exact invocation that now exits `2`. Every row
  is now derived from the `CHECKS` registry, the exit codes are documented, and the four
  fixtures added in 0.9.1 are listed. A hand-written table that misstates what the tool walks
  is the same defect the Laws exist to prevent, one level up.
- **`verify.mjs`'s header comment matches the implementation again.** It described L4's scope
  as shells only, omitted L9 and L10 entirely, and documented exit codes predating
  `INCONCLUSIVE`. Content only: the comment language is left as it is pending a decision.
- **`setup.md` no longer overstates what the self-test proves.** Step 5 told anyone
  customizing the Form that "the L6 self-test will detect any omissions" — it does not, and
  that claim sat in the one document read by the people most likely to mistype a glob. It now
  states what each part of L6 can and cannot establish, and points at the scanned count.
- **The root `README.md` points humans at the current guide.** Its only human-facing link
  targeted an archived draft containing claims since retracted.

### Known gaps

The 0.9.1 list stands, minus one: **L6 verifying checker functions but not their wiring is
now closed** (see Added). The write path's missing return route — and therefore the flight
recorder's precondition — is untouched at this version and remains the one open gap that needs
a judgement call rather than an implementation. (Closed in 0.9.3.)

## 0.9.1 — Making green honest

The theme of this release is not new philosophy. Every change below closes a gap between
what a Law *declares* and what the verifier *actually walks* — the failure mode recorded in
`spacta-alpha-evaluation.md` as "Loopholes in Law Scope":

> No matter how broad a Law's name is, if the scanned target is narrow, the gap is still "hope".

### Breaking — what a green `verify` means has changed

- **Empty scans no longer report green.** `verify` now exits `2` with `INCONCLUSIVE` when it
  walked 0 files across all checks. Previously a directory with no `src/` or `app/` produced
  `verify: Green` and exit 0 — indistinguishable from a checker that is simply broken.
  (Spacta's own `npm run verify` was doing exactly this.)
  Individual checks scanning 0 files do **not** block: a fresh project with no `core.ts` yet
  is legitimate.
- **New L9 — Presentation Purity.** `features/*/components/*` and `shared/ui/*` are now
  scanned for IO and non-determinism (`fetch`, storage, `next/navigation`, `new Date()`,
  `Math.random()`, `crypto.randomUUID()`, `async`/`await`). `react` and `next/link` remain
  legitimate presentation vocabulary and are **not** flagged.
- **New L10 — Component Statelessness.** Files under `features/*/components/*` must be pure
  functions of their props: no `useState` / `useReducer` / `useEffect` / `useLayoutEffect`.
  `shared/ui` primitives are out of scope — widget-local state (disclosure, focus trap,
  popover position) is not domain state and never crosses the membrane.
- **L4 widened.** Exhaustiveness is now checked across all of `src/**`, not only `shell.tsx`.
  Two blind spots closed: features with no `shell.tsx` were never checked at all, and
  `shared/runEffect.ts` — the one switch that most needs an exhaustive terminator — was
  itself unscanned.

Projects with IO or local state in their presentation layer will turn red on upgrade.
Reference measurement: `livingdoc` (4,722 lines, 39 presentation files) needed **no changes**.

### Added

- **`verify` prints what it scanned**, per check, on every run.
- **`verify` prints its trust boundary**: what this green guarantees, and what it does not
  (type integrity, judgement in shells, the effect-result round trip, build order,
  presentation consistency, semantic correctness). The "guaranteed" list is generated from
  the check registry, so it cannot drift away from what actually ran.
- **`CHECKS` registry** — a single table binding each law to its scan target, severity and
  promise. Scanning, the scanned-count report and the trust boundary all read this one table.
- **`typescript` fallback** — `verify` falls back to its own TypeScript when the target
  project has none, so a directory without `node_modules` can be verified.
- **L6 fixtures for L9 / L10**, including `good-shared-ui.ui.tsx`: an interactive primitive
  using hooks and DOM events that **must stay green**. It is the executable record of the
  decision to scope L10 to feature components only.
- **`SPACTA.md` §4-6** — build order for parallel delegation: materialize upstream layers as
  real files before parallelizing downstream ones. Explicitly noted as *not* verified.
- **`SPACTA.md`** — `shell.tsx` is optional; `clone` info is never a reason to add a
  cross-feature import or to promote a component into `shared/ui`.

### Changed

- **`npm run verify` / `npm run garden` now target `starter/`.** They previously targeted the
  Spacta repository itself, which contains no `src/` or `app/` — meaning the reference
  implementation had never been verified even once. `starter/` is now the regression corpus.
- **`garden` fails safe.** It blocked only on `status === "red"`; it now blocks on anything
  that is not an affirmative `green`, so an unscanned tree is never gardened.
- **`L3` is stated honestly.** Its enforcement column now says that outbound effect results
  are *not* scanned. Server-assigned IDs are non-determinism and fall under L3, but nothing
  verifies that they travel back through an `Action`.
- **`starter/` is language-neutral.** All comments, error messages and sample UI strings are
  English, so copying the reference implementation no longer mixes languages into the output.

### Known gaps (stated, not fixed)

- **The write path has no defined return route.** Optimistic updates are not compensated on
  failure and server-assigned IDs have no channel back into Core. `verify`, `tsc` and a
  curl-based E2E are all blind at the same single point. L3 names this territory but nothing
  scans it.
- **`HUMAN_GUIDE` §6.4 (flight recorder) depends on that round trip existing.** Action logs
  can only replay state if IO results also arrive as Actions.
- **L6 verifies checker functions, not their wiring.** The self-test feeds fixture text
  straight into each check, bypassing the `CHECKS` registry — so a mistyped glob that scans
  0 files still passes the self-test and still reports green. Today only the printed
  `Scanned: N files` line exposes that. Asserting `scanned > 0` for every check against
  `starter/` would close it.
- **Judgement accumulating in `shell.tsx` is still unchecked** (L10 covers components only).
- **`starter/` has no `route.ts` example**, although L5 scans `route.ts`.
