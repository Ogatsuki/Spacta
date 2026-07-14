# Spacta Gardener — Gardening Cleanup Instructions Operation Procedure

> **Philosophy**: From "decide correctly upfront (upfront design)" to "keep fixing cheaply after the fact (cleanup after the fact)".
> The info check in verify is not a punishment, but a **set of instructions for the Gardener**. We maintain the garden through **eventual consistency** rather than immediate enforcement (fail).
> Separate the eyes (`garden.mjs` / deterministic) and hands (implementing AI following this document).

## Overall Picture

```
npm run verify   ... Physical enforcement of laws (L1..L7). Red means merge blocked (immediate enforcement).
npm run garden   ... Converts info/warn into "gardening cleanup instructions" (garden-report.json) (detection only, no AI).
Gardener Agent   ... Reads the instructions and mechanically organizes the codebase following this document (eventual consistency).
```

- `garden.mjs` executes verify with `--json` parameter and extracts info checks (dead-export / single-owner-export / L8 / clone) and warn checks (L5 direct aggregation in server page), converting them into task kinds and writing to `garden-report.json`.
- **Do not commit `garden-report.json`** (add to `.gitignore`). It is a disposable instructions file generated every time.

## Execution Timing

- Standard timing is manually running at **milestones during implementation** (e.g., when a feature is complete or before opening a PR).
- **Do not put this in pre-commit hooks** (does not block human prototyping vibes / `SPACTA.md` §4.8).
- Consider automated execution such as nightly batch jobs only after the Gardener's performance stabilizes (phased operation, similar to burn-in phase).

## Gardener Agent Procedure

1. Run `npm run garden` and read `garden-report.json`.
2. If `blocked: true` (verify is red), **do not perform gardening**. Fixing law violations takes priority. Exit immediately.
3. Address the `tasks` in order from top to bottom. Perform the cleanup correspond to each task's `kind` as described below.
4. Run `npm run verify` after completing all tasks (or per work unit) and **confirm it is green**.
5. Re-run `npm run garden` to confirm that the completed tasks have disappeared.
6. Commit the entire gardening session as **a single commit** (see "Mitigating Git History Noise" below).

### Action per Task Kind

| kind | Origin | Action |
|---|---|---|
| `delete-dead-export` | dead-export info | Delete dead exports from `types.ts`. Since they have zero references, deleting them will not break the build (proven by green verify). |
| `colocate-type` | single-owner-export info | Move the export out of `types.ts` and co-locate it within the sole consumer file. Clean up the definition in `types.ts` and the old imports. |
| `tokenize-presentation` | L8 info | Extract raw colors (`#hex`) or arbitrary values into `tailwind.config.ts theme.extend` vocabulary or `shared/ui` recipes (`tailwind-variants`) (gardening). **Must be an equivalent transformation that does not change rendering output.** |
| `push-into-core` | L5 warn | Move server page aggregation/formatting into pure functions in the feature's `core.ts`, and make the page simply call them. |
| `dedupe-clone` | clone info (B3) | Suspected UI (JSX/className) duplication. **Deduplicate only when there is a 100% exact match within the same feature** (Jaccard high similarity partial matches or cross-feature duplications are out of scope). Extract the UI into a display component in `components/` for that feature, and call it from both locations. Must be an equivalent transformation without visual changes. Cross-feature duplication and raising components to `shared/ui` is outside the Gardener's domain (keep 80-90% similar ones as-is as stated in §5). When in doubt, defer using `garden:keep`. |
| `unknown` | Missing mapping | Do not perform cleanup, and report immediately. Needs addition to `TASK_KINDS` in `garden.mjs` (do not ignore). |

### Deferring (garden:keep)

Items intended to be kept must have a comment written on the **target line or the line immediately preceding it**:

```ts
// garden:keep Contract to be used for next week's API release
export type PlannedContract = { ... };
```

- This removes the item from future `tasks` and retains it in `suppressed` with the provided reason (visible deferring, not hiding).
- **Do not write `garden:keep` without a reason.** If the Gardener finds a keep without a comment, ask the human operator for the reason.
- Keep is not a permanent get-out-of-jail-free card. Humans will review and clean up `suppressed` lists when they accumulate.

## Guardrails (Things the Gardener must not do)

1. **Do not change behavior**. All gardening actions must be equivalent transformations (deleting only dead items with zero references). Do not mix in specification changes, feature additions, or bug fixes. Report any bugs found instead of fixing them.
2. **Do not break verify green**. If verify turns red after a task, revert that task and report.
3. **When in doubt, ask instead of deleting**. Do not add keeps based on speculation like "this might be used soon." Direct questions to humans (or the task issuer).
4. **Do not extract to `shared/ui`**. Cross-feature clone detection (clone B3) is not yet supported. Consolidating duplicates is outside Gardener v1's scope (`SPACTA.md` §2.5: duplication is cheaper than a bloated trunk).
5. **Do not promote info to fail**. Promotions (info ➔ fail) are decided by humans after observing the burn-in phase.
6. **Do not change the rules of verify or garden**. Modifying the verifier or cleanup instruction generator is not gardening work (belongs to L6 domain).
7. **`notes` (types.ts line budget, tsconfig include) are reference information**. Do not modify files mechanically unless it naturally resolves (e.g. line count drops after executing `colocate-type`). Simply report.

## Mitigating Git History Noise

- One gardening session = **one commit**. Do not mix with feature commits.
- Commit message should have a `garden:` prefix + breakdown of resolved task kinds. Example:

```
garden: clean up (delete-dead-export x2, colocate-type x1, tokenize-presentation x3)

Resolved tasks from garden-report.json (2026-07-06). No behavior changes. verify is green.
```

- Reviewing humans can skim the diff on the assumption that "commits prefixed with `garden:` are strictly equivalent transformations." Mixing other changes violates this assumption (Guardrail 1).

## Bootstrap (Wiring to New Projects)

1. Copy `garden/` (this folder) along with `verify/` directly under the root of the project (`SPACTA.md` §0).
   `garden.mjs` references `verify/verify.mjs` in the sibling directory.
2. Add the script to `package.json`: `"garden": "node garden/garden.mjs ."`
3. Add `garden-report.json` to `.gitignore`.

## Design Notes (Why it is built this way)

- **Detection is unified in verify**. Garden does not maintain a separate scanner (duplicate implementations risk missing detections outside L6 guarantees).
  Adding a new info to verify only requires adding a line to `TASK_KINDS` in `garden.mjs`. Forgetting to add it will always surface as an `unknown` task.
- **Blocking gardening on verify red** prevents diff equivalence guarantees from breaking when law violations and equivalent transformations are mixed.
- **Including L5 warn** because it was something "mechanically found but had no owner to fix." An after-the-fact version of pushing to core (`SPACTA.md` §2.5).
- UI clone detection (B3, completed) is integrated into the input source as `dedupe-clone` in `TASK_KINDS`. However, the Gardener only deduplicates "exact matches within the same feature," leaving cross-feature or partial similarity (80-90%) alone as stated in §5.
  Do not resolve all duplications just because they are found.
