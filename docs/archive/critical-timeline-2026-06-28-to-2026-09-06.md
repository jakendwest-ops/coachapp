# Security timeline archive — 2026-06-28 to 2026-09-06

Moved verbatim out of [../critical.md](../critical.md)'s Security Timeline on 2026-09-27 (os-lint docs-budget).
Nothing here was edited; newer entries continue in critical.md.

- 2026-06-28: GDPR hardening session. `progress-photos` made private. PII stripped from 16 log
  sites. Consent checkbox added to signup. Data export + delete account built. Storage bucket RLS
  established for logos and progress-photos.
- 2026-07-01: Found and fixed a solo-account RLS gap — `client_1rms` had no INSERT/UPDATE/DELETE
  policy for solo users, `client_programs` had no UPDATE/DELETE policy for solo users. Added 5
  solo-scoped policies. **Lesson:** when adding a new role/account type, every table it touches
  needs its own explicit write policies checked — a working INSERT doesn't imply UPDATE/DELETE work.
- 2026-07-03: GitHub Pages deploy source switched from legacy branch-deploy to Actions-only, fixing
  a redundant dual-workflow setup. Confirmed FK cascade rules across the programs/templates table
  family — `workout_templates` itself does NOT cascade-delete when its `program_phase_workouts` row
  is removed (SET NULL instead), handled explicitly in `deleteProgram()`.
- 2026-07-03: A live `ghp_` PAT was found embedded in plaintext in coachapp's `.git/config` remote
  URL (and accidentally surfaced in-chat); deleted, remote cleaned, git now authenticates via `gh`
  CLI's keyring OAuth token. **Lesson:** never run a command that echoes a known-embedded secret.
- 2026-07-28: **4th instance of the client→coach stored-XSS pattern** — `client_check_ins.notes`
  rendered unescaped on the coach's client-profile Overview tab. Swept and closed ~33 sinks total.
  **Standing lesson:** any new client-writable free-text field needs its every render site checked
  against escaping at the time it's added, not discovered later.
- 2026-07-23: **GDPR export was not a complete disclosure.** `downloadMyData` branched on role, so a
  coach who also trains could never export their own weights/workouts/PBs by any route;
  `client_check_ins` (Art. 9 special-category) was in no branch; `workout_logs` exported headers
  only, zero sets/reps/loads. Both halves now run ungated and independently.
- 2026-08-01: **5th instance of stored-XSS** — a cluster in the runner's prescription render path
  (~15 sinks), found by the weekly full-file review.
- 2026-08-11: GDPR consent capture + privacy policy — **deferred by Jake**, tracked in
  `docs/bugs/2026-08-11-gdpr-no-consent-capture-and-no-privacy-policy.md`. A deferred GDPR
  obligation is still an obligation.
- 2026-08-12: **6th instance, and the first confirmed regression against a specific dated fix.**
  `app-programs.js` rendered the same expression `app-workouts.js` correctly escaped; the 2026-07-18
  hardening pass had documented the fix but named only two of the real surfaces.
- 2026-08-23: This timeline had received no append since 2026-07-28, during which the stored-XSS
  pattern it tracks recurred twice more and two GDPR items landed. `os-lint`'s `doc-obligations`
  check now goes RED when a `bugs/` file matching a tracked security class is newer than this file's
  last write.
- 2026-08-29: **7th instance**, found by the weekly full-file review — a field escaped at one render
  site and raw at another, sibling site, twice over.
- 2026-08-29: **A new recurring pattern named: readability is not ownership.** Two save paths
  treated "I can read this row" as "it is mine" instead of checking an owner column against
  `auth.uid()`. Fixed to 4 of 4 client-scoped writers using the strong check.
- 2026-09-04: `_effectiveCoachIdForClient` no longer treats an unreadable row as ownership — the
  `.single()` error (PGRST116 on zero rows) is now the denial signal, returning `null` rather than
  falling back to the current user's own id.
- 2026-09-06: **A third shape of "GDPR export incomplete" — silent by construction.**
  `app-progress.js` filled `bundle.profile` from a `.single()` whose error was discarded, so a
  failed read yielded `undefined` and the export reported success with the profile section simply
  absent.
- 2026-09-06: **Public self-signup was still enabled on live for 44 days** after the code fix that
  was supposed to remove it. The 2026-07-24 fix removed the signup form because `supabase.auth.signUp`
  is directly callable from devtools regardless of what the UI shows — but the corresponding Supabase
  dashboard toggle (`disable_signup`) was never flipped. Found and closed 2026-09-06: probed
  (`disable_signup:false`), Jake flipped it, re-probed (`true`), confirmed the admin invite path
  unaffected end-to-end. **Lesson:** a code-level fix and its infrastructure-level counterpart are
  two different fixes — closing one doesn't close the other, and neither closes the incident alone.
- 2026-09-06 (**8th instance** of the unescaped-render pattern): the free-text periodization "reps"
  value round-trips through the database unescaped, re-injecting on every reopen of that programme's
  Periodization modal. `scripts/check-escaping.mjs` exits 0 over it — a clean escaping run doesn't
  mean what it appears to. The class was counted, not sampled: 45 sites match the vulnerable
  pattern repo-wide, exactly 1 is exploitable.
