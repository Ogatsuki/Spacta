*This document is a translated version. The canonical (maintained) version is the Japanese original [`ja/spacta-alpha-evaluation.md`](ja/spacta-alpha-evaluation.md). If there is any discrepancy, the Japanese version takes precedence.*

# Spacta Alpha Evaluation

**Currently under construction.** It's under construction, but for various reasons it's merged into main anyway.

This document gathers insights concerning Spacta, Next.js, and generative-AI-friendly development architectures. It does not record design decisions or work history for specific projects.

- This document gathers insights, observations, history, and context concerning generative AI.
- It is not static; it is updated continuously as insights are found or discarded, and kept current at all times.
- Version-dependent histories, expired assumptions, and rejected decisions are out of scope for this document. They reside in [docs_HUMAN-ONLY/spacta-alpha-evaluation-archive.md](spacta-alpha-evaluation-archive.md).

Tags are attached to individual statements throughout this document. (Tagging is the author's own judgment call.)

- `[Established]` — Something recognized as correct with fairly high confidence.
- `[Recognized]` — Something judged correct with a moderate degree of confidence; what the author currently understands to be the case.
- `[Observed]` — An observed fact.
- `[Implication]` — Something that does not need its own validity assessment (it follows from something else already tagged).
- `[Open Question]` — Not judged correct at this time; something that needs to be confirmed through verification.

---

## α1. About the [SPACTA.md](../docs_AI-ONLY/SPACTA.md) File

- [SPACTA.md](../docs_AI-ONLY/SPACTA.md) must stay lightweight. It's the file every AI responsible for implementation has to read on every task. Ten extra lines here means that much extra reading and compliance cost imposed on every single AI. In terms of how often and how broadly it's read, it's the project's central "trunk," and bloat here degrades the effectiveness of every developer (AI). Keeping this file lean should therefore be treated as high priority. `[Established]`
  - For Opus/Sonnet, adding ~10 lines might not be a problem on its own, but `SPACTA.md` has higher information density than other documents and may be hit harder by the attention-dispersion effect discussed below. What matters isn't just line count, but how much attention gets dispersed, and how that trades off against recognition/compliance cost. `[Recognized]`
- Therefore, we made a decision: `SPACTA.md` and its peripheral scripts (like verify) contain only execution rules — context, history, and insight get pushed out of it. It would have made sense, for the AI's context preservation, to include the alpha evaluation as well, but α0 pushes the alpha evaluation out into an external file instead. `[Implication]`

## α2. Hope Prompts

- A prose instruction like "please do this" or "watch out for that," unenforced by any tool, has no guarantee of being followed. We call this a "hope prompt" — a request that merely hopes to be obeyed — and place it at the bottom rung of Spacta's reliability hierarchy (hope < detect < prevent-weak < prevent-strong). `[Core Hypothesis]`
- Introduced one at a time, such instructions don't cause major performance degradation. Modern models are robust to a small amount of prose instruction. `[Observation]`
  - But the real danger isn't a single addition — it's cumulative bloat. Repeatedly adding "one more harmless-looking line" balloons the trunk that every AI has to read every single time.
  - The historical bloat of the old `CLAUDE.md` (v3) was a textbook case of this accumulation (see `docs_HUMAN-ONLY/spacta-alpha-evaluation-archive.md`).
- The remedy is the same as "About the SPACTA.md File": impose a budget on prose instructions. `[Implication]`
  - Rather than relying on willpower ("let's be careful not to write too much"), we structurally prevent budget overruns by carving out this external document as the place where history and context live instead.
  - Core phrasing: what's dangerous isn't a single line of hope prompt — it's letting it take root and accumulate somewhere it doesn't belong.

## α3. The Asymmetry of Trunk and Leaf (Bloat cost is determined by position in the dependency graph)

- Even for the same "1000-line file," the severity of the damage differs exponentially depending on whether it's a trunk (imported from many places) or a leaf (imported from nowhere). `[Core Hypothesis]`
  - `types.ts` is a trunk. Because every layer imports it, one wasted line taxes N places. That's exactly why a hard budget (a line-count info check) is justified.
  - `shell.tsx` is a leaf. It's only called from `app/page.tsx`, and nothing imports its internals, so its bloat doesn't degrade architectural isolation. **Bloat in a trunk spreads harm widely; bloat in a leaf is a one-off annoyance.**
  - This is why the verifier imposes a line-count info check only on `types.ts`, and sets no line-count gate on shells. `[Implication]`
- The line-count info check isn't scolding you for "having too many types." Rather, it uses line count as a proxy signal for architectural distortion — like types that never cross the membrane being left stranded in the contract file. `[Observation]`
  - So don't mechanically split files just to make the number look right (that's like breaking the thermometer to lower the temperature). The correct treatment is to reduce the amount actually being shared — co-locate single-owner types, and delete dead contracts. `[Implication]`
  - `SPACTA.md` is also an extreme trunk read by every AI on every task, and is subject to the same budget discipline (see "About the SPACTA.md File").

