# Spacta Bootstrap & Setup Guide (HUMAN ONLY)

This guide explains how to bootstrap a new Spacta-compliant project.
If you are an AI developer, you do not need to read this for daily implementation tasks — `npx spacta-init` installs what you need into the harness.

**Nothing here is copied by hand.** Until 0.11 this page began "copy the bundled `verify/`, `garden/` and `starter/` directories into your project", and the engine's TypeScript source landed in every adopter's `src/shared/spacta/`. Those copies went silently stale twice. The engine and the verifier are two halves of one contract — the fixtures under `verify/fixtures/` encode the shape `engine/` produces — so they now install together, at one version, as one package.

## 5 Steps to Bootstrap Phase 0

1. **Install**: `npm install spacta`. One package brings the engine (`spacta/runtime`, `spacta/react`), the verifier, the measuring tools, the gardener and the replay harness. `react` and `typescript` are optional peers: you need `react` only if you import `spacta/react`, and `typescript` only for the CLIs — which every TypeScript project already has.
2. **Wire**: Add the scripts to your `package.json`. The binaries come out of `node_modules/.bin`, so there is no path to keep correct:
   ```json
   {
     "scripts": {
       "verify": "spacta-verify .",
       "garden": "spacta-garden .",
       "measure": "spacta-measure ."
     }
   }
   ```
   Ensure `verify` is set up as a CI gate (pre-commit or GitHub Actions).
3. **Follow the Form**: Implement features following the **default form**: `src/features/<name>/{types,core,shell}` + `src/features/<name>/components/` + `src/shared/{runEffect,source}` + `src/shared/ui/` + `app/**/{page,route}`. `node_modules/spacta/starter/` is a working example of exactly this shape — copy `app/`, `src/`, `tsconfig.json` and `tailwind.config.ts` out of it if you want a running skeleton. Do **not** copy `verify/` or `garden/`: they are installed, not vendored. The verifier assumes this structure — in particular L9 and L10 scan the two presentation directories, so components placed elsewhere are silently unverified.
4. **Install the agent-facing half**: `npx spacta-init` writes `.claude/skills/spacta/` and `.claude/hooks/spacta-verify-on-stop.mjs` into your project, and prints (or, with `--write-settings`, merges) the Stop-hook entry for `.claude/settings.json`. The skill describes the Laws that the *installed* verifier enforces, which is why it is written by the package rather than tracked separately — a skill one minor version out from its tool is worse than no skill. **Re-run it after every `npm update spacta`.**
5. **Run**: Keep `npm run verify` green. Read the two lines it prints before the scan — the L6 self-test (the checkers reject planted violations) and the L6 wiring test (each check's glob selects files in the reference corpus, `node_modules/spacta/starter/`) — because a green scan means nothing if the verifier itself is not working. Note the third exit code: `2` / `INCONCLUSIVE` means zero files were walked. That is not a green, and it usually means the target path is wrong.

## Customizing the Form

As stated in `SPACTA.md` §2, the Form is flexible. However, if you change it, the target paths/rules in the `CHECKS` registry in `verify/verify.mjs` have to change with it — and **`verify/verify.mjs` now lives in `node_modules/`, which you must not edit**: the next `npm install` reverts it, and a verifier that disagrees with its own package version is the staleness this release removed. If the default Form genuinely does not fit, open an issue rather than patching the installed copy.

Whichever way the Form moves, **check the `Scanned: N files` line for every law you touched.** Be precise about what the two self-tests can and cannot tell you here: the fixture self-test proves the checker *functions* still reject violations, and the wiring test proves each glob still selects something in the bundled corpus. **Neither one proves that a customized glob matches your customized structure** — a glob aimed at the wrong directory finds zero files, reports zero violations and looks exactly like a law that passed. The scanned count is what exposes that. **Emptying the verifier's checks is strictly prohibited.**

---

## Verifier CI Gate

To enforce the Laws in CI, make sure `npm run verify` is run before merges. If the verifier fails or the L6 self-test detects a broken verifier, the merge must be blocked.

The Stop hook from step 4 is **not** a substitute for this. It binds sessions in that harness with that hook installed, and nothing else — human commits and other agents pass straight through. The Law is CI; the hook is the same check moved to where fixing it costs one edit.
