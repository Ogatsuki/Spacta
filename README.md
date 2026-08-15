# Spacta

**Spacta lets an AI agent work on one feature of a large app without ever needing to hold the whole app in its head — and lets you prove it stayed inside the lines.**

This is a **v0.12 / early feedback release** — the architecture works, but the docs are still rough in places. Feedback on what's confusing is very welcome.

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

### What lands in `node_modules/spacta/`

Code, and the documents a machine reads. **Nothing a person reads at leisure** — those are in
[the repository](https://github.com/Ogatsuki/Spacta), which is one link away and never out of
sync with itself.

| Installed | What it is |
|---|---|
| `dist/`, `engine/` | the compiled engine, and the readable `.ts` source beside it |
| `verify/`, `garden/`, `metrics/measure.mjs` | the CLIs, plus the fixtures and corpus their self-tests need |
| `replay/` (four files) | the cross-check harness — the half that names no application |
| `starter/` | a working reference app, and what the L6 wiring test measures globs against |
| `skills/`, `hooks/`, `.claude-plugin/` | the agent-facing half, written out by `npx spacta-init` |
| `docs_AI-ONLY/SPACTA.md`, `garden/GARDENER.md` | read by the agent, and named by the tools' own output |
| `README.md`, `LICENCE` | the two npm always shows a human |

The reason is not tidiness. The tarball and the repository are different trees, so a relative
link that is right in one is a dead link in the other — and the reader who hits it is someone who
opened `node_modules/` because something had already gone wrong. Shipping only what the machines
read leaves almost nothing that could hold such a link, and `smoke-package` fails on any that
remain.

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

### For the agent doing the work

Spacta is mostly read by AI, so its instructions and its enforcement install into the harness
rather than into a README nobody re-reads.

```sh
npx spacta-init                    # -> .claude/skills/spacta/ and .claude/hooks/
```

or, tracking the plugin's own releases instead of the installed package version:

```
/plugin marketplace add Ogatsuki/Spacta
/plugin install spacta@spacta
```

Two things arrive:

- **A skill.** Only its description sits in context; the body loads when it is relevant, and the
  reference files load only when the body sends you to them. It covers the Laws, where each kind
  of code goes, and — the part no tool checks — how to write behavioural scenarios.
- **A Stop hook.** `SPACTA.md` §4-5 says "run `verify` yourself and fix all errors until green".
  By Spacta's own trust hierarchy that sentence is *Advice*: an agent that remembers it runs the
  verifier. The hook makes a turn unable to end on a red one.

  It stays silent unless a `.ts`/`.tsx` file under `src/` or the app router is actually dirty,
  caches what it last saw green, blocks **at most once per turn** so a session can never be
  trapped, and exits quietly if it cannot find a verifier. It runs `npm run typecheck` too, when
  the project has that script.

**The hook is not a Law**, and it is worth being exact about why: it binds sessions in this
harness with this hook installed, and nothing else. Human commits and other agents pass straight
through. The Law is CI. This is the same check moved to where fixing it costs one edit.

### Working in this repository

These need a `git clone`, not an install: the behavioural gates read scenario files and a
reference application that the package deliberately does not carry.

```sh
npm run ci         # everything CI runs that needs nothing beside this repo
npm run build      # engine/*.ts -> dist/ (also runs on prepack)
npm run verify     # the verifier against the reference corpus, starter/
npm run smoke      # pack, install into a scratch project, and use the result
npm run replay     # the behavioural gates (needs ../livingdoc beside this repo)
```

`.github/workflows/ci.yml` runs the first group on Node 18/20/22, plus the generic replay
self-test and the packaged-artifact smoke test. The behavioural gates — cross-check, runtime
serialization, mutate — read the reference application from another repository, so they run only
when a `LIVINGDOC_TOKEN` secret is present. **When it is not, the job writes what it did not
check into the run summary rather than passing quietly**: structure being green says nothing
about behaviour, and a CI badge that implies otherwise is worse than no badge.

---

## Documentation

**One document is installed** — the rulebook the agent is sent to by path:

**[docs_AI-ONLY/SPACTA.md](docs_AI-ONLY/SPACTA.md)** — the ten Laws, at
`node_modules/spacta/docs_AI-ONLY/SPACTA.md`. If `npx spacta-init` has run you need not open it
yourself: the skill in your harness links onward to it when its one-line summaries are not enough.

**Everything else is in the repository**, and stays there on purpose. A document read at leisure
has no business being installed once per project across a monorepo, and a copy inside
`node_modules/` is a copy that can be a version behind the thing it describes.

### → [github.com/Ogatsuki/Spacta](https://github.com/Ogatsuki/Spacta)

| Looking for | In the repository |
|---|---|
| Bootstrapping a project from scratch | [`docs_HUMAN-ONLY/setup.md`](https://github.com/Ogatsuki/Spacta/blob/master/docs_HUMAN-ONLY/setup.md) |
| What Spacta is, and what a green `verify` does *not* mean | [`docs_HUMAN-ONLY/OVERVIEW.md`](https://github.com/Ogatsuki/Spacta/blob/master/docs_HUMAN-ONLY/OVERVIEW.md) |
| The reasoning at length | [日本語](https://github.com/Ogatsuki/Spacta/blob/master/docs_HUMAN-ONLY/ja/HUMAN_GUIDE.md) · [English](https://github.com/Ogatsuki/Spacta/blob/master/docs_HUMAN-ONLY/HUMAN_GUIDE.md) |
| Release history | [`CHANGELOG.md`](https://github.com/Ogatsuki/Spacta/blob/master/CHANGELOG.md) |
| What each check does, in detail | [`verify/README.md`](https://github.com/Ogatsuki/Spacta/blob/master/verify/README.md) |
| Why Spacta is built this way — settled decisions, and what is still open | [`docs_AI-ONLY/`](https://github.com/Ogatsuki/Spacta/tree/master/docs_AI-ONLY) |

*If you are an agent building an application: only `SPACTA.md` is for you. The decision log and
the open questions say why Spacta is built the way it is, and reading a project's unsettled
questions makes its settled rules sound unsettled.*