## α4. Attention Dispersion, and Switching Cost

- Giving the AI multiple tasks that should each be trivially small in context led to observed accuracy degradation and incomplete answers. `[Observed]`
  - Concrete case: in a 200-question survey where each individual question was extremely simple, Sonnet's accuracy dropped sharply before reaching question 70 (e.g. every remaining answer converging to the same value, or going unanswered outright). A lower-performing model kept stable accuracy when made to answer in batches of 20 instead. `[Observed]`
  - Takeaway: independent of a model's absolute capability ceiling, "attention switching cost" itself degrades accuracy. Put differently — even with a context window nowhere near full, accuracy can be degraded on purpose (or a task can be shaped so that it happens by accident). This has to be kept in mind whenever handing a task to an AI. `[Established]`
- In my own informal observation, GPT-family models tolerated attention dispersion best, Gemini next, and Claude worst. That said, this is an old observation from around January 2026, measured only on cheap models, and hasn't had enough verification behind it to be trusted as a real finding. `[Open Question]`
- As AI keeps advancing, tolerance for this switching cost is getting stronger, and I expect that tolerance to keep rising. `[Recognized]`

## α5. Attention Is a Resource

- When the things that need attention are spread widely across the context, it becomes hard for an LLM to hold onto all of them while reasoning. `[Established]`
  - Something gets dropped during weight computation — this is the phenomenon commonly described as "the AI forgot." "The AI forgot the premise" likely covers not only necessary context being pushed out of a finite context window, but also this kind of drop during inference caused by attention dispersion. `[Established]`

## α6. Monopoly of a Single Thinking State
- LLMs operate through three thinking states — Read, Think, Write. It's ideal for a single state to dominate the load throughout a task (a concentrated ratio like 2:7:1, rather than a dispersed 4:4:1). `[Recognized]`

## α7. AI Cognitive Load
- I believe AI has a cognitive-load mechanism analogous to a human's. `[Recognized]`
  - **Extraneous cognitive load**: reasoning cost spent on things outside the task itself. Reducible.
    - Example: reading and understanding a codebase, mapping out Next.js's implicit, complex state management.
    - In AI development, compute is finite. No amount of reading the codebase, or grasping complex state management, implements even a sliver of the task by itself. Spending finite compute on reducible cognitive load is inefficient. Ideally, all of a 100-unit budget of resource goes toward resolving intrinsic cognitive load. `[Established]`
  - **Intrinsic cognitive load**: the reasoning cost of the task itself. Fundamentally irreducible.
    - Example: implementing genuinely complex logic.
    - Spacta's adoption of the state machine succeeds at lowering exactly this — the complexity of the task itself.
  - **Germane cognitive load**: the load of a task that has to be learned and internalized before it can be done.
    - Example: "have the AI use a syntax it's never once encountered in training."

## α8. The Orchestrating AI's Cognitive Load Explosion
- An "orchestrating AI" that has to hold an entire application's context in mind sees its cognitive load explode as the application grows. `[Established]`
- As implementation proceeds, cross-checking the implementation against the spec piles on top of that load, and single-state dominance breaks down easily. `[Observation]`
  - Example: Opus — read the spec (Read) → think through the implementation (Think) → implement (Write) → check it against the spec (Read).
  - The fix: delegate decision-making authority down to lower layers (feature/Core/Shell), structurally relieving the top layer's load. This lines up exactly with the role Spacta's "feature isolation / horizontal isolation" already plays. `[Implication]`

