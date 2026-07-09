# Draft: Reddit Post to Developer Communities

**Subreddits**: r/reactjs, r/nextjs, r/LocalLLaMA, r/typescript

**Title**: AI-Friendly architectures are a lie without AST-based enforcement: How we built Membrain

---

Hi everyone,

Over the past year, many of us have adopted AI-native development (using Cursor, Windsurf, Copilot, etc.). We've all tried writing custom instruction files like `.cursorrules` or `CLAUDE.md` to tell the AI how to structure our code.

But let's be honest: **natural language rules ("please do not import features directly", "make sure Core is pure") are easily ignored by LLMs.** We call these **"hope prompts"**—representing the lowest tier of architectural reliability. Even grep-based checks (`grep "Math.random"`) fail in practice because they miss things like `new Date()` or get fooled by comments, yielding a "false green" status.

To solve this, we designed **Membrain**—a Next.js development architecture built from the ground up for 90% AI / 10% Human collaboration, where boundaries are physically enforced using TypeScript AST analysis.

Here are the key lessons we learned from our alpha evaluations:

### 1. The Semipermeable Membrane (Structure)
Membrain forces a strict 3-way split for every feature: `types.ts` (the membrane contract), `core.ts` (pure calculation, zero side-effects), and `shell.tsx` (thin rendering wrapper). 

*   **Only data crosses the Core boundary. No IO enters, and no calculation escapes.**
*   Non-deterministic values (timestamps, random seeds, UUIDs) cannot be generated inside Core or even at server boundaries (`page.tsx` / `route.ts`). They must be read at the system edge (`source.ts`) and injected as pure data arguments.

### 2. AST-Based Physical Enforcement (Not Grep)
We built an AST verifier (`verify.mjs`) that inspects the TypeScript syntax tree directly. It automatically runs in our local pre-commit hooks and CI gates:
*   **L1 Isolation**: Verifies that features do not import the internals of adjacent features.
*   **L2 Purity**: Walks the AST to ensure `async/await`, browser globals (`window`, `fetch`), and backend clients (`prisma`) never leak into `core.ts`.
*   **L4 Exhaustiveness**: Guarantees that any handwritten switch statement handling feature effects terminates with an `assertNever` or `: never` type assertion.
*   **L5 Source Purity**: Catches non-deterministic imports (like `uuid` or `nanoid`) or inline aggregations at Page and Route boundaries.

### 3. The Backbone: Verifier Self-Verification (L6)
A verifier is only as good as its tests. We realized that regex/AST checkers can have silent bugs (e.g. a regex being fooled by a comment). 
To prevent this, Membrain implements **L6 Self-Verification**: we bundle a suite of intentionally broken code fixtures. Every time `verify.mjs` runs, it must first successfully reject all bad fixtures with exact rule/line-number matches before scanning the project. If the verifier passes a bad fixture, the build fails.

### 4. The Portal Strategy (Preventing AI Attention Drift)
In our early alphas, AI agents suffered from "attention context-switching costs." When given a large `README.md` full of human-centric installation guides and roadmap poems, the LLM got distracted and started writing incomplete, buggy code.

We resolved this by separating human and AI paths:
*   **Lightweight `README.md`**: A 15-line navigation portal that routes humans to `docs_HUMAN-ONLY/` and AI to `MEMBRAIN.md`.
*   **AI-Exclusive `MEMBRAIN.md`**: A highly dense, 130-line rulebook focused solely on implementation rules.
*   **`docs_HUMAN-ONLY/` Directory**: By naming the folder `docs_HUMAN-ONLY/`, AI agents recognize it as out of scope and do not scan it, keeping their context windows pristine and saving token costs.

### Does it work?
In our parallel implementation tests, we froze the feature types contract first, then distributed core/source/shell implementations to multiple autonomous agents. Because the boundary rules were physically checked in local Git loops and type contracts were locked, the agents completed implementation in parallel and integrated seamlessly with **zero collisions**.

We'd love to hear your thoughts:
*   Have you tried enforcing architectural boundaries for AI coders using AST parsers?
*   How do you handle AI attention drift in large codebases?

Check out our reference skeleton and verifier here: [GitHub Link]
