# Spacta Alpha Evaluation

This document gathers the most prominent current hypotheses concerning Spacta, Next.js, and generative-AI-friendly development architectures. It does not record design decisions or work history for specific projects.

- This document does not have an index. We rewrite this file directly whenever our thoughts evolve. It is not a static document; it is updated continuously.
- What is written here is not asserted facts, but the viewpoints that carry the most explanatory power at the present time.
- Context, history, and insights that we decided not to put in `SPACTA.md` belong here (see "About the SPACTA.md File" for why).
- Version-dependent histories, expired assumptions, and rejected decisions are out of scope for this document. They reside in `docs_HUMAN-ONLY/spacta-alpha-evaluation-archive.md`.

Tags are attached to individual descriptions rather than headings.

- `[Core Hypothesis]` — The central working hypothesis of Spacta and generative-AI-friendly development.
- `[Observation]` — Phenomena that have been repeatedly observed and support other hypotheses.
- `[Implication]` — Design or operational consequences derived from core hypotheses or observations.

---

## About the SPACTA.md File

- `SPACTA.md` is the file that every implementing AI must read for every task. In terms of reading frequency and scope, it is a central trunk of the project. The same logic applies here as with a bloated `types.ts` degrading the isolation of all features: if the file gets bloated, developer effectiveness degrades. `[Observation]`
  - Therefore, we write only execution rules in `SPACTA.md` and its peripheral scripts (like verify), leaving context, history, and insights out of it. `[Implication]`
    - This is simply applying the `SPACTA.md` principle—"keep types near the owner, raise only shared contracts to types.ts"—to the document itself.
  - This observation provides the direct justification for pushing alpha evaluations out of `SPACTA.md` into this file.

## The Concept of Hope Prompts

- A prose instruction like "please do this" or "be careful about that," which is not enforced by tools, has no guarantee of being followed. We call these "hope prompts," representing the lowest tier (`hope`) in the Spacta reliability hierarchy (hope < detect < prevent-weak < prevent-strong). `[Core Hypothesis]`
- Such instructions do not cause significant performance degradation when introduced individually. Modern models are robust against small amounts of prose instructions. `[Observation]`
  - However, the true danger is not a single addition, but cumulative bloat. Repeatedly adding "harmless lines of prose" balloons the trunk that every AI must read every time.
  - The historical bloat of the old `CLAUDE.md` (v3) was a prime example of this accumulation (see `docs_HUMAN-ONLY/spacta-alpha-evaluation-archive.md`).
- The remedy is identical to "About the SPACTA.md File": impose a budget on prose instructions. `[Implication]`
  - Instead of relying on moral discipline like "let's try not to write too much," we structurally prevent budget overruns by carving out the space for history and context into this external document.
  - Core phrasing: What is dangerous is not a single line of hope prompt, but allowing it to settle and accumulate in a place where it doesn't belong.

## Asymmetry of Trunk and Leaf (Bloat cost is determined by the position in the dependency graph)

- Even for the same "1000-line file," the severity of damage is exponentially different depending on whether it is a trunk (imported by many) or a leaf (imported by none). `[Core Hypothesis]`
  - `types.ts` is a trunk. Because every layer imports it, a single line of waste taxes N places. A hard budget (line count info check) is justified.
  - `shell.tsx` is a leaf. Because it is only called by `app/page.tsx` and nothing imports its internals, its bloat does not degrade architectural isolation. **Bloating a trunk spreads harm; bloating a leaf creates local discomfort.**
  - This is why the verifier places a line count info check only on `types.ts`, and does not impose line gates on shells. `[Implication]`
- The line count info check is not scolding "having too many types." Rather, it uses line count as a proxy to detect architectural distortions, such as "types that do not cross the membrane being parked in the contract file." `[Observation]`
  - Therefore, you must not mechanically split files just to hit numbers (which is like breaking the thermometer to lower the temperature). The correct cure is reducing the actual shared volume—co-locating single-owner types and deleting dead contracts. `[Implication]`
  - `SPACTA.md` is also an extreme trunk read by all AIs on every task, and is subject to the same budget discipline (see "About the SPACTA.md File").

## The Harm of Reverse Dependency (shared ➔ features) and Delayed Manifestation