---

*What follows, α9–α14, was appended separately from the original α1–α8 above, in a section left to Claude's technical judgment. It deliberately strips out project-specific implementation detail (which check looks at what, the blow-by-blow of specific incidents) as much as possible, keeping only claims general enough to hold up for other AI-First development efforts too.*

## α9. The Harm of Reverse Dependency, and Its Delayed Manifestation

- If a layer meant to stay generic and shared imports something specific to one particular consumer, the dependency arrow effectively reverses: the "shared" layer now silently grows every time a new consumer is added. `[Observation]`
  - The breach is invisible while there is only one consumer, and only manifests the moment a second consumer arrives. **"It works, so it must be fine" cannot be trusted as a signal here** — the direction of the arrow has to be checked structurally, not inferred from the app currently running. `[Core Hypothesis]`
  - Because the harm is latent, regression only shows up at the worst possible time — when a second, unrelated team or agent starts depending on the same shared layer. Mechanical enforcement of directionality (not code review, not "we'll remember") is what catches this before it compounds. `[Implication]`
- There is also a semantic version of this that involves no explicit import at all: a piece of shared vocabulary or a shared component's props quietly absorb a noun that belongs to one specific consumer (e.g. a generic prop taking on a domain-specific field name). This is hard to catch mechanically via AST and needs a standing design-review heuristic instead: **if a shared layer has learned a consumer-specific noun, move it back into that consumer.** `[Implication]`
- Promoting a type into a central shared file the moment two consumers need it is a false remedy. It doesn't remove the dependency between those two consumers — it relocates it into a shared bin, where it now merely *looks* legitimate. The fix is either (a) a thin, explicitly-named bridge for persistence/API-level contracts, or (b) having the consumers communicate through primitive values instead of a shared named type. `[Implication]`

## α10. UI Consistency Needs Its Own Vocabulary Layer

- Structural verification being green (boundaries respected, no cross-imports) does not guarantee the UI reads as one coherent product. Two features can each pass every mechanical check and still look like two different apps, because "no shared design tokens" is not something a boundary checker is positioned to catch. `[Core Hypothesis]`
  - Core phrasing: **structure can be green while the experience is unachieved.**
- The general shape of the fix: split UI responsibility into what's structural (a shared frame/shell), what's a shared vocabulary (design tokens — color, spacing, radius), and what's allowed to be duplicated (feature-local components). Sharing the vocabulary, not the finished component, is what keeps look-and-feel from drifting without also rebuilding the coupling that isolation was meant to remove. `[Implication]`
  - How this is actually enforced in Spacta today — the three-way split of what a presentation-purity check flags versus allows, and the concrete incidents that led there — is project-specific implementation detail, not a general hypothesis. It's recorded in `spacta-decisions.md` (D-008) rather than here.

## α11. Spacta and Parallel Implementation

- Spacta is not "conventions to remind you of good design," but a "terrain to keep parallel implementers from colliding." `[Core Hypothesis]`
  - In adding the `dashboard` feature, we froze `types.ts` first, then distributed core/source/shell to multiple agents in parallel. This clearly demonstrated the value of Spacta.
  - `types.ts` functions not as a "dumping ground for all types," but as a membrane contract for parallel implementers to align on. `[Observation]`
    - If the type contract is frozen beforehand, the Core developer only writes pure aggregations, the Source developer only writes IO, and the Shell developer only writes rendering. They do not need to know each other's implementation to integrate successfully at the end.
  - Spacta does not reduce context; it **fixes the points where contexts merge**. Consequently, multiple agents writing simultaneously rarely collide or blur responsibilities.
- However, this success is contingent on freezing the types contract first. `[Implication]`
  - If parallelized while contract remains ambiguous, agents will expand contracts independently, turning `types.ts` back into a garbage bin.
  - `types.ts` must be treated as a small design deliverable frozen *prior* to parallelization, not a byproduct of implementation.
- Feature connections function as part of this terrain. `[Implication]`
  - Connections between features pass through external boundaries (API / DB / URL / shared) rather than direct imports. A feature's own type contract is not a central bridge connecting features to each other, but a membrane contract connecting that one feature's Core/Source/Shell/Page.

