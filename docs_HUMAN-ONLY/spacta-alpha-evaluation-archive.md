# Spacta Alpha Evaluation Archive (Retired Insights)

This document preserves insights that were previously in `docs/spacta-alpha-evaluation.md` (Alpha Evaluation core) but have been removed from the current evaluation due to expired assumptions or changes in design decisions.

- Preservation is prioritized. Instead of rewriting them to fit the present day, we keep the original phrasing as much as possible.
- We only place things here that are worth preserving to understand "why we thought so, and why it was removed." Project-specific design decisions or simple task histories are out of scope.
- Unlike the core document, this document may retain a slightly historical tone.

---

## Expiry of the Dependency Graph Tracking Cost Assumption [Established]

The old v3 chose 1-file integration (long single file > multiple short files) on the assumption that "physical file splitting via import/export forces AI to pay a mapping cost to resolve dependencies."

In v4, because (a) the dependency tracking capability of models improved, and (b) Spacta normalized the `types/core/shell` structure, import tracking changed from "exploration" to "recognition". Due to these two points, the above assumption expired (stemming from the same root as "splitting gains/losses are determined by the quality of the boundary").

Consequently, physical splitting of Shell (extracting to `components/`) was allowed, and the file size became significantly smaller. This shift became a prerequisite for both "non-adoption of SAB" and "termination of inline specs."

➔ Basis for both "SAB (Scrap & Build) is not adopted in v4" and "Unified use of specs and termination of inline specs."

---

## SAB (Scrap & Build) is Decided to be Not Adopted in v4 [Established]

The fundamental value of SAB was not the "smallness of the blast radius," but rather **eliminating the Read cost to lower cognitive load**.
To edit a 500-line shell.tsx, one had to first read the whole file and map the dependencies, representing a heavy Read load. SAB was a technique to structurally eliminate that Read load by "rebuilding without reading."

In v4, as physical splitting of Shell progressed and file sizes shrank to dozens of lines, the Read cost had already become virtually zero. There is no value in further eliminating what is already zero. **The problem that SAB solved was solved beforehand by a different means: file splitting**—a case of expiration identical to the "expiry of the dependency graph tracking cost assumption."

Conclusion: SAB is not adopted as a recommended technique in Spacta v4. It is recorded as a legacy technique but will not be included in current conventions or starter guides.

---

## Inline SPEC Method and Ingenuity Comments Are Not Adopted in Early v4 [Established]

The old v3's α/S/A evaluations and inline SPEC blocks (`SPEC_START`〜`SPEC_END`, `BLOCK_START`〜`BLOCK_END`) are not adopted in v4. The reason is the same as the "expiry of dependency graph tracking cost assumption": back then, the inside of Shell was a "messy" lump where multiple concerns (state, communication, rendering) were tangled together, requiring natural language SPEC descriptions to supplement the mapping between specifications and implementation.

In v4, logic is isolated in Core, IO in Gateway, and rendering in components. There is no need to add a new comment system or document link mechanism for this issue. At least in early v4, **ingenuity comments are not written**. We return to the general form of specification-driven development.

Furthermore, how to link specifications with implementation is not treated as a problem to be solved by this alpha evaluation or the Spacta framework. That is left to the user's operational judgment.

---

## Abandonment of Old Spacta "All-Definitionism" and Introduction of §2.5 (Judgment) [Established]

The old Spacta attempted to define everything in the conventions (e.g., where to place types, how to split shells, which logic to move to Core) to answer every question in design discussions. However, Next.js applications vary widely, and practice proved that locking forms down too rigidly failed to fit real applications.

In v4, we shifted to "fixing only the laws (mechanically enforced boundaries) and letting the implementing AI contextually decide the details while keeping verify green." To accept this, §2.5 (Judgment) was introduced—the fourth layer of the trust hierarchy (Law > Form > Advice > Judgment).
The declaration at the beginning of the current `SPACTA.md`—"As long as verify is green and the philosophy of §1 is followed, the details of the Form do not matter"—is a consequence of this abandonment.

➔ Preserved as a record of a retired attempt to make the conventions thick, sharing the same structure as "expiry of the dependency graph tracking cost assumption."

---

## Sources

"Abandonment of Old Spacta All-Definitionism" was moved from the historical prose at the beginning of old `Spacta/SPACTA.md` §2.5.
The other three items were moved almost verbatim from the chapters of the same name in the old `docs/spacta-alpha-evaluation.md`.
Primary sources for context are `docs/history/dev/260628~/00_old-spacta-doc.md` (old v3 CLAUDE.md) and `01_spacta-bloat-ronko.md`.
