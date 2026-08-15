# Changelog

## 0.11 — A feature's vocabulary goes back to the feature

**Zero new Laws.** `SPACTA.md` still holds ten, and the reference app's `shared/types.ts` went
from **195 lines to 37**.

0.10 gave every feature one engine to run its Effects through. What it did not revisit was the
reason the shared vocabulary existed at all: one switch needs one union, and one union puts one
feature's words in everybody's dependency. The engine reads `type` and `correlationId` off an
Effect and nothing else — the union had already stopped earning its place, and nothing noticed.

Three moves, in order. **Effects go to the feature that declares them. The answer goes with
them. The read models stop sharing a file with the contract.**

The criterion that came out of it is the part worth keeping, because the v0.9-era writing did
not have one and cited the shared union as a success:

> **Does it change when you add a feature?**
> No → *mechanism* (`post`, `createRuntime`, the name→role table). Condense it.
> Yes → *vocabulary* (`Effect`, `Answer`). Do not. It belongs to the feature.

A shared declaration was never protecting two screens that write the same row — the endpoint
couples them, and changing `/api/bookmarks` breaks both either way. The declaration only made
the coupling look managed.

### Breaking

- **The shared `Effect` union is gone.** A feature declares its Effects in its own `types.ts`
  and carries them out in its own `perform.ts`, which sits beside it. Ten of livingdoc's
  thirteen members had no business being shared — seven had a single constructor, `RELOAD` and
  `LOG` had none at all, `NAVIGATE` carries no domain payload. The three genuinely built by two
  features are now **written out on both sides** (§2: duplication over coupling). `measure`
  reports the price as a number instead of an impression: `effectUnion` names where each member
  is declared, how many remain shared (`0`), and which tags are declared twice. It is not a
  number to drive to zero.
- **L4 gained a second termination form.** `assertNever` needs a union of two or more, and
  TypeScript collapses a one-element union — three of livingdoc's six effect-declaring features
  have exactly one Effect, a shape that could not arise while the application had one switch
  with thirteen members. A `switch` with no `default`, written as the last statement of a
  function whose declared return type excludes `undefined`, is checked by tsc instead: an
  unhandled member is TS2366. All three conditions carry weight, and each has a fixture that
  removes exactly one of them.
- **`Perform`'s `id?: string` is absorbed into `data?: R`.** The two said the same thing, `id`
  being the older of the pair from the version when a write's only conceivable answer was a
  database key. The engine copied it at one line and never read it; `verify` never knew it
  existed, so **no Law moves** — this is the engine dropping a field, not Spacta changing a
  rule. Ten features carried it and exactly one read it. `EffectResult` leaves
  `shared/types.ts`. Features now declare `Answer` themselves and read `action.data`; the five
  that never read a key say so by declaring nothing and returning `Promise<null>`, a shape that
  could not previously be written down.
- **Two blocking checks that are not Laws.** `react` or `next` named inside the engine, or a
  feature importing the data layer, turns red on upgrade. `engine-portability` walks the
  `spacta` package's own `engine/` — which ships, so it is present wherever the verifier runs —
  and a project's `src/shared/spacta/` as well, if it still hand-carries one. See *Added*.
- **`measure` gained a `readModel` zone, so the numbers discontinue here by design.**
  `contract` drops 195 → 37 for livingdoc and a key appears that earlier snapshots do not have.
  Nothing reads `metrics/baseline/*.json`, so no gate breaks; the older records describe a
  different shape and should be read as such.
- **The tier ladder stops failing a feature that broke no rule.** `judgeTier` tested for an
  `InitData` parameter before it tested for a shell, so a read-only screen fell off the first
  rung — found by a real feature, not by inspection. Without a shell a feature is `T1` whether
  or not it takes an `InitData`: a missing `InitData` is not an unchecked injection, it is the
  absence of anything to inject, and L2 and L9 reach a helper-only core just as far. `T?` is
  **narrowed, not retired** — it now means a feature that has a shell and no readable state
  machine. Two self-test cases pin both sides, because *"T? was abolished"* and *"T? was
  correctly narrowed"* are otherwise indistinguishable.

### Added

