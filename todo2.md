# Membrain Phase 2: Documentation & Portal Optimization Todo

- [x] **README.md & MEMBRAIN.md Separation (Portal Strategy)**
  - [x] Rewrite `README.md` as a lightweight index/portal (under 30 lines) to avoid AI attention drift and save tokens.
    - Add a clear directive routing AI developers to `MEMBRAIN.md`.
    - Route human developers to `docs/HUMAN_GUIDE.md`.
  - [x] Create `docs/HUMAN_GUIDE.md` to host human-centric descriptions, installation guides, and overview prose.
  - [x] Optimize `MEMBRAIN.md` strictly as the AI-exclusive runtime rulebook (under 150 lines).
    - Strip `§0 Bootstrap` and move it to `docs/setup.md`.
    - Strip `§3 Verification Contract` and consolidate it into `verify/README.md`.
    - Keep only `§1 Law`, `§2.5 Judgment` (summarized), and `§4 Minimal Instructions`.
  - [x] Create `docs/setup.md` containing bootstrap instructions (former §0 Bootstrap).

- [x] **English Polishing**
  - [x] Review and refine English in `starter/README.md` and `verify/README.md` to ensure term consistency (e.g., matching the new diagnostic error names).

- [x] **Reddit Feedback Post Draft**
  - [x] Draft a compelling Reddit feedback post explaining Membrain's AI-friendly architecture, AST physical enforcement, and the results of this alpha evaluation.
