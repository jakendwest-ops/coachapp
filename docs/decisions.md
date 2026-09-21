# Decisions

A flat, append-only, reverse-chronological log of significant, hard-to-reverse choices and why they
were made. New entries go at the top. No numbering, no per-decision files — see
[architecture.md](architecture.md) for the resulting shape, not the reasoning.

**Migrated 2026-09-15** from the Vault's `STATUS.md` "Continuity block" — ~40 dated, code-specific
engineering lessons. Most are too granular/line-specific to be "decisions" in this file's sense and
would go stale as the code changes; they're preserved in full, unedited, at
[archive/status-continuity-2026-09-08.md](archive/status-continuity-2026-09-08.md). The 5 genuinely
process-level entries below were pulled out and belong here.

---

**2026-09-21 — SQL is executed locally, on the live schema, before anyone runs it on the live database — and that check runs
on every push.** Until now a migration's first real execution was on the live project (the sql-safety skill said there was
"no local way"). `scripts/sql-verify/` runs a script on an in-memory Postgres (PGlite, a new dev dependency) loaded with the
live tables, indexes and RLS policies, asserts the numbers and who is refused, and a mutation suite requires each deliberate
breakage to fail; `checks.sh` rule 9m runs both (about 17 s). The first migration through it (`coach_client_summary`) had 47
checks and 9 mutations, and the three mutations a first draft missed are why the suite exists. *Limits, stated in its README:*
only SELECT/ALL policies are reproduced, PGlite is Postgres 18 vs the live 17.6, and it proves nothing about the PostgREST
layer or the real data — the script's own read-back after applying is still the last check. *Not chosen:* a throwaway
Supabase project (a second project, credentials and network on every push); relying on reviewers reading SQL.

---

**2026-09-20 — Reads of growing tables page through one shared helper, and a failed read fails the whole export.**
The API returns at most 200 rows per request and says nothing when it cuts a list short (measured on the live project
that day), so screens that asked for "all" were right until row 201. `_fetchAllRows` (`js/app-core.js`) is now the one
way to read a table that grows without limit: it pages, returns `{ data: null, error }` rather than a partial list, and
starts each page where the rows read so far end. *The choice a future session might reverse:* the data export used to
tolerate a failed read, including the profile (it discarded the error and shipped a bundle with a hole in it); it now **throws**, and
`downloadMyData` says "Export failed". An export that reports success while incomplete is worse than one that says it
could not finish — do not make it "more forgiving". *Not chosen:* raising the server's `max_rows` (it only moves the cliff, and it is a hosted-project setting the app cannot
see or test); a per-screen `.limit(...)` (the cliff moves, the silence stays). *Tested against* `tests/capped-api.js`, a read-only stand-in that caps
at 200 like the live API and fails closed.

---