- **The instructions and the enforcement install into the harness.** `npx spacta-init` writes
  `.claude/skills/spacta/` and `.claude/hooks/spacta-verify-on-stop.mjs` into a project, and
  prints the Stop-hook settings entry (`--write-settings` merges it, after a backup). Only the
  skill's `description` sits in context; its body loads when `features/`, `shared/` or the app
  router is touched, and the reference files load only when the body sends the agent to them.
  Both are written by the package rather than tracked separately, because the skill describes
  the Laws the *installed* verifier enforces — a skill one minor version out from its tool is
  worse than no skill, since it is confidently wrong. **Re-run it after upgrading.**

  `SPACTA.md` §4-5 says "run `verify` yourself and fix all errors until green", which by
  Spacta's own trust hierarchy is *Advice*. The Stop hook makes a turn unable to end on a red
  one. **It is not a Law**: it binds sessions in that harness with that hook installed and
  nothing else — human commits and other agents pass straight through. The Law is CI. This is
  the same check moved to where fixing it costs one edit.

- **`tools/smoke-package.mjs` checks the artifact rather than the source tree.** It packs,
  installs the tarball into a scratch project that has never seen this repository, and then uses
  it both ways an adopter will: importing the engine, and running the CLIs. It is the only gate
  that can see a `files` or `exports` mistake — a corpus that did not ship leaves the L6 wiring
  test with nothing to measure against, and every other check in the repository stays green.

- **`.github/workflows/ci.yml`.** Until now every check here was invoked by a person remembering
  to invoke it, which for a project whose definition of a Law is "physically enforced via
  failure" made its own gates Advice with a good reputation.

- **An Effect may answer with data, not only an id.** `R` threads an answer shape from the
  feature, through the engine, into the outcome Action; the engine does not look inside it, just
  as it does not look inside `E`. A type parameter rather than a member of a shared union **on
  purpose** — a shared one would name every feature's answer in a single file, which is the
  coupling this release spent itself removing. `R` defaults to `never`, so a write-only feature
  says nothing, and all ten features compiled unchanged.

  Until now a feature could write but never read: the only road for more data was a fresh
  `InitData`, and `RELOAD` had no constructor in any of livingdoc's ten features — the escape
  hatch had never been used. `saved` now performs `LOAD_MORE`, **the first read any feature does
  after its page has loaded**, and the recorder logs the answer, because a replay cannot re-fetch
  and a flight recorder that dropped it would rebuild a screen the user never saw.
- **`tools/mutate.mjs`** — *"a check nobody has watched fail is not a check"*, mechanized. It
  asks `verify` which features declare a closed round trip (`T3`), breaks that round trip in each
  of them, runs the behavioural gates, and reports what **survived**.

  First run against livingdoc: **10 mutations across 5 T3 features, 5 survived.** `draft` and
  `watchlist` had no behavioural assertion at all; `pageview`'s compensation had none either.
  All three declare T3, so `verify` had nothing to say. The sharper number is which gate did the
  killing: **`crosscheck` killed none of the ten.** It compares a run against its own replay, so
  a feature that is wrong but deterministic passes every scenario — its own header says so, and
  this measures it. Every kill came from `runtime.serialization`, which asserts states.

  `verify` is run each time and never counted as a killer; its green printed beside a `SURVIVED`
  line is the honest picture. `tsc` is deliberately excluded — the inserted `return` makes the
  rest of the case unreachable, so tsc would appear to catch a mutation it merely noticed the
  shape of. It restores in `finally`, snapshots `replay-sessions/` around the run, and refuses to
  place a mutation it cannot place uniquely rather than guessing. **Exit 1 is a measurement, not
  a failure.**
