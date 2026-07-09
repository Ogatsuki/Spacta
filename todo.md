# Membrain Release Preparation Todo (Pragmatic Plan)

- [x] **README.md & MEMBRAIN.md Separation**
  - Create a clean, human-oriented `README.md` for GitHub/Reddit.
  - Setup `MEMBRAIN.md` as the AI-exclusive rules document (clean up prose, keep rules clear).

- [x] **Structured Plain-Text Verification Errors**
  - Modify `verify/verify.mjs` error outputs to print simple, clear, structured plain text (avoid complex ASCII caret art, which is hard for AIs to parse and bloats the verifier script).
  - Format:
    ```
    ✗ [Law Code] [Violation Name]
      --> [relative-path-to-file]:[line-number]:[column-number]
      Code: [The violating line of code]
      Why: [1-line architectural reason]
      Fix: [1-line clear action to resolve]
    ```

- [x] **Verifier Core Improvements (High-Value / Low-Cost)**
  - [x] **L1 Relative Path Resolution Upgrade**
    *   *Fix*: Replace regex `^\.\.\/([^/]+)\/` with absolute path resolution using `path.resolve(path.dirname(file), spec)` to prevent nested relative imports (e.g., `../../../other`) from bypassing the check.
  - [x] **L6 Self-Test Precision Check**
    *   *Fix*: Update L6 self-test fixtures to assert the exact triggered line number and rule code, preventing false passes where a test fails for the wrong reason.
  - [x] **L5 Simple Purity Blacklist**
    *   *Fix*: Add a simple import blacklist check for common UUID/nanoid packages (`uuid`, `nanoid`) on page/route boundaries.

- [x] **Deferred / Dropped Tasks (Avoid Over-Engineering)**
  - [x] *Drop*: L8 Inline Style Block (Style attributes are essential for React dynamic values. Restricting them ruins DX and yields high false positives).
  - [x] *Drop*: L4 Switch Scope Isolation (Multiple effect switches per file is a rare anti-pattern. Complex AST scope tracking is not worth the cost).

- [x] **English Polishing**
  - Review and refine English in `starter/README.md` and `verify/README.md`.

- [x] **Reddit Feedback Post Draft**
  - Draft a compelling Reddit post to gather feedback on developer communities.
