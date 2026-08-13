# Spacta

**Spacta lets an AI agent work on one feature of a large app without ever needing to hold the whole app in its head — and lets you prove it stayed inside the lines.**

This is a **v0.11 / early feedback release** — the architecture works, but the docs are still rough in places. Feedback on what's confusing is very welcome.

---

## Install

```sh
npm install spacta
```

One package, one version — on purpose. The engine and the verifier that checks it are two halves
of one contract: the fixtures under `verify/fixtures/` encode the shape `engine/` produces, so
letting the two drift apart at the version level would reintroduce exactly the staleness this
package exists to end. Adopters used to hold hand-copied vendored copies of both, and those
copies went silently stale twice.

`react` and `typescript` are optional peers. You only need `react` if you import `spacta/react`,
and you only need `typescript` for the CLIs — which every TypeScript project already has.

### The engine

```ts
// The engine proper. Names no UI framework — this is the unit that ports.
import { createRuntime, createRecorder } from "spacta/runtime";

// The React binding adapter. Holds state and mints non-determinism at the edge.
import { useSpacta } from "spacta/react";
```

`spacta` and `spacta/runtime` are the same entry point; the longer name is there so that a file
importing the engine says which half it took.

### The tooling

```sh
npx spacta-verify .      # the laws, checked against your tree (exit 1 on a violation)
npx spacta-measure .     # zones, effect-union spread, tiers — JSON on stdout
npx spacta-garden .      # turns verify's info/warn into a work order
```

Each takes one target path and reads nothing but that path and this package, so they work on any
project. All three are plain ESM over Node built-ins and run under `node` or `bun` alike —
internally they re-spawn with `process.execPath`, so whichever runtime starts them is the one
they keep using.

### The behavioural gate

`spacta-verify` reads structure, and it prints on every run that it never checks semantic
correctness. `spacta/replay` is what closes some of that gap:

```js
import { runCrossCheck } from "spacta/replay";
import * as cart from "../src/features/cart/core.ts";

const { failed } = await runCrossCheck({
  sessionDir: "replay-sessions",
  scenarios: [{
    id: "S1", title: "add to cart, server rejects it", aims: "(2)", drivers: ["engine"],
    features: () => ({ cart: { init: cart.init, update: cart.update, initData: SEED } }),
    async script(d, io) {
      d.cart.dispatch({ type: "ADD", sku: "x", correlationId: "c1" });
      await io.settleAll({ outcome: () => ({ fail: "Request failed (500)" }) });
    },
  }],
});
process.exit(failed === 0 ? 0 : 1);
```

It drives your real `core.ts` through the real engine, records the Actions, reads the recording
back off disk, folds `update` over it, and compares **every intermediate state**. You write the
scenarios; the loop is not yours to write. Note the honest limit: a cross-check compares a run
against its own replay, so **a feature that is wrong but deterministic passes**. Catching a wrong
answer means asserting the answer, separately.

What is still **not** published is `tools/mutate.mjs` and the scenario files themselves — they
drive the reference application by relative path, so they measure *these* gates rather than
yours.

### Working in this repository

```sh
npm run ci         # everything CI runs that needs nothing beside this repo
npm run build      # engine/*.ts -> dist/ (also runs on prepack)
npm run verify     # the verifier against the reference corpus, starter/
npm run smoke      # pack, install into a scratch project, and use the result
npm run replay     # the behavioural gates (needs ../livingdoc beside this repo)
npm run vendor:check
```

`.github/workflows/ci.yml` runs the first group on Node 18/20/22, plus the generic replay
self-test and the packaged-artifact smoke test. The behavioural gates — cross-check, runtime
serialization, mutate — read the reference application from another repository, so they run only
when a `LIVINGDOC_TOKEN` secret is present. **When it is not, the job writes what it did not
check into the run summary rather than passing quietly**: structure being green says nothing
about behaviour, and a CI badge that implies otherwise is worse than no badge.

---

## FOR AI DEVELOPERS

If you're an AI agent, read only the rulebook below.

**[SPACTA.md](SPACTA.md)**
**[spacta-decisions.md](spacta-decisions.md)**
**[spacta-open-questions.md](spacta-open-questions.md)**
****

*Note: Do not read `docs_HUMAN-ONLY/` unless explicitly instructed, as it contains human-centric prose that may pollute your attention context.*

---

## FOR HUMAN DEVELOPERS

philosophical background:

**[docs_HUMAN-ONLY/ja/HUMAN_GUIDE.md](docs_HUMAN-ONLY/ja/HUMAN_GUIDE.md)** (Japanese)

**[docs_HUMAN-ONLY/HUMAN_GUIDE.md](docs_HUMAN-ONLY/HUMAN_GUIDE.md)** (English)

To bootstrap a new Spacta project from scratch:

**[docs_HUMAN-ONLY/setup.md](docs_HUMAN-ONLY/setup.md)**