- If a shared layer (`shared/runEffect` or `shared/ui`) imports types, Gateways, or hooks from a specific feature, the dependency arrow is reversed. The shared trunk balloons every time a feature is added. `[Observation]`
  - This breach shows no harm when there is only one feature, manifesting only the moment a second feature is added. Therefore, "it works, so it's fine" cannot be trusted, requiring mechanical enforcement as L7. `[Implication]`
  - To prevent regressions, we place reverse-dependency test fixtures in `verify/fixtures/` and monitor them continuously via L6 self-tests.
- There are also semantic reverse dependencies that do not involve explicit imports: for example, when common component props or vocabulary learn feature-specific nouns (like `hintData`). This is difficult to catch via AST, and is covered by design reviews: "If `shared/ui` learns a feature noun, move it back into the feature." `[Implication]`
- Raising a type to a central `types` file when it is needed by multiple features is a false remedy. It does not eliminate the dependency; it merely masks it, parking it in a shared garbage bin. The correct solution is: (a) use `contracts/*.ts` for thin bridges of persistence/API contracts, or (b) make the components talk in primitives for UI concerns. `[Implication]`

## Unified Presentation Layer — Three Layers: Frame, Vocabulary, Components

- Even when structural verification (L1–L7) is green, user experience consistency is not guaranteed. In practice, `idea-vectorizer` (light UI) and `dashboard` (dark UI) were both green in verify, tsc, and build, yet looked like completely different applications. The root cause was the lack of shared design tokens. `[Observation]`
  - Core phrasing: **Structure is green, experience is unachieved.**
- Balancing UI uniformity and feature independence succeeds when responsibilities are split into three layers: `[Core Hypothesis]`
  1. **Frame**: Headers and outer shells are pulled up to `app/layout.tsx` + `shared/ui` and shared across features. Shells specialize strictly in the main content area.
  2. **Vocabulary**: Colors, margins, and border-radius are placed in tokens/theme. Just as data has `types.ts`, presentation has tokens. Both are thin trunks that hate bloat.
  3. **Components**: Feature-specific UI components are closed within the feature's `components/`, permitting duplication. **What is shared is not the completed UI, but the vocabulary.** If duplicate components draw from the same tokens, look-and-feel does not drift. Duplication is cheaper than a bloated trunk.
  - Postpone component extraction to `shared/ui` until the same shape has actually repeated in two or more features. Preemptive extraction breeds a heavy trunk in `shared/ui`. `[Implication]`
- Detecting raw colors and arbitrary values (L8 Presentation Purity) is the presentation counterpart to L2 Core Purity, and a candidate for promotion from info to fail. However, because UI contains many exceptions, we introduce it as an info check for burn-in. L8 can only enforce vocabulary consistency; information design, density, and copy quality remain the domain of the `frontend-design` skill / human reviews (external brain). `[Implication]`
- Physically splitting shells (container + components) is not a solution for UI uniformity, but a foothold to create reading/writing units for applying tokens/shared-ui. As a side effect of splitting, unstable React hook dependency arrays (like the `/api/hints` infinite loop incident) are not buried in JSX noise, minimizing the review surface area. `[Observation]`
- The initial version of L8 (checking only `#hex` and arbitrary `bg-[...]`) had loopholes. In practice, even after completing "color alignment" and passing verify, `bg-fuchsia-400/10`, `border-fuchsia-300/20`, `bg-white/[0.06]`, `bg-gray-50`, and `bg-slate-950` remained, causing the look-and-feel to drift. **Even without raw hex in the source, "named palettes" or "color name + opacity" represent hardcoding specific colors, blocking automatic light/dark support.** `[Observation]`
  - Core phrasing: **The greenness of presentation purity is only as honest as its detection vocabulary.** If detection is narrow, the green status is a lie. The same issue that made L2 (Core Purity) honest only after expanding from grep to AST happened on the presentation side.
- L8's expansion is designed as a **three-way separation** rather than a "blanket ban on all palettes," which is the most practical compromise to avoid both false positives (developer annoyance) and leaks (drift). `[Implication]`
  1. **Grayscale Palette** (`gray`/`slate`/`zinc`/`neutral`/`stone`/`white`/`black`) ➔ Info-flagged to push toward `background`/`foreground`/`card`/`border`. Drift here is the primary cause of "looking like a different app."
  2. **Color + Opacity** (`fuchsia-400/10`, etc.) ➔ Info-flagged as hidden hardcoding to push toward semantic token + opacity (e.g., `bg-primary/10`). This assumes CSS variables are defined as HSL/RGB values (opacity modifiers do not work on hex variables, a technical lesson learned).
  3. **Status Colors** (`red`/`green`/`amber`/`blue` series) ➔ **Allowed** as an escape hatch, as their meanings are fixed to the color and they appear frequently. Enforcing rules here yields too much noise.
  - L8 only protects **vocabulary consistency**. Typography, spacing, margins, graphics, and the overall universe (tone & manner) lie outside color tokens, belonging to AI reviews using multimodal capabilities, `frontend-design` skills, or humans (the 4th axis of uniformity outside the 3 layers).
