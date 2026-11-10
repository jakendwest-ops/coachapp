# Security Timeline archive: 2026-10-05

Moved verbatim out of [../critical.md](../critical.md)'s Security Timeline on 2026-11-10 (docs-budget); only relative links were re-pointed for this folder.

- 2026-10-05: **The stored-XSS safety net has a known blind spot, and three older security rows were closed on 2026-09-27.** (1) `scripts/check-escaping.mjs`
  treats a line as markup only if that LINE contains `<`, so an interpolation on its own line inside a multi-line template (the template editor's back
  label was the case found) is invisible to it: removing `escapeHtml` from a real sink failed nothing. That one sink now has a behavioural spec
  (`tests/template-back-label-escaping-2026-09-27.spec.js`); how many others sit on continuation lines is UNMEASURED. Open row:
  [bugs/2026-09-27-escaping-checker-cannot-see-an-interpolation-on-a-continuation-line.md](../bugs/2026-09-27-escaping-checker-cannot-see-an-interpolation-on-a-continuation-line.md).
  (2) Closed 2026-09-27 on closure rule (b), with no new facts for this timeline: the original client-to-coach stored-XSS row (2026-07-13, commit `134140f`,
  `tests/regression-2026-07-13.spec.js`), the 5-file recurrence row (2026-08-12; a neuter run showed `tests/escaping-sweep-2026-08-12.spec.js` fails when one
  escape is removed) and `_effectiveCoachIdForClient` swallowing an RLS denial (2026-08-17, fixed 2026-09-04 and recorded above in the archived
  timeline; `tests/effective-coach-id-2026-09-04.spec.js`). `os-lint`'s `doc-obligations` flagged all four because closing a row rewrites its file, so it
  looks newer than this one; the only new content was the open row. **Lesson:** that check keys on file time, so a status edit on an old row can
  demand an append that has nothing new in it; read the rows before appending.