- **`engine-portability` and `data-layer-import`** (`law: "—"`, `severity: "err"`) — the first
  blocking checks that are not Laws. Both properties were held up by prose alone, both were
  planted, and both went straight through: `react` added to `engine/runtime.ts` left `verify`
  green on both corpora and the sync script of the day copied it to three places without a word;
  a feature importing `shared/source` left `verify` green at exit 0, when the only way to know
  was a `grep` somebody remembered to run. `engine-portability` walks the package's own
  `engine/` — the copies it was first written against no longer exist.

  Neither is an eleventh Law — one is a design promise made by a single file, the other is a
  sentence `SPACTA.md` §3 already asserts as fact. They print on their own line so a green cannot
  be read as claiming an unnumbered law:

  ```
  ✓ Laws (L1, L2, L3, L4, L5, L7, L9, L10): No violations
  ✓ Blocking checks that are not Laws (engine-portability, data-layer-import): No violations
  ```

  `engine-portability` **fails closed**: it walks this package's own `engine/` — plus a project's
  `src/shared/spacta/`, if it still hand-carries one — and excludes nothing but `react.ts`, so a
  new engine file is covered the day it appears rather than the day someone remembers to list it.
  Rooting it in the package is what keeps that true after the copies went away: an adopter with
  no engine in their tree would otherwise walk zero files and be told there were no violations. `data-layer-import` **rejects `import type` too** — a type-only import
  vanishes at compile time, which is exactly why this went unnoticed; what it costs is a reader
  sent into `shared/source` to understand `saved/types.ts`, and that reference range is what the
  check is standing in for.
- **`spacta` is an npm package, and the copies are gone.** The engine existed in three places
  with no source among them, held together by a byte-identity assertion that catches a
  divergence after the fact and cannot say which copy was right. Half of this release was spent
  giving that assertion a direction (`engine/` became the source) before concluding that the
  copies were the problem. `npm install spacta` now brings the engine (`spacta/runtime`,
  `spacta/react`), the verifier, `measure`, `garden`, the replay harness, the skill and the Stop
  hook — **one package, one version.** The engine and the verifier are two halves of one
  contract: `verify/fixtures/` encodes the shape `engine/` produces, so letting them drift apart
  at the version level would reintroduce exactly the staleness this ends. `tools/vendor-sync.mjs`
  is deleted, and `starter/src/shared/spacta/` with it — the starter imports `spacta/react` like
  any other dependency. The record it closes: `livingdoc/verify/` was 35 files that 0.10 found
  still on v0.9.x, missing L3, L9, L10 and roles, gone stale with no signal at all.
- **A tenth line under `NOT guaranteed by this green`: statement-level defects.** Measured, not
  supposed. A NO-BREAK SPACE sat inside `normalizeQuote`'s `[\s ]` — the function `POST
  /api/traces` and Core both call so that a stored `quote_key` and a grouping key cannot
  disagree — and **every gate this project owns passed it**: the Laws read placement and
  imports, the cross-check replays a deterministic run faithfully whether it is right or wrong,
  `mutate` breaks round trips and not regex literals, and `tsc` sees a valid string. It is
  harmless (JavaScript's `\s` already matches U+00A0), which is the only reason it is a footnote
  and not an incident: a defect that satisfies all three of the central claim's conditions —
  local, reproducible from `(initData, actions[])`, no hidden input — is exactly the shape those
  conditions cannot see. ESLint's default recommended set caught it with no plugin. The line
  points there the same way the first line points at `tsc`; **the Laws are still ten**, and a
  linter is not one of them, for the reason `SPACTA.md`'s own hierarchy gives: a rule that
  `// eslint-disable-next-line` can switch off is not physically enforced, and therefore is
  Advice — which is the layer that actually wants an escape hatch with a reason attached.
