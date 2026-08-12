# Spacta — AI-First Vibe Coding Guide & Architecture v0.11

*If HUMAN_GUIDE was hard to follow, this one may help too.*

Welcome to Spacta.
This is Spacta's human-facing guide.
For the rules actually handed to the AI, see [SPACTA.md](../SPACTA.md).
For more detail on the concepts used in this file, see [docs_HUMAN-ONLY/spacta-alpha-evaluation.md](spacta-alpha-evaluation.md).

---

## 0. What is Spacta

Spacta is a Next.js development framework for Vibe Coding. Human intervention isn't expected anywhere except the UI.
It's a mechanism that confines each of an app's features inside its own bounded context, and mechanically verifies that the boundary holds.
With mechanical verification in place, an AI can manage what used to be implicit, complex Next.js state management and API logic under something self-evident.

That kind of implicit complexity can't be checked given how Next.js works (it doesn't error at build time).
There's nothing to do but trust that "the AI wrote it correctly" — and this, which can also be the source of spaghetti code, is, we believe, a fatal weakness especially in large apps where state management and logic grow complex. (There was nothing to rely on but the AI's reasoning ability. With no mechanical verifiability, there's no way to gain confidence that it's actually correct. Unhealthy state-management logic sails right through the build.)
Spacta inspects that complexity itself, improving both the AI's development experience and the app's maintainability.

*This is currently a beta, and improvement is essential. Feedback is welcome.*
*The foundation adopts the FCIS (Functional Core, Imperative Shell) way of thinking.*
*For installation, see [docs_HUMAN-ONLY/setup.md](setup.md).*

---

## 1. Introducing the concepts

Spacta isn't the name of a single tool — it's an umbrella term for a design philosophy built on several ideas, plus the scripts that enforce it.
- Context isolation
- Reducing complexity via state machines
- Contract-driven development
- Mechanical verification

### 1-1. Context Isolation

An AI's answer quality depends on the quality of its context.
From the standpoint of *attention dispersion* (Alpha Evaluation) too, context should ideally be short and simple.

But the following make that difficult to achieve with ordinary Next.js.

- **Loading related components:** In Next.js, where UI and logic are tightly coupled, resolving even one task demands loading related components. The AI ends up pulling in a lot of context for small tasks, and sinks a lot of reasoning cost into understanding and resolving implicit connections. (This is *extraneous cognitive load*, per the Alpha Evaluation.) In large apps especially, just loading context can consume much of the window. That drives up API cost and degrades the AI's output accuracy.
- **Complex state management:** Because Next.js tightly couples UI and state management, one feature change can ripple out into broad logic located far away. Worse, there's no mechanical way to confirm that ripple *isn't* happening — it sails right through the build. This becomes fertile ground for implicit errors and spaghetti code. Spaghetti code is grammatically permitted by Next.js, and it drives up the AI's reasoning cost both by complicating context and by being non-obvious. (This need to implicitly maintain consistency is one reason we use Opus-class high-performance models.)

**Spacta's answer is physical isolation.**
- Features like "dashboard" and "home" are isolated into their own dedicated directories along with their related code, and "dashboard" referencing "home" is forbidden by the verifier (`npm run verify`).
- Cross-file browsing isn't restricted by prompt. Input and output data types are declared and bound via TypeScript's **type contract** (described below), and once the AI implements to satisfy that requirement, function soundness is automatically guaranteed. "Just match the input and output" — this task-level binding makes it possible to complete an implementation using only that one file, without looking at anything else. That is, it enables context isolation.

When you (or the AI) touch one feature, all that's needed is that feature's own files — not the whole `app/` tree, and not the tangled causality hiding behind it. Follow the type contract and you can implement independently without breaching the boundary, with no need to know the whole app's spec. In early evaluation, multiple independent AI agents implemented separate features in parallel against a frozen contract and merged with zero conflicts. This is one of two levers Spacta uses to cut a task down to "a size AI can reliably handle" — the other is the next item.

### 1-2. Reducing complexity via state machines

Spacta adopts state machines. Exhaustive switch statements, and explicit `Action` / `Effect` types on every branch, are the kind of verbose thing that would exhaust a human writing by hand — but this is one piece of AI-friendly design that doesn't hurt AI output accuracy. — This corresponds to the Alpha Evaluation's *intrinsic cognitive load* (the complexity of the task itself). — An exhaustive, explicit state machine turns the work of "trace hidden interactions to infer what should happen" into the mechanical, pattern-matchable work of "fill in the one missing case." That isn't work requiring judgment. The LLM just has to fill in the appropriate tokens per its training data, and TypeScript's static type checking still acts as the last line of defense.