## α12. Why Self-Verification of the Verifier Is the Backbone

- Simply saying "enforce with tools" does not guarantee that the enforcement is effective. Real-world example: a verification regex was fooled by a comment string, allowing a code block that lacked proper exhaustiveness termination to pass undetected. `[Observation]`
- Therefore, the verifier checking itself is the backbone of this whole approach. We prove the verifier is functioning every time by testing it against intentionally broken fixtures. Even if the surrounding conventions stay flexible, this proof remains fixed. Without it, every other rule reverts to hope at the meta-level — you're trusting that the tool that's supposed to remove trust is itself trustworthy, with nothing checking that assumption. `[Core Hypothesis]`

## α13. Sharing Budget for `types.ts`, and the Limits of `verify`

- A green mechanical check is highly effective, but not the sole metric of success. `[Observation]`
- Evaluating outcomes for this kind of architecture requires at least four layers: `[Core Hypothesis]`
  1. **Structural measurement**: Are the boundary checks green? Is pure logic free of IO? Is isolation maintained?
  2. **Type/contract measurement**: Is there any dead export? Does a type used by only one owner still sit in the shared contract file? Are external contracts (DB/API) clearly sourced?
  3. **Experience measurement**: Does it look like the same app? Are color, density, copy, and navigation aligned?
  4. **Operational measurement**: Was it easy to implement in parallel? Was the cause of errors localized? Did the number of files touched for a typical edit decrease?
  - A structural verifier directly inspects layer 1, and can be extended to check parts of layer 2 and the vocabulary aspect of layer 3. Synthesizing quality in layer 3 and developer experience in layer 4 requires human or advanced-model evaluation — there's no way around that.
  - Core phrasing: **a green check is a passing condition, not a success condition.**
- This understanding doesn't weaken the approach — it strengthens it. By being explicit about what the mechanical check does and doesn't cover, the remaining judgment calls can be folded into the process deliberately, instead of being silently assumed away. `[Implication]`
- Detecting a dead or single-owner export catches misplaced contracts mechanically. But deciding whether to actually move a locally-used type back to its owner file is not something that can be automated — it stays a human/AI judgment call, left as an info-level signal rather than a failure, precisely because it can have false positives or legitimate design-stage sharing candidates. `[Implication]`
- Even structural measurement (layer 1) is incomplete from boundary-checking alone, without also running the type checker. In practice, after moving types out of a shared contract file back to their owners, the boundary check stayed green while stale, now-unused import statements remained — only the type checker flagged it red. A boundary checker inspects structural laws, not type resolution. `[Observation]`
  - Core phrasing: **a green boundary check ≠ green types.** The two are separate axes. Confusing one for the other can let broken references slip through during a refactor. Run both together, and say so explicitly in the project's own rules, rather than telling developers to "just be careful." `[Implication]`

## α14. Loopholes in Law Scope — Declared in Prose, Ignored by Tools

- Hope-prompt-shaped danger doesn't only occur in ordinary prose. It also shows up when **the actual scanned scope of a mechanically-enforced rule is narrower than what the rule's name promises**. Real-world example: a migration task's instructions said "check API routes for non-deterministic values and aggregation leaks too." But the purity check in force at the time only scanned page files, silently skipping route handlers. The developer AI had to "be careful and inspect manually" for routes — meaning a rule that claimed to be mechanically enforced had quietly degraded back into a hope-prompt for that one surface. `[Observation]`
  - Core phrasing: **no matter how broad a rule's name is, if the scanned target is narrow, the gap that's left over is still hope.** This is the exact same shape of loophole as a regex missing a construct it was supposed to catch — a gap between what a rule declares and what it actually scans.
- The fix is always the same shape: **make the scanned target catch up with the declared scope, and lock the fix down with a fixture so it can't silently regress.** Treat the missed surface with the same standard as the one that was already covered — there's rarely a real reason for the purity bar to vary based on which kind of boundary file you're looking at. `[Implication]`
  - Generalization: whenever you add a new rule, or widen the wording of an existing one, **you must widen the scan target and the test fixtures at the same time.** Widening only the wording immediately degrades the difference into hope. Explicitly listing, in one place, "which files this rule actually inspects" is the standing prevention mechanism for this loophole. `[Implication]`