- Clone detection (B3) compared JSX elements returned by `.map()` callbacks as "independent root elements" against the parent, incorrectly reporting parent `<ul>` and child `<li>` as duplicates with 0.9+ Jaccard similarity. Root JSX returned inside callbacks must be excluded from parent comparison as they are semantically descendants of the parent. **We fix verifier heuristic false positives in L6 self-tests via fixtures (`clone-map-callback`) to prevent regression.** `[Observation]`

## Spacta and Parallel Implementation

- Spacta is not "conventions to remind you of good design," but a "terrain to keep parallel implementers from colliding." `[Core Hypothesis]`
  - In adding the `dashboard` feature, we froze `types.ts` first, then distributed core/source/shell to multiple agents in parallel. This clearly demonstrated the value of Spacta.
  - `types.ts` functions not as a "dumping ground for all types," but as a membrane contract for parallel implementers to align on. `[Observation]`
    - If the type contract is frozen beforehand, the Core developer only writes pure aggregations, the Source developer only writes IO, and the Shell developer only writes rendering. They do not need to know each other's implementation to integrate successfully at the end.
  - Spacta does not reduce context; it **fixes the points where contexts merge**. Consequently, multiple agents writing simultaneously rarely collide or blur responsibilities.
- However, this success is contingent on freezing the types contract first. `[Implication]`
  - If parallelized while contract remains ambiguous, agents will expand contracts independently, turning `types.ts` back into a garbage bin.
  - `types.ts` must be treated as a small design deliverable frozen *prior* to parallelization, not a byproduct of implementation.
- Feature connections function as part of this terrain. `[Implication]`
  - Connections between features pass through external boundaries (API / DB / URL / shared) rather than direct imports. `features/<name>/types.ts` is not a central bridge connecting features, but a membrane contract connecting Core/Source/Shell/Page within a feature.

## Why L6 (Verifier Self-Verification) is the Backbone

- Simply saying "enforce with tools" does not guarantee that the enforcement is effective. Real-world example (the L4 comment incident): The verification regex was fooled by a comment string, allowing a code block lacking exhaustiveness termination to pass undetected. `[Observation]`
- Therefore, L6 is the backbone of this framework. We prove the verifier is functioning every time by testing it against intentionally broken fixtures. Even if the Form is flexible, this proof remains fixed. Without L6, L1–L5/L7 revert to hope at the meta-level. `[Core Hypothesis]`

## types.ts Sharing Budget and Limits of Verify

- A green `npm run verify` is highly effective, but not the sole metric of success. `[Observation]`
- Evaluating Spacta outcomes requires at least four layers: `[Core Hypothesis]`
  1. **Structural Measurement**: Are L1–L6 green? Is Core free of IO? Is feature isolation maintained?
  2. **Type/Contract Measurement**: Is there any dead-export? Does any single-owner-export remain in `types.ts`? Are DB/API contracts clearly sourced?
  3. **Experience Measurement**: Does it look like the same app? Are color, density, copy, and navigation aligned?
  4. **Operational Measurement**: Was it easy to implement in parallel? Was the cause of errors localized? Did the number of files touched for a typical edit decrease?
  - Verify directly inspects 1, and can be expanded to check parts of 2 and the vocabulary aspect of 3. Synthesizing quality in 3 and developer experience in 4 requires human or advanced model evaluation.
  - Core phrasing: **Verify is a passing condition, not a success condition.**
- This understanding does not weaken Spacta, but strengthens it. By clarifying what verify checks, we can integrate the remaining judgments into our process. `[Implication]`
- Dead-export and single-owner-export catch misplaced contracts mechanically. However, the decision of whether to move local-use types to their owner files is not automated. `[Implication]`
  - Single-owner-export can include false positives or design-stage sharing candidates, and thus remains permanently as info, not failing. "Just one place today" is left to human/AI judgment.