*(One note on cost: the verbose writing a state machine requires increases output tokens, which adds to API cost. But input tokens and reasoning cost are reduced by the context isolation above. Whether the net comes out cheaper or more expensive hasn't been measured yet.)*

### 1-3. Contract-driven development

Each feature — "dashboard," "home," and so on — exposes a frozen `types.ts` (the shape of its `State` / `Action` / `Effect`). Because the contract is fixed up front, each feature can be implemented independently — by you, by an AI, or by multiple AI agents each responsible for a different feature — without any of them needing to coordinate on each other's internals.

### 1-4. Verifier-driven development and eliminating the hope-prompt

Telling the AI via prompt, "please don't write fetch in this file," is a *hope-prompt* — an instruction that merely hopes the AI complies, with no guarantee it's followed. Worse, listing prohibitions like this disperses the LLM's attention mechanism and degrades the AI's answer accuracy. When attention spreads thin, the odds of dropping the "hope" during weight computation go up — **attention is a resource.**
Spacta conveys instructions as *rule-prompts*, and has the *verifier* (`npm run verify`) take over the role a hope-prompt used to play. You write a *rule* like "when fetch is needed, dispatch an Action to core" — you don't write "don't write fetch." Listing hope-prompts saddles the AI with a new responsibility — "comply with the prompt" — and imposes needless extra cognitive load. — To comply, the AI has to cross-check its implementation against the instructions and spend resources confirming it matches. —
By tolerating discipline violations at the prompt level, Spacta frees the AI from the responsibility of "complying with the prompt." The verifier guarantees compliance in its place.

The AI's discipline violations are caught by the verifier. If a rule is violated, the verifier returns an error, and all that's left is to fix it yourself until it's green. That the boundary is respected is guaranteed not by memory or hope, but by a script actually reading the code. That's what lets the AI concentrate all of its attention resource on the task in front of it, and nothing else.

That said, what `verify` guarantees is **that the boundary rules were followed** — not **that there are no bugs.** Code that writes `count + 2` where it should write `count + 1` passes green just fine.

**What a green `verify` tells you is not "there are no bugs."**
- If there's a bug, it's contained inside one feature's core, and it's reproducible purely from `(state, action)`
- There are no hidden inputs
- Spillover to other features is reduced. *As things stand, this is true at the code level. But indirect coupling from reading the same table or the same API remains. And because that coupling **never shows up in an in-process Action log**, replay reconciliation can't catch it either.*
Spacta doesn't *prove* the absence of implicit connections — it removes unnecessary connections and routes what remains through an *explicit door (the type contract).* So correctness stops being a question you can only answer by surveying the whole app, and becomes a **local question** answerable by reading one pure function. (See the Alpha Evaluation, "condensation of complexity.")

**Why does this work so well.** In tightly coupled Next.js, "is this correct?" becomes a question you can only answer by looking at the whole app — because you can't trace where state gets mutated or where an effect fires. Spacta collapses that down to **"a question answerable by reading one pure function."** It doesn't guarantee correctness — it puts correctness into a form a human, an AI, or a test can *actually go check.* That's the real reason it fits AI so well — the object of reasoning folds down into one file.

### 1-5. The Gardener

The faster you move, the more ad-hoc Tailwind values and duplicated markup pile up in the UI code. Run `npm run garden` and an AI sweeps through the codebase once, consolidating this clutter into shared, semantic UI primitives — so today's speed doesn't turn into tomorrow's mess.

*If, reading this far, you thought "isn't this the same pattern as Redux / Elm?" — that instinct is correct. What's new isn't the pattern itself; it's that this boundary isn't a mere convention but is physically enforced and mechanically verified (mechanical verification, above). Where this pattern lineage comes from, and where Spacta stands within it, is covered in §6.*

*One more note: keeping the UI visually consistent can't be maintained closed within a single feature. When you want to align design across pages, we recommend reviewing multiple features' UI side by side while adjusting (this doesn't touch the isolation rule, since it isn't importing another feature). That's because shared tokens and `shared/ui` guarantee component-level consistency, but don't fully automate harmony across the page as a whole.*

*This is a recommendation for the **tuning phase**, not a rule for how implementation work gets divided. The ordering for parallel delegation during the implementation phase lives in `SPACTA.md` §4-6 (since the implementing AI reads `SPACTA.md`, not this human-facing guide, **the procedure needs to live over there**). In practice, having one agent write shell and `app/` together at the end is how this "review across features while adjusting" tends to emerge naturally as a step.*
