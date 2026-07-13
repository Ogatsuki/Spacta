# Membrain Bootstrap & Setup Guide (HUMAN ONLY)

This guide explains how to bootstrap a new Membrain-compliant project. 
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
3. **Follow the Form**: Implement features following the **default form**: `src/features/<name>/{types,core,shell}` + `src/shared/{runEffect,source}` + `app/**/page.tsx`. The bundled verifier assumes this structure.
4. **Run**: Keep `npm run verify` green. Ensuring the L6 self-test passes first is proof that the verifier is functioning.
5. **Customizing the Form**: As stated in `MEMBRAIN.md` §2, the Form is flexible. However, if you change it, make sure the target paths/rules in `verify/verify.mjs` are updated accordingly. The L6 self-test will detect any omissions. **Emptying the verifier's checks is strictly prohibited.**

---

## Verifier CI Gate
To enforce the Laws in CI, make sure `npm run verify` is run before merges. If the verifier fails or the L6 self-test detects a broken verifier, the merge must be blocked.