**2026-09-19 — Errors are captured automatically; feedback is an email link, and nothing a user types is stored.**
Built to close the two beta gaps deferred 2026-07-11 (a tester's crash was invisible; no feedback channel), now that an
outside tester exists (2026-08-09). `log.error` and two global handlers report to `app_errors`; the owner reads
them, grouped, in a Settings card. *The constraint that shaped it:* the privacy policy promises error logs hold
"only internal IDs and timestamps — never your name, email, or health values", so a report is a code, a code
location and technical context, never error text — no policy edit, no version bump, no re-consent.
*Rejected:* an in-app feedback form that stores text (needs a policy sentence and a version bump, so every user is
re-prompted once, and free text can hold health data). *Also:* capture is off before consent, after sign-out and
under WebDriver; users may delete their own rows (the E2E accounts must clean up after themselves); a trigger caps
60 reports per user per hour. *Not verified by automation:* the owner's read path — no spec can log in as the owner.
*Found in pre-commit review, fixed:* `created_at` was client-writable and the rate limit counts by it — 61 back-dated
inserts were all accepted on the live table — so the trigger now sets it to `now()` itself and locks per user; capture
is bound to the user id that passed the consent gate, not a bare flag; failed saves through `dbq` are reported; a report
that fails to store is retried, capped at 5 a session. *Invisible by design:* failures before capture is on (profile
fetch at boot, first-login starter seed, consent save, login, password forms). *To decide at the next policy revision:*
the policy says logs hold "only internal IDs and timestamps"; a report also holds a tag, code, code location, page, role
and module versions. No name, email or health value can reach it, so the promise holds in substance, but "only" is
narrower than the data.

---

**2026-09-19 — The Progress → Benchmarks tab is deleted.** Jake, twice ("it needs to be removed", "just
delete the benchmarks page"), after being shown it was the only Progress view of `performance_logs`
(cardio / benchmark / body-metric records) — a different table from Personal Bests' `client_1rms`.
Supersedes the 2026-08-17 keep-and-rename (`archive/log.md`; the comment in `renderProgress`). Nothing
calculates from it (every %1RM target reads `client_1rms`), so no prescription breaks; the rows are
untouched in the DB and still in the Settings export (name, category, value, unit, date — the export has
never carried `notes`).
*Accepted:* the client now sees them only on the dashboard Benchmarks cards — the four most recently
logged names — while their coach still sees all of them on the client's Performance tab. **A solo
account has no coach and no client-profile view, so for solo the cards and the Settings export are the
only views: records beyond the four most recent names are not visible in the app.** (Found by the
2026-09-19 pre-commit review; the decision stands.) *Rejected:* merging into Personal Bests. *Follow-on:* `bugs/2026-09-19-dashboard-benchmarks-cards-pick-best-without-checking-units.md`.

---

**2026-09-18 — The Vault/repo boundary is stated once (`CLAUDE.md` "What lives where") and checked
(`no-vault-pointers`, WARN).** The check flags any `Claude/Vault` filesystem path on a live line of a hook
or skill (`//` comments and `LINT-OK` lines exempt). The old boundary narrative in `CLAUDE.md` — five
overlapping paragraphs, one of which wrongly told every session the Vault still held a live ledger
`guardrails.mjs` reads — was replaced by one table.
*Why:* it took three manual rounds (09-15, 09-17, 09-18) to close and nothing stopped a fourth.
*Rejected:* a blocking version (new checks ship WARN-only until measured); matching the bare word
"Vault" (prose says it constantly — only the parent-qualified path is a real reference).

---

**2026-09-18 — Ritual markers carry a result, not just a timestamp.** `last-{deploy-check,
feature-audit,mobile-check}-run` and `last-full-file-review` are now `{ranAt, sessionId, summary}` JSON;
both checks read either shape and cap the printed summary at one line / 140 chars (bounds its shape, not
its content — only this project's own skills write these files); `checkEventGateEvidence` also flags a
marker with no summary, or one still holding the skills' unreplaced "REPLACE WITH…" template.
*Why:* a bare timestamp proves a file was touched, not that a run happened — the "reports success while
doing nothing" class, which these markers nearly became on 2026-09-18 (a stamp attempted with no run
behind it; only Claude Code's permission classifier stopped it, nothing in this OS).
*Left, named:* `guardrails.mjs` RULE 2/5's session-ID markers (`review-ran`, `sql-safety-ran`) — a separate,
already-reasoned tradeoff (a diff-hash marker re-blocks after every review-fix edit), not this defect.
`checkFullFileReview` only *shows* a summary and never warns on its absence (a periodic RED gate; a
missing summary would make a legitimately-stamped older marker noisy for a week).

---

**2026-09-18 — `checkConfirmationQueue`: the oldest 8 `fixed-awaiting-jake` rows, every session (WARN).**
That bucket (93 rows) had no per-item surfacing anywhere — only an aggregate count in `backlog.md`.
*Why:* three audits this session independently named the same root cause — bugs, predictions and
closure-candidates are one bottleneck (Jake's confirmation throughput) wearing three names, and the
most-repeated never-built recommendation was a short ordered list to start from. It surfaces; it
closes nothing. *Rejected:* auto-closing, ranking by anything but age, treating the predictions backlog
the same way.

---

**2026-09-18 — Full severing: CoachApp reads and writes nothing in the Vault, no exceptions.**
Jake's explicit, absolute instruction, superseding the 2026-09-17 entry's narrower scope (which kept
`lessons.jsonl`/`beliefs.jsonl`/`voice.md` in the Vault as "genuinely cross-project"). Cut:
- `hello-claude/SKILL.md` Step 2 — dropped reading `Vault/memory/lessons.jsonl` (full file) and
  `Vault/owner/voice.md` (last ~150 lines) at every session start. Also closed the "make a note" →
  Vault routing option in its Jake-communication-patterns section; a CoachApp session now only ever
  writes to `docs/`.
- `os-lint.mjs` `checkMemory` — dropped validating `lessons.jsonl`/`beliefs.jsonl` from the Vault
  (was a structural JSON-parseability check only, no content read). `PREDICTIONS`-based validation
  of `docs/predictions.jsonl` is unaffected.
- `save/SKILL.md` Step 10 — deleted the whole "10b — Vault commit" step. `/save` no longer reads or
  invokes `vault-save.md` (the general cross-project ritual, outside this repo) at all; predictions
  already landed in the repo per 2026-09-17, and lessons/beliefs/voice/ledgers are simply no longer
  CoachApp's concern to write.
- `os-lint.mjs` — deleted `checkGatesFired` outright (function body, `GATES`/`GATE_WINDOW`/`VAULT`/
  `LOG` constants, its commented-out call site, and its self-test spec), rather than leaving it as
  inert dead code the way it had been left since its 2026-09-15 retirement. It was the last piece of
  live code anywhere in `.claude/` that still named a Vault path, even though nothing called it.
- `CLAUDE.md` (×2) and `docs/session-context.md` — corrected two references to the old
  `Vault/projects/CoachApp/` path (a separate Vault-side session archived that folder to
  `Vault/projects/_archive/CoachApp/` the same day, commit `048ac24` on the vault repo, independently
  of this change — caught only because Jake surfaced it) and one claim that the Vault held "the
  fuller live record," false since 2026-09-15 and never corrected until now.
*Why now, beyond yesterday:* yesterday's entry judged `lessons.jsonl`/`voice.md` as legitimately
cross-project and left them in place. Jake's read was that ANY Vault pointer from CoachApp — even a
genuinely shared, non-duplicative one — was still "persistently confusing," and a Vault-side session
independently finding a stale-looking CoachApp duplicate the same day (see above) is direct evidence
the confusion runs in both directions, not just the one this repo was checking.
*Cost, stated plainly:* `lessons.jsonl`'s "past mistakes" job is already covered by this project's
own Claude memory (CoachApp-specific, no fork risk) — not a net loss. `voice.md` has no repo-native
replacement; a session drafting external-facing prose in Jake's voice has lost that context until
something replaces it, and should say so rather than guess.

---

**2026-09-17 — Moved `predictions.jsonl` (CoachApp rows) from the Vault into this repo; left
`lessons.jsonl`/`beliefs.jsonl`/`voice.md` in the Vault.** `docs/predictions.jsonl` now holds the 182
CoachApp-labelled rows (of 196 total; 12 were PTHub, 2 blank) copied verbatim from
`Vault/memory/predictions.jsonl`. `guardrails.mjs` RULE 6, `os-lint.mjs`'s `PREDICTIONS`/`checkMemory`,
`save/SKILL.md` Step 10, and `vault-save.md` (outside this repo, at
`C:\Users\jaken\Claude\.claude\commands\`) were all repointed so future CoachApp predictions are
appended here going forward, not back into the Vault file — otherwise the split would have
reappeared on the next `/vault-save`. RULE 6 also picked up the `inCoachApp` cwd guard RULE 2 already
carries, closing a latent version of RULE 2's own Fourth false refusal before it could bite.
*Why now:* this explicitly **reverses part of the 2026-09-16 entry below**, which rejected moving
these files here because "mixed-project data belongs with cross-project memory." That was true when
written, for PTHub as much as CoachApp — but PTHub ended 2026-09-15, the same day, so the premise
expired before the ink dried. Verified before moving: the file held only two project labels ever
(CoachApp, PTHub) — no third project this would wrongly affect.
*Rejected:* moving `lessons.jsonl`/`beliefs.jsonl`/`voice.md` too. Unlike predictions, these are
written by `vault-save.md`'s general, still-multi-project ritual for *any* project's session-end, not
scoped to one project by a field the way predictions are — copying them into CoachApp's repo would
have gone stale the moment another project's save appended to the real ones. An earlier pass of this
same change did copy `lessons.jsonl` in before this was caught; it was reverted before landing.
*Known issue carried over, not fixed here:* the migrated file still has the 7 duplicate `id` values
`docs/technical-debt.md` already flags (`pth-034`, `pth-035`, `pth-036`, `pth-090`, `pth-109`, ×2
each) — untouched, still needs Jake's own pass, not silently resolved by this move.

---

**2026-09-16 — OS retrospective: retired `checkContinuityBudget`, added measurement-only staleness
for the three event-triggered gate markers.** `os-lint.mjs`'s `checkContinuityBudget` was retired
(call commented out, function and self-test fixture left in place — same treatment `checkGatesFired`
got the day before) because its target, a "## Continuity block" heading, was deliberately superseded
by `docs/decisions.md` at the 2026-09-15 migration and has not existed since; it had been producing a
WARN about nothing real on every run. Separately, a new `checkEventGateEvidence` check now reads the
`state/last-deploy-check-run`/`last-feature-audit-run`/`last-mobile-check-run` markers
`docs/technical-debt.md` already named as unread, correlating each against release tags or
UI-relevant commits since the marker's mtime — WARN-only, never RED.
*Why WARN, not RED:* flipping straight to a blocking gate before counting what it flags on a clean
tree is the exact mistake `checks.sh` rule 2 made on 2026-08-25 (this file's own entry from that
date). This is the "measure first" step `technical-debt.md` said was still needed, not the gate itself
— tightening it to RED is a separate, later decision once real data justifies a threshold.
*Rejected:* building a `--self-test` fixture for the new check in the same pass — a git-based fixture
needs a disposable temp repo with real tags/commits (the shape `guardrails.selftest.mjs` already
uses), which is its own scoped piece of work. Inputs are env-overridable so that fixture can be added
later without a redesign, matching `checkRule0`'s existing precedent of an overridable-but-unfixtured
check.

---

**2026-09-15 — The repo replaces the Vault as CoachApp's system of record.** Jake's explicit
decision, resolving a question this documentation set had deliberately left open through several
earlier passes. `docs/*.md` (including `docs/bugs/`, migrated wholesale) is now authoritative;
`CLAUDE.md`'s "Vault wins on disagreement" clause is retired. The Vault folder itself is retained as
a historical archive (not deleted — that's a separate decision, still Jake's to make), and its full
content is preserved verbatim in `docs/archive/` for traceability.
*Why:* conversational memory and a split Vault/repo system were both proving unreliable as CoachApp
grew — this migration surfaced concrete evidence during the process itself: `STATUS.md` was found
to be 3 releases stale relative to git, and a bug ledger row (GDPR consent capture) was found marked
`deferred` for a month after 5 of its 6 steps had actually shipped.
*Deliberately not done yet, and why:* the hooks/skills that automate tracking (`os-lint`,
`/hello-claude`, `/save`) are not repointed at `docs/` — they live in shared, git-versioned
infrastructure (`~/.claude`) that also serves another project (PTHub), so repointing them is a
separate, more carefully-gated step, not bundled into this one. See the transitional caveat in
`CLAUDE.md`. *[Added 2026-09-18: that caveat no longer exists — the repointing it described was
completed 2026-09-16 and the Vault fully severed 2026-09-18; `CLAUDE.md`'s "What lives where" table
is now the single current statement of the boundary.]*

---

**Archived 2026-09-18:** every entry from 2026-06-20 through 2026-09-05 (2 budget/threshold lessons,
3 gate/review-timing decisions, the deploy-gate change, and the 2 undated foundational stack choices)
moved verbatim to [archive/decisions-pre-2026-09-15.md](archive/decisions-pre-2026-09-15.md) to clear
`docs-budget` — none have been revisited since, 2026-09-15 is the natural cutoff every other archived
doc in this set already uses. Read the archive for that history; nothing below duplicates it.
`docs/archive/decisions-pre-2026-09-15.md` also holds one **superseded** later entry (2026-09-16, "Finished
the skills migration; narrowed the Vault-is-retired doctrine") — its doctrine was reversed 09-17 and overtaken 09-18.

## Requires Validation

- The archived entries' own "Requires Validation" notes (undated foundational rationale, not
  cross-checked against the Vault's `LOG.md`) still apply — see the archive file itself.
