---
id: 2026-09-02-guardrails-selftest-is-not-hermetic-and-cries-wolf
status: closed
priority: high
reported: 2026-09-02
closed_by: hooks/guardrails.selftest.mjs (GUARDRAILS_REPO hermeticity fix, 9f79101)
status_detail: "CLOSED 2026-09-04 against the row own three-condition bar, not a clean-tree run: self-test exit 0 with a clean tree, with a STAGED coach_id file, and with a stray zz-* file present; os-lint hook-selftests GREEN on a dirty tree. The fix points the self-test at a throwaway git repo via GUARDRAILS_REPO so the real working tree cannot influence it."
---

# `guardrails.selftest.mjs` is not hermetic — it is RED exactly while you are doing the work it guards

## The proof, both directions

    clean tree                                  -> all cases behaved
    git add <file containing "coach_id">        -> 17 case(s) misbehaved   (17 FAIL lines)
    git reset + rm                              -> all cases behaved

The staged file was two lines and touched nothing real. **Every one of the 17 failures is a
`want=ALLOW … (got DENY)`** — cases like *"review ran this session"*, *"no ownership content"*,
*"nothing staged"*, *"coach_id only in CONTEXT lines"*, *"ownership content only on a REMOVED line"*.
Those cases assert the hook ALLOWS something; with real ownership content in the index, the hook
correctly denies, and the case reports a failure that is an artefact of ambient state.

## Why this matters more than a noisy check

**The self-test's verdict is inverted with respect to when it is consulted.** It is green when nothing
is staged — i.e. when its answer is worthless — and red while an ownership change is staged, which is
precisely the moment someone would look at it to decide whether the gate can be trusted.

It produced a live false alarm today: `os-lint` reported `hook-selftests` RED at session start (the tree
was dirty), and I reported to Jake that *"the ownership guard's own self-test is failing 17 cases,
nearly all should-have-allowed — a guard drifting toward refusing legitimate commits, this project's
most-shipped bug class, now in the guard itself."* **That was wrong.** The guard is sound; it let a
legitimate ownership commit (`c9dade7`) through on the same tree minutes later. The self-test was
measuring the repo instead of its fixtures.

This is the inverse of [[feedback-reports-success-doing-nothing]] and just as costly: a check that
reports a problem that is not there trains its owner to ignore it — and the ledger already records
alarm fatigue burying real rows ([[feedback-two-fields-one-fact]]).

## The fix

The ALLOW cases must run against a **fixture index**, not the developer's. Options, in preference order:

1. **Run each case in a throwaway git repo** (`git init` in a temp dir, stage the fixture, invoke the
   hook with `cwd` there). The hook already distinguishes repos — one of its own passing cases is
   *"a commit in ANOTHER repo is not judged by the CoachApp tree"* — so the machinery exists.
2. Pass the staged diff to the hook as data rather than having it shell out to `git diff --cached`.
   Bigger change; makes the hook testable by construction.

**Whichever is chosen, prove it the way this row was proven:** stage a `coach_id` file, run the
self-test, and require *"all cases behaved"*. That is the red-before evidence, and it is cheap.

## Closes when

`guardrails.selftest.mjs` reports "all cases behaved" **with an ownership-content file staged** — the
exact condition that yields 17 failures today — and `os-lint`'s `hook-selftests` check is GREEN on a
dirty tree. A green run on a clean tree is NOT evidence and must not be accepted as closure.

---

## 🔴 CORRECTION (same day) — the mechanism above is WRONG, and rule 2 is innocent

The row as filed said *"stage ONE file containing the string coach_id -> 17 case(s) misbehaved"* and
blamed rule 2's ownership check. **Both halves are wrong, and the error was my experiment, not the
hook.** I named the probe file `zz-tmp-ownership.js` — and `zz-*` trips **rule 1c** (throwaway probe
files), which denies *every* commit. So I measured rule 1c and attributed it to rule 2.

Isolating the variable properly:

| staged | failures |
|---|---|
| normal filename + `coach_id` content | **9** |
| `zz-*` filename, **no** ownership content | **17** |
| clean tree | **0** |

**Rule 2 is hermetic.** With ownership content staged under a normal filename, all **11** of rule 2's
own cases PASS — its `GUARDRAILS_FAKE_STAGED` injection works exactly as designed
(`guardrails.mjs:231`).

## The real mechanism: first-DENY short-circuit, inherited by later rules

The hook evaluates its rules in order and returns on the first DENY. The self-test's cases neutralise
the rule *they* target, but **not the rules that run before it**. So:

- Real ownership content in the index → **rule 2** denies → the **9** ALLOW cases of rules **5**
  (staged `.sql`) and **6** (predictions backlog) never reach their own logic and report DENY.
- A stray `zz-*` file → **rule 1c** denies even earlier → **17** fail, i.e. rules 2, 2c, 3, 5 and 6.

Neither is the hook misbehaving. Both are the self-test failing to isolate: a case for rule 5 must
assert "given nothing else would deny, does rule 5 allow this?" and it currently cannot.

## The fix, restated

Every case must neutralise **all earlier rules**, not just its own — pass `GUARDRAILS_FAKE_STAGED: ''`
on the rule 5 and rule 6 invocations, and whatever override rule 1c honours. The `git init` throwaway
repo (`guardrails.selftest.mjs:86-89`) plus `GUARDRAILS_REPO` already exist and are the cleaner base
if per-rule overrides prove fiddly.

## Closes when

The self-test reports "all cases behaved" under **all three** conditions: clean tree, a staged normal
file containing `coach_id`, **and** a stray `zz-*` file present. A green run on a clean tree alone is
not evidence — that is what hid this.

## Lesson

Second time today a perturbation of mine proved the wrong thing (the first: asserting on `Exercises`,
a word that only exists in a different modal). **A neuter that changes two variables at once measures
neither** — [[feedback-name-the-spec-before-neutering]]. I published a mechanism and a number to Jake
before isolating, and both were wrong.

---

## CLOSED 2026-09-04 — verified against this row own bar, not a convenient one

The row was explicit that **a green run on a clean tree is NOT evidence**. All three conditions were
driven in the REAL working tree and the self-test passed each time:

| condition | result |
|---|---|
| clean tree | exit 0 |
| a **staged** file containing `coach_id` — the exact state that produced failures | exit 0 |
| a stray `zz-*` file present on disk | exit 0 |
| `os-lint` `hook-selftests` on a **dirty** tree | GREEN (not flagged) |

**The fix:** `guardrails.selftest.mjs` now creates a throwaway git repo (`mkdtemp` + `git init`) and
drives every case against it via `GUARDRAILS_REPO`, so the developer working tree can no longer
influence the result. That is what made it cry wolf precisely while real ownership work was staged —
the condition under which its verdict mattered most.

Probe files were deleted and the deletion confirmed on the **filesystem** with `ls`, never via
`git status`, which is blind to them by design.