- Even structural measurement (Layer 1) is incomplete with `verify` (without `--tsc`) alone. In practice, after moving types out of `types.ts` to their owners, **verify remained green while old unused import statements remained**, and only `tsc --noEmit` flagged red. Verify inspects laws (structural boundaries), not type resolution. `[Observation]`
  - Core phrasing: **Green verify ≠ Green types.** The two are separate axes. Confusing green verify with type safety can lead to letting broken references pass during refactoring. We run `--tsc` / `tsc --noEmit` alongside verify, and state this in `SPACTA.md` §3 and `verify/README` (fixing it as a procedure rather than telling developers to "be careful"). `[Implication]`

## Loopholes in Law Scope — Declared in Prose, Ignored by Tools

- "Hope prompts" do not just happen in "prose outside of §1". They also manifest when the **actual scope of a Law under §1 is narrower than its declaration**. Real-world measurement: The migration task instruction stated, "Check API routes for non-deterministic values and aggregation leaks as well." However, the L5 (source-purity) check at the time only scanned `app/**/page.tsx`, ignoring `route.ts`. The developer AI had to "be careful and inspect manually," meaning a Law claiming to be "prevent-strong" had degenerated back to "hope" for routes. `[Observation]`
  - Core phrasing: **No matter how broad a Law's name is, if the scanned target is narrow, the gap is still "hope".** L5 boasted "purity at server boundaries," but the implementation only looked at pages. This gap between declaration and scan target is the exact same loophole as the L4 comment incident and the L2 grep missing `new Date()`.
- The fix is identical to L2/L4: **Make the scan target catch up with the declaration, and lock it down with fixtures.** Extend L5 to cover both `page.tsx` and `route.ts`. Treat non-deterministic generation (`new Date`/`Date.now`/`Math.random`/`crypto.randomUUID`) as `err`, treat direct aggregation as `warn`, and add `bad-route` and `good-route` to the L6 self-test. `[Implication]`
  - Because routes are edges that legitimately perform IO (`await` fetch/DB), the IO itself is not target of L5. Only "non-deterministic generation" and "direct business aggregation" are banned—applying the same standard and the same AST inspection to routes as to pages. There is no reason to vary the purity standard based on whether the boundary is a page or a route. `[Implication]`
  - Generalization: Whenever you add a new law or widen the wording of an existing law, **you must widen the scan glob and test fixtures at the same time**. Widening only the wording immediately degrades the difference to "hope". Explicitly listing "which file set this law actually inspects" in the README check table serves as the permanent prevention mechanism for this loophole. `[Implication]`

## AI Cognitive Characteristics (Attention Context-Switching Costs, etc.)

- When given multiple unrelated tasks, the AI has to switch its attention repeatedly, causing a severe drop in accuracy. `[Observation]`
  - Real-world example: In a 200-question survey where individual questions were extremely simple, even high-performing models suffered a sharp drop in accuracy before reaching 70 questions. Conversely, a lower-performing model maintained stable accuracy when forced to answer in batches of 20.
  - The takeaway: Unrelated to the model's absolute capability limits, the "attention context-switching cost" itself degrades accuracy. Tasks should be structured to avoid this.
- LLMs operate in three thinking states: "Read", "Think", and "Write". It is ideal when a single state dominates the load throughout the task (a concentrated 2:7:1 ratio rather than a dispersed 4:4:1). `[Observation]`
  - The orchestrating AI at the top layer experiences an explosion in cognitive load when attempting to grasp the context of the entire application. As implementation progresses, matching implementation with specifications adds to this load, easily breaking the single-state dominance. `[Observation]`
  - The solution: Delegate decision-making authority to lower layers (feature/Core/Shell) to structurally relieve the top layer's load. This aligns perfectly with the role already played by Spacta's "feature isolation / horizontal isolation." `[Implication]`
- This phenomenon is not unique to Spacta, but is background knowledge underpinning all AI-collaborative development. `[Implication]`
  - Third parties adopting Spacta do not necessarily need to know this background. It serves as the origin context preserved as a common language between humans and AI.
  - Note: The specific conclusion derived from this in old v3 ("prefer one giant file over multiple short files, eliminate imports") has been retracted (see `docs_HUMAN-ONLY/spacta-alpha-evaluation-archive.md` "Expiry of the Dependency Graph Tracking Cost Assumption"). What we preserve here is not that conclusion, but the existence of the attention context-switching cost phenomenon itself.