- **`SPACTA.md` §3 — Scope.** Three facts an adopter previously had to find by reading the
  source: fetching and persistence are not Spacta's and two features reading the same table are
  coupled where no Law looks (`measure`'s `spread` keeps that hole countable); an Effect brings
  back an identifier, not a page of data; and one feature instance performs one Effect at a
  time — the serialization that makes a run reproducible from `(initData, actions[])`, paid for
  in concurrency, which was written down nowhere.
- **`docs_HUMAN-ONLY/dev/docs/`** — 32 files, 596K. Every judgement that shaped 0.10 and 0.11,
  including which invariants turned out to have no check behind them, had been living outside
  any repository while the code it described was tracked.

### Changed

- **`runtime.serialization`: 45 → 48 → 72 assertions, and 70 at the end of the release.** The
  middle step is `pageview` adopting the id the database assigns; the third is what `mutate`'s
  five survivors should have been failing against all along. The two it gives back are the
  byte-identity checks over the engine and its copies — they left with the copies, and no
  behavioural assertion left with them. `draft`'s late answer is the one worth reading: a save leaves with a
  snapshot, the reader keeps typing while it is away, and the answer confirms *the snapshot that
  was sent*. Marking the newer text clean would claim the server holds something it has never
  seen, and the screen would then stop offering to save it. The comment in `draft/types.ts`
  described exactly this and nothing checked it. `mutate ../livingdoc` now reports **10 killed,
  0 survived**.
- **The starter no longer teaches the shape this release replaced.** `sample` declares its own
  Effects and performs them; `shared/runEffect.ts` keeps `post`, which is mechanism and nobody's
  vocabulary. Doing this first was what closed a verification hole: `roleCoverage` skips a role
  with no files, so `feature-internal` — which claims L1 and L4, and which every `perform.ts`
  lands in — **had never been weighed against anything.** The file carrying a feature's entire
  IO sat in the one role whose law claims were unchecked. Demonstrated in both directions before
  restoring: with `perform.ts` present, a false claim is caught by name at exit 1; with it moved
  away, the same lie passes green.
- **The replay stub carries a read's answer.** `settle()` resolved every call as `{ id }`, so a
  scenario could hand back a page of rows and the run would receive none — then replay
  identically and report green. `S10` drives a real post-load read, then a removal that fails on
  a row which was never in `initData`, so compensation has to restore it.
- **`S7` was exercising the wrong path.** `scenarios.mjs` is `.mjs` and nothing typechecks it;
  once `MODERATE` carried an identifier the scenario quietly started testing the late-answer
  guard instead of compensation. Fixed, `S9` added, and moderation's states asserted in
  `runtime.serialization` rather than left to the cross-check.
- **The public surface says what version this is.** `package.json` said 0.9.3 while README and
  OVERVIEW said "v0.9 early feedback release"; all three now say 0.11. References to 0.9.x that
  describe *when something changed* are left alone. README gained a note that the tooling runs
  under either runtime — the scripts keep saying `node` so the verifier stays usable in projects
  without bun, and the tools spawn themselves with `process.execPath`.
- **`SPACTA.md` §3 stopped contradicting the release it shipped in.** *"An Effect brings back an
  id, not data. A feature cannot fetch after the page has loaded"* was written earlier in this
  version, before `R` existed, and `saved`'s `LOAD_MORE` then made it false — the scope section
  denying a feature this release had just added. It now states what actually holds: the answer is
  shaped by `R`, which the asking feature declares as its own `Answer`; **what a feature may not
  do is reach IO anywhere else** (L2 in Core, L9 in components); and a whole new screenful is
  still an `InitData`. §3 was the newest section in the file, which is where a sentence written a
  few commits too early is hardest to see. The file is still 79 lines.
- **`shared/types.ts` 195 → 37** for livingdoc, the 179 lines of read models moving to their own
  file and their own `measure` zone. The engine is 316 lines, up from the 292 it held across five
  snapshots — spent deliberately on `R`, and spent there so that the contract did not have to
  move at all.

### Known gaps

- **`mutate` sees two cases per T3 feature and nothing else.** Effect construction, validation,
  the *contents* of a compensation (whether it restores the right row), rendering and the data
  layer are untouched by these mutations. `0 survived` is not a statement about any of them.
- **`crosscheck` kills nothing, and now that is measured rather than asserted.** It establishes
  reproducibility, not correctness. Behaviour goes in `runtime.serialization` as state
  assertions.
- **Nothing has run.** `verify`, `tsc`, the cross-check and the serialization test all execute the
  engine and five features' `core.ts`. Every `shell.tsx`, every `components/`, the contents of
  every `perform.ts`, every `route.ts` and all of `queries.ts` — the SQL included — have never
  been executed by anything. This is the largest open item at 0.11 and it is not a design
  question.
- **The package has one release behind it.** `npm install spacta` is checked by
  `tools/smoke-package.mjs` — packed, installed into a scratch project, and used both ways an
  adopter will — but no second application has adopted it yet, so what should be distributed is
  answered by argument rather than by a second data point. `starter/` ships inside the tarball
  because the L6 wiring test needs a reference corpus wherever the verifier runs; whether that
  is the right call is the open part.
- **Coupling through data is untouched** and remains the largest known gap, as it has since 0.9.4.

## 0.10 — One runtime, and a claim that can be measured

0.9.1–0.9.4 closed the distance between what a Law *declared* and what the verifier *walked*.
This version leaves the verifier and goes after two things a verifier structurally cannot reach:
**the loop each feature had been writing by hand**, and **the central claim itself**, which had
never been measured.

### Breaking

- **The hand-written drain is gone from `starter/`.** It carried the same loop livingdoc had
  grown three divergent copies of, under a comment admitting it showed *"the correct shape, not a
  finished runtime"*. The shape is now a runtime: `src/shared/spacta/runtime.ts`, byte-identical
  between starter and the app. A project that copied starter's loop should adopt the runtime —
  two of the three copies in the field were discarding the server's answer, with `verify` green
  throughout.
- **State leaves the shell.** `useSpacta` holds it and mints `now` and ids; what remains in a
  shell is JSX wiring, state into props and callbacks into `dispatch`.

### Added

- **`replay/` — the cross-check.** It drives livingdoc's real `core.ts` through the real engine
  with `perform` stubbed, rebuilds the run from the session file using `init` and `update` alone,
  and compares every intermediate state, the states published to subscribers, and the final one.
  `S1`–`S8` aim at the theorem's clauses (2) and (3). `S2` and `S3` also run against a
  transcription of the pre-engine shell loop, which **diverges at Action #1 and #5** — the
  before/after evidence that serialization landed.
- **`harness.selftest.mjs`.** It plants divergences the harness must reject: a dropped Action
  with the trace trimmed so only the state comparison can catch it, a duplicated Action, a
  mid-run divergence that converges again, `Date.now()` and `Math.random()` inside `update`, and
  a `State` smuggled into a session file. L6's lesson one level up.
- **`metrics/measure.mjs`.** Zones by file and line, the Effect union with which feature
  constructs each member, `spread` (per shared export, who imports it), and the tiers — which it
  **asks `verify` for** rather than judging itself, because a second copy of that ladder would be
  the same meaning re-implemented slightly differently. Deterministic, no AI, JSON on stdout, and
  kept out of `verify`: green means the Laws are kept, not that the numbers are good. *Detection
  is `verify`, measurement is `measure`, transformation is `garden`.*

  **It refuses to report rather than report something rotten.** A file under `src/` or the app
  router that lands in no zone stops the run — no greedy catch-all exists to sweep it up — as do
  recorded sessions reaching a zone, and absent tiers. Exclusions are named in the output, which
  is how livingdoc's bundled `verify/` corpus is visibly not in the tally.
- **The tier ladder, `T0`–`T3`, printed on every `verify` run.** A project that adopted Spacta
  part-way used to get a green covering nothing of what it skipped: `materialrequest` and
  `moderation` declared Effects whose answers they discarded, and because those Effects carry no
  `correlationId`, L3's receptacle check never fired. **A tier is never red and never touches the
  exit code** — T1 and T2 are legitimate, and forcing a round trip on a feature that does not need
  one trains people to reach for the ignore list. Saying it out loud is the fix. Verified in two
  layers, because fixtures alone pass a judgement wired to nothing and a corpus alone passes a
  judgement that always answers T3.
- **`SPACTA.md` §4-3 — "do not write your own effect loop"**, the instruction whose absence let
  the loop be written three times. L3's enforcement column now names what actually holds the
  outbound half (the engine dispatches every outcome, tsc's exhaustiveness forces a case,
  `verify`'s receptacle check behind them), and L4 says why a feature does not switch on
  `effect.type` at all. No new Law.

### Measured

livingdoc went from six features to ten, with a snapshot at each step (`metrics/01..04.json`,
plus the baseline):

- **The engine zone is 292 lines in all five snapshots.** Four features arrived, two of them
  needing the write-path round trip, and it moved by nothing.
- **`shared/` stayed at 27 files throughout** — it grew in lines, never in file count — so its
  share of the tree fell from **32.5% to 25%**.
- **`contract` went 209 → 256 lines and the Effect union 9 → 13 members.** That is the growth L4
  and L7 made *structural*, and it is what 0.11 went after.

### Known gaps

- **The cross-check compares a run against its own replay.** A feature that is wrong but
  deterministic passes every scenario. Stated in its own header at this version; measured in 0.11,
  where it killed 0 of 10 planted mutations.
- **`livingdoc/verify/` was a v0.9.x copy** without L3, L9, L10 or roles — synced byte-for-byte
  here, but a vendored copy still goes stale silently. Given a source and a `--check` in 0.11.
- **Clause (4) of the theorem is unverifiable in-process.** Coupling through a shared table never
  appears in an Action log, and every cross-check run prints that first among what it does not
  verify.

## 0.9.4 — Laws speak in roles

0.9.3 patched L5 to look in `src/app/` as well as `app/`. That closed one instance and not the
class: `layout.tsx`, `error.tsx`, `middleware.ts` and every convention Next.js has not shipped
yet were still outside every `err` check, silently. **Enumerating framework filenames opens a new
hole every time the framework moves.**

A platform table now translates **names to roles**, `CHECKS` entries declare `roles:`, and a file
whose role cannot be named makes the run `INCONCLUSIVE`. `CHECKS` contains no framework filenames.

### Breaking

- A file under `src/` or an app root that classifies to no role exits `2`. Green now asserts that
  every walked file could be named, which it did not before.
- L5 walks the `frame` role: `new Date()` in `app/layout.tsx` was invisible and is now an error.
- L4 walks the app roots as well as `src/`. On an identical tree it previously scanned 12 files
  under `app/` and 15 under `src/app/`, printing its promise unqualified in both — the same defect
  shape 0.9.3 closed for L5, still live in the check that did not convert.

### Added

- **`verify/platform/nextjs.mjs`** — path → role, plus per-role `what` / `unchecked` prose.
  `laws: []` is not a hole but a **declared weakness**: a named role can print what is not checked
  about it. Only an unnameable file is a real hole.
- **Role coverage on every run.** One line when there is nothing to act on; `--roles` for the table.
  The laws shown per role are **derived from the actual scan**, never read back from the table —
  copying would make the table a second source of truth, which is the defect being removed.
- **L6 gained two parts.** A *classifier* self-test pins path → role. A *role-claim* test measures
  the table against the scan, so a role the table says a law enforces, which no check walks, fails
  the verifier itself. **The 0.9.3 defect is now caught mechanically, and blamed on the verifier
  rather than on the user's tree.**

### Changed

- L2, L3, L5, L8, L9, L10 and `clone` converted to roles; equivalence measured on both corpora
  before each swap (zero file difference). **L1, L4, L7 and `export-ownership` deliberately did
  not.** Their subject is a *tree*, not a role: role `edge` straddles `features/*/source` and
  `shared/source`, `contract` straddles both `types.ts` locations. Handing L7 a feature's own file
  would let it report *"the shared layer imports feature X"* about a file that **is** a feature.
  For L4 an enumerated role list would also invert the safety property — a new convention would
  fall silently *out* of L4, where a tree pulls it in.
- `SPACTA.md` L5 no longer enumerates `page.tsx` / `route.ts` in the Law text. Still 67 lines.
- Two non-zero exits gained escalation clauses. **The reader is an agent, and an exit it cannot
  resolve inside its own task makes it loop or invent a workaround** — worse than the hole. A
  failing L6 self-test now says that editing your own code to satisfy a broken verifier makes the
  damage permanent; a missing corpus says to stop and report.
- Under Bun, `createRequire(...)("typescript")` returns a stub rather than throwing, so the
  documented fallback never fired and the run died on `ts.ScriptTarget` — **exit 1 with a stack
  trace and no statement of what went wrong.** Resolution is now inspected; a genuinely missing
  compiler exits `2` with a message.

### Known gaps

- `INCONCLUSIVE` is reserved for *"we cannot name this"*, never for *"this has no specialised
  role"*. Feature-internal files, tests, private folders and off-Form directories classify to weak
  roles that print what is unchecked. An earlier draft blocked on a single colocated test file —
  the defect that trains an operator to reach for the ignore list.
- The role-claim test can only measure roles the reference corpus contains. The roles it cannot
  reach are now derived and printed under `NOT guaranteed` rather than listed by hand.
- Coupling through data is untouched and remains the largest known gap.

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
