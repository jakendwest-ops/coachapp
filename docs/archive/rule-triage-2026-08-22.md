# Rule triage — trimming to a format that can fire (2026-08-22)

## The test a rule must pass

A rule **fires** only if it has all three of:

1. **A trigger** — a specific observable moment (a tool call, a commit, a claim in text).
   Not "when writing security code". That is a topic, not a moment.
2. **A list** — it produces an enumeration, not a judgement. "Grep every sibling and COUNT them"
   produces a list. "Be careful with siblings" does not.
3. **A failure mode** — it can be *shown* to refuse. If you cannot demonstrate it saying no, it is
   indistinguishable from a rule that isn't there.

Score each rule 0–3.

- **3 → MECHANISE.** It becomes a hook or a lint check. Prose is strictly worse than the check.
- **2 (trigger + list, automation impractical) → ENUMERATE.** Keep it, but rewrite it as an
  imperative that yields a list at the trigger moment. Delete the surrounding narrative.
- **0–1 → DELETE or MERGE.** It is a story about something that happened. Its cost is attention;
  its yield after the first reading is close to zero.

Why this test and not "is it important": every rule in the corpus is important. Importance is what
put 316 imperatives on the page. Firing is the scarce property.

## Evidence this is the right cut

All six of 2026-08-22's error classes **already had a rule**. Not one was a gap. The rule set was
never the binding constraint, so trimming it costs nothing in coverage and buys back attention.

Where an enumeration actually ran that day, the work was right first time — 45 write sites across
23 functions, correct, no review finding against it, because standing behaviour 2 says COUNT. Every
failure was somewhere a space was reasoned about instead of listed: destructive writes above a
guard, assertions inside a test, imports after an aborted script, hook timing against a chained
command.

## Bucket 1 — MECHANISE

| Rule | Status |
|---|---|
| `borrowed_count_is_not_a_swept_class` | **DONE** — `claim-check.mjs` refuses an unverified count |
| `no_git_stash_shared_tree` | **DONE** — `guardrails.mjs` 1b refuses mutating stash ops |
| `subagent_throwaway_file_cleanup` | **DONE** — `guardrails.mjs` 1c refuses a commit with probe files |
| `review_own_security_fixes` | **DONE** — `guardrails.mjs` 2 refuses unreviewed ownership commits |
| `concurrent_test_contamination` | TODO — needs live-run detection; fragile, worth one attempt |
| `falsy_zero_values` | TODO — `checks.sh` lint for truthy tests on known-numeric fields |
| `test_fixture_isolation` | TODO — lint tests for "pick whatever is first" fixture patterns |
| `storage_bucket_behavioural` | TODO — a periodic cross-tenant download probe, not a policy read |
| `kanban_board_concurrent_write` | TODO — verify-after-write instead of trusting the write |
| `solo_null_coach_id` | PARTIAL — `checks.sh` rule 2 covers some; tighten to require `.or(` |
| `two_fields_one_fact` | PARTIAL — `os-lint` ledger-drift is one instance of a general class |
| `paste_sql_inline` | **NOT MECHANISABLE** — an output-format preference. Keep as prose, it is cheap. |

Each DONE line retires a prose rule. That is the trade: the memory file becomes a pointer to the
check, and stops consuming attention every session.

## Bucket 2 — ENUMERATE (keep the imperative, delete the story)

These cannot be automated but do produce a list. Rewrite each to a single line naming *what to
enumerate*, and drop the incident narrative to one clause.

- `fix_the_class_not_the_instance` → already standing behaviour 2. Canonical example of the format.
- `rls_embed_chains` → *list every table in the embed chain, not just the outer one.*
- `removing_container_drops_affordances` → *list every affordance the container hosts before removing it.*
- `embed_select_column_allowlist` → *list every embed select that must gain the new column.*
- `guard_risk_is_refusing_the_legitimate_user` → *list every legitimate caller before shipping a guard.*
- `edge_case_testing` → *list the non-golden paths.*
- `unit_preference_is_a_test_dimension` → *list the unit-dependent paths.*
- `bundled_rows_hide_half_a_bug` → *list each claim in the row separately, and verify each.*
- `name_the_spec_before_neutering` → *name the spec covering that exact line before neutering.*

## Bucket 3 — MERGE (five families, ~11 files → 5)

- **"Prove it can fail"** ← `reports_success_doing_nothing` + `green_checker_is_not_proof` +
  `decorative_tests`. One rule: a check that has never been observed refusing is dead.
- **"Name the spec, then neuter"** ← `name_the_spec_before_neutering` + `verify_test_fix_empirically`.
- **"Enumerate, don't estimate"** ← `fix_the_class_not_the_instance` + `borrowed_count_is_not_a_swept_class`.
- **"Evidence before change"** ← `no_speculative_fixes` + `diagnose_before_prescribing`.
- **"Verify a subagent's real state"** ← `subagent_verify_actual_state` + `nested_subagent_background_tasks`.

## Bucket 4 — DELETE (narrative, no forward action)

- `cosmetic_changes_tentative` — a preference, now internalised and cheap to re-learn.
- `gitignore_verify_with_new_file` — a single instance of "verify with a fresh case", which the
  merged "prove it can fail" rule already covers.
- `privileged_ops_need_inapp_ui` — a design decision that is now simply the norm.
- `skill_pressure_testing` — a methodology. It belongs in a skill, not in per-turn memory.

**Deletions need Jake's approval — these are his memory files, and deleting the wrong one is not
recoverable from attention, only from git.**

## Projected result

41 feedback memories → roughly 20. The 316 imperatives fall mostly through Bucket 3 and 4, since
the narrative paragraphs carry most of the never/always/must density, not the imperatives themselves.

## The measurement that decides whether this worked

Not rule count. **Errors per session in classes that already had a rule.** On 2026-08-22 that was
six out of six. If trimming works, that ratio falls; if it does not, the diagnosis was wrong and the
rules were never the mechanism either way.
