---
id: 2026-08-29-unescaped-db-strings-reach-innerhtml-at-3-sites
status: closed
priority: medium
reported: 2026-08-29
closed_by: "scripts/check-escaping.mjs one-hop rule — RED on all 6 sites before any fix, GREEN after; planted line-leading const + raw ${} goes RED, removed goes GREEN. Fixed c1842f0."
status_detail: "CLOSED c1842f0. The class was 8 sites, not the 3 filed — fixing the CHECKER first found 6, plus 2 I introduced the same day. nextEx.name is escaped at app-runner.js:803 and :814 but raw at :607/:613 and :1685/:1703 - four renders of one field, two safe, two not. programName is raw at app-workouts.js:3071 while its sibling six lines below is escaped. Self-XSS today (names are coach-authored) but the 7th instance of a sink class CRITICAL.md tracks (its timeline already counts to 6, at 2026-08-12)."
---

# Unescaped DB strings reach `innerHTML` at 3 sites, each beside an escaped sibling

Found by the weekly full-file review (Agent A). **Verified by grepping each cited line for
`escapeHtml`** — the asymmetry is exact:

| Line | Field | `escapeHtml`? |
|---|---|---|
| `app-runner.js:607` -> `:613` | `nextEx.name` (inline rest bar) | **no** |
| `app-runner.js:1685` -> `:1703` | `nextEx.name` (floating rest overlay) | **no** |
| `app-runner.js:803` | `nextEx.name` | yes |
| `app-runner.js:814` | `_runner.exercises[...].name` | yes |
| `app-workouts.js:3071` | `programs.name` | **no** |
| `app-workouts.js:3077` | `workout_templates.name` (6 lines below, same literal) | yes |

**Four renders of one field; two escaped, two not.** This is drift, not an unknown gap — the correct call
already exists 200 lines away in the same file.

**Where it fires:** both `nextEx.name` sinks render during **rest**, which is unavoidable in a normal
session. An exercise named `<img src=x onerror=...>` sitting after the current one executes in the
session of whoever drives the runner — including a **coach**, who reaches it via "▶ Start workout" on the
client tab, with the Supabase token in localStorage.

**Honest severity: self-XSS today.** `exercise_name` and `programs.name` are coach-authored; a client
cannot write them (`tests/template-exercise-write-rls-2026-08-10.spec.js:138` proves a client cannot
write their own plan clone's exercises). So there is no cross-tenant path today. It is filed because it is
the **7th instance** of the sink class `CRITICAL.md` tracks, and because a fix is one call per site.

**Fix:** `escapeHtml(nextEx.name)` at `:607` and `:1685`; `escapeHtml(programName)` at `:3071`.

**Closes when:** all three sites are escaped AND `scripts/check-escaping.mjs` is shown to catch this
syntactic form — see [[feedback_reports_success_doing_nothing]], whose merged section records that this
same checker ran clean over nine live sites because only one syntax shape was ever considered. Plant an
instance in the exact form used here (`'Next: ' + ex.name` assigned to a variable, then interpolated) and
confirm the checker goes RED before trusting a clean run.

---

## CLOSED 2026-08-29 (`c1842f0`) — and the class was **8 sites, not 3**

**This row's title undercounts its own bug.** It was filed from the review's three findings; fixing the
CHECKER first — which this row demanded — found **six**, plus **two I had introduced myself an hour
earlier** in the cardio edit sheet (`escapeAttr` in a plain attribute, caught by the checker's existing
rule). Title left as filed so the undercount stays visible.

| Site | Field |
|---|---|
| `app-dashboard.js:118` | `currentProfile.full_name` into an `<h1>` |
| `app-programs.js:169` | `cpwMap[…].name` (session summary) |
| `app-programs.js:183` | `cpw.name` (session name) |
| `app-runner.js:639` | `nextEx.name` — renders during REST |
| `app-runner.js:1729` | `nextEx.name` — renders during REST |
| `app-workouts.js:3079` | `programs.name` |
| `app-runner.js:1876` | **mine, same day** — `escapeAttr` in a plain `value=""` |
| `app-runner.js:1880` | **mine, same day** — same |

**Three of the six the review never saw** (`app-dashboard`, and both `app-programs` sites). The agents
read three files; the checker reads all nine.

## The closing condition, met exactly as written

It required: *"all sites escaped AND `check-escaping.mjs` shown to catch this syntactic form … Plant an
instance in the exact form used here and confirm the checker goes RED before trusting a clean run."*

- Checker RED on all 6 before any site was touched.
- All 8 escaped; checker now exits 0.
- Planted a line-leading `const` + raw `${}` → **RED**; removed → **GREEN**.

## 🔴 The plant nearly produced a false conclusion

My **first** plant put the `const` inside an IIFE, mid-line. The checker stayed green and my first
reading was *"the rule is dead."* It was the **plant** that was wrong — the rule requires a line-leading
assignment. Planting the targeted shape went red immediately.

That is [[feedback_name_the_spec_before_neutering]] landing for the second time in one session: **a
neuter that does not fail is ambiguous, not proof.** The limitation is now documented inside the checker
so the next plant is the right shape.

## Two checker defects found by measuring, not reading

1. **CRLF.** Both loops split on `\n`, leaving a trailing `\r` that broke the assignment match — the new
   rule found **zero** sites in `app-programs.js` that it finds now. **The original loop had the same
   latent weakness** and was fixed too, so the pre-existing rules may have been under-reporting.
2. **`NOT_A_SINK` applied to a compound RHS.** `const nextLabel = … nextEx.name … : 'Next: Set ' +
   (ex.loggedSets.length + 1)` holds a real sink AND a `.length`; excluding the whole line dropped it.

## The rule was measured before it was given teeth

v1 name-keyed file-wide → 6 candidates, **2 false**. v2 + function scoping → 1 candidate, and it
**silently dropped a real site**. v3 keyed by function+name → **6 candidates, all 6 real, 0 false**.
[[feedback_measure_before_giving_a_gate_teeth]].
