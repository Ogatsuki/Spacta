# Spacta

**Spacta lets an AI agent work on one feature of a large app without ever needing to hold the whole app in its head — and lets you prove it stayed inside the lines.**

This is a **v0.11 / early feedback release** — the architecture works, but the docs are still rough in places. Feedback on what's confusing is very welcome.

---

## Running the tooling

The verifier and the measurement tool are plain ESM and depend only on Node built-ins, so they
run under either runtime. The npm scripts say `node` so that the tooling stays usable in projects
that do not have bun installed; if you develop with bun, invoke the scripts directly instead:

```sh
node verify/verify.mjs <target>     # or: bun verify/verify.mjs <target>
node metrics/measure.mjs <target>   # or: bun metrics/measure.mjs <target>
```

Internally the tools spawn themselves with `process.execPath`, so whichever runtime starts them
is the one they keep using.

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

Start here — what Spacta is for, what a green `verify` does and does not mean, and an explicit map of what it fails to solve:

**[OVERVIEW.md](OVERVIEW.md)** (English)

For the deeper philosophical background:

**[docs_HUMAN-ONLY/ja/HUMAN_GUIDE.md](docs_HUMAN-ONLY/ja/HUMAN_GUIDE.md)** (Japanese)

*That guide is the only current one. `docs_HUMAN-ONLY/HUMAN_GUIDE.md` (English) is an archived earlier draft pending replacement; it still contains claims this project has since retracted, so do not read it. `OVERVIEW.md` is an independent document rather than a translation of the Japanese guide, so the two are not kept in structural correspondence.*

To bootstrap a new Spacta project from scratch:

**[docs_HUMAN-ONLY/setup.md](docs_HUMAN-ONLY/setup.md)**
