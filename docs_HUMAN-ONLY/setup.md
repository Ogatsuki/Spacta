# Spacta Bootstrap & Setup Guide (HUMAN ONLY)

This guide explains how to bootstrap a new Spacta-compliant project. 
If you are an AI developer, you do not need to read this for daily implementation tasks.

## 5 Steps to Bootstrap Phase 0

1. **Copy**: Copy the bundled `verify/` (verifier + fixtures), `garden/` (cleanup instruction generator), and `starter/` (verified template) directories directly to the root of your new project.
2. **Wire**: Add the verification and gardening scripts to your `package.json`:
   ```json
   {
     "scripts": {
       "verify": "node verify/verify.mjs .",
       "garden": "node garden/garden.mjs ."
     }
   }
   ```
   Ensure `verify` is set up as a CI gate (pre-commit or GitHub Actions).
3. **Follow the Form**: Implement features following the **default form**: `src/features/<name>/{types,core,shell}` + `src/features/<name>/components/` + `src/shared/{runEffect,source}` + `src/shared/ui/` + `app/**/{page,route}`. The bundled verifier assumes this structure — in particular L9 and L10 scan the two presentation directories, so components placed elsewhere are silently unverified.
4. **Run**: Keep `npm run verify` green. Read the two lines it prints before the scan — the L6 self-test (the checkers reject planted violations) and the L6 wiring test (each check's glob selects files in `starter/`) — because a green scan means nothing if the verifier itself is not working. Note the third exit code: `2` / `INCONCLUSIVE` means zero files were walked. That is not a green, and it usually means the target path is wrong.
5. **Customizing the Form**: As stated in `SPACTA.md` §2, the Form is flexible. However, if you change it, make sure the target paths/rules in the `CHECKS` registry in `verify/verify.mjs` are updated accordingly — and then **check the `Scanned: N files` line for every law you touched.** Be precise about what the two self-tests can and cannot tell you here: the fixture self-test proves the checker *functions* still reject violations, and the wiring test proves each glob still selects something in `starter/`. **Neither one proves that your customized glob matches your customized structure** — a glob aimed at the wrong directory finds zero files, reports zero violations and looks exactly like a law that passed. The scanned count is what exposes that. (If you move files out of the default Form, the wiring test may also go red because it measures against `starter/`, which still follows the default; treat that as a prompt to update the corpus, not as noise to silence.) **Emptying the verifier's checks is strictly prohibited.**

---

## Verifier CI Gate
To enforce the Laws in CI, make sure `npm run verify` is run before merges. If the verifier fails or the L6 self-test detects a broken verifier, the merge must be blocked.
