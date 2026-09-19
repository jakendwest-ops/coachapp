---
name: feature-audit
description: Run after every feature build, before declaring it done, to self-verify the way Jake otherwise would. Audits UI/workflow consistency, affordances & permissions (delete/edit rights, save-vs-plain-text controls), then walks the feature through a PT's and a real gym user's eyes. Ends with proof, not claims. Invoke after any modal, page, function, or bug fix — never wait to be asked.
---

# Feature audit

The point of this skill: **Jake should not have to be my QA.** He named it directly — "build and improve features without me having to re-run tests and double check work… check for inconsistencies with workflows and UI… should a user be able to delete or edit here… should this modal have a save/edit button rather than being just a plain text field… build this through the eyes of a PT and a user who will be using the runner in a real setting."

So every feature ends here, with me having already done the checking. Run this **after** the build, **before** saying "done", and **before** handing anything to Jake to push. The push boundary is fixed (2026-07-03): I verify and show proof; Jake still owns the push to live.

This runs alongside — not instead of — the remaining gates: `mobile-check`, the blast-radius sweep (which absorbed the old separate regression sweep), and `multi-agent-review` before the push. This one adds the affordance/permission audit and the two persona lenses, and it enforces proof-over-claims.

**It also SUBSUMES the checks that used to be separate standing behaviours**, deleted 2026-07-13 as part of the OS rebuild: UI-consistency, verify-before-reporting-done, add-smoke-tests-in-the-same-commit, the Supabase API-log check, and the RLS role audit (all four verbs, separately). They are gates *inside this skill* now, not seventeen things to remember.

---

## Step 0 — State acceptance criteria (do this BEFORE building, recall it here)

Before building, write down what "working" means for this feature in 2–5 concrete, checkable bullets (e.g. "coach can rename a phase and it persists on reload", "delete shows a confirm and removes only that row"). At audit time, score the built feature against each one explicitly: met / not met / partial. This is tip 48 (give myself a way to verify) + output-scoring (tip 28) from [[meta-building-with-claude]]. If criteria weren't written up front, write them now from the feature's intent and score against them — but next time, up front.

---

## Step 1 — Affordance & permission audit

For **every** interactive element on the new/changed surface, answer explicitly. Don't assume — look at the code and the rendered UI.

**a) Should this action exist here at all?**
- Can the user create / read / update / delete here? For each verb the UI exposes: *should* this role be able to do it on this data? A client editing a coach-owned template, a solo user deleting a shared master — flag anything that shouldn't be possible.
- Is anything missing that the user will expect? (An edit affordance on a record they own; a delete on their own row.)

**b) Is the right control present for the intent?**
- A field meant to be edited must have a **save/confirm** path — not a plain-text field that looks editable but goes nowhere, and not an editable field that saves silently with no feedback.
- A read-only value must not look interactive (no cursor:pointer, no input styling) unless it is.
- Destructive actions (delete, remove, overwrite, shift-all-dates) must have a **guard**: a confirm step, a typed confirmation for high-stakes, or an undo. Never a bare one-tap destroy.
- Modals: does it need a save button + a cancel/close, or is it display-only? Does cancel actually discard, and save actually persist?

**c) Does the backend actually permit what the UI offers? (RLS)**
- For each `db.from('<table>')` the feature calls, list the operation used (SELECT/INSERT/UPDATE/DELETE) and confirm a covering RLS policy exists for **that operation and that role** — check all four separately, a working INSERT does not imply UPDATE/DELETE. Query `pg_policies` if unsure. (See [[feedback-new-role-audit]], sql-safety.)
- Multi-tenant scoping present (coach_id / client_id) on every read? (Step 4 of the hello-claude review.)
- Solo-mode fallback present anywhere a fetch is gated on `isClientPlan` or a coach path? (Solo silently returns empty otherwise.)

---

## Step 2 — Workflow & UI consistency

- Grep the codebase for the equivalent existing render function / flow **before** trusting the new one. Lists → `list`/`list-row`; cards → `client-grid`/`client-card`; modals → `modal-overlay`/`modal-box`; empty states → `empty-state`. Match classes exactly. (See [[feedback-ui-consistency]].)
- Does the new surface behave like its siblings — same nav pattern, same back-button context (`backFn`), same save-owns-no-navigation rule, same toast on success/failure?
- Does the same data shown in two places agree? (A rename here shows there; a delete here removes it from the other view.)
- Did this change alter a shared render function (renderCalendar/renderProgress/renderWorkouts/etc.)? If so, all three roles — coach, client, solo — must be walked, not just the one being built. (Blast-radius sweep.)

---

## Step 3 — The PT lens

Walk the feature as a coach who has 10+ clients and does this every day.

- **Scale:** does this get tedious or error-prone at 10, 20 clients? Is there needless repetition the UI should absorb (batch, default, template)?
- **Friction at point of use:** is the information the coach needs surfaced *where and when* they need it, or do they have to go find it? (Standing product principle.)
- **Trust:** would a real PT understand what just happened, or is state changing invisibly? Is destructive or propagating action (edit-all-sessions, shift start date) clearly signposted?
- **No dead ends:** after every action, is there an obvious next step — not a stranded screen?

## Step 4 — The gym-user lens (the runner especially)

Walk the runner / client surface as someone **mid-workout**: tired, sweaty, one-handed, phone in a chalky hand, resting 60 seconds between sets, possibly on gym wifi.

- **Tap targets** ≥ 44×44px on every control they hit mid-set (the ✓, +set, swap, rest skip). Measure, don't eyeball.
- **Destructive-adjacent-to-primary spacing:** any delete/remove control sitting next to the primary tap-every-set action (complete/✓) needs deliberate visual+spatial separation, not just default flex gap. Found 2026-07-05: the runner's delete-set button sat 6px from the complete-set tick — an accidental-tap risk this lens is specifically meant to catch.
- **Tap count:** how many taps to log a set and move on? Every extra tap is friction under fatigue. Pre-fill wherever last-session data exists.
- **Glanceability:** can they see the next thing to do in one glance without reading? Is the current set/target obvious?
- **Interruptibility:** if they lock the phone / take a call mid-set, is state preserved? Does the rest timer / voice cue behave?
- **One-handed reach:** are primary actions in thumb range at the bottom, not stranded at the top?
- **Failure under real conditions:** empty/null data, no last-session, a superset pair, a bodyweight exercise — walk the unhappy paths, don't assume the happy one. Specifically: for any render that groups/tallies a collection and branches on count (a `.length`-based `if`), check the **zero** case explicitly, not just "one" vs "many" — found 2026-07-10 as a real live crash where a phase with zero sessions (a normal, valid state) broke an accordion that only ever had "1 week" vs "many weeks" tested. If this build made an existing branch newly common (not just added new code), that branch's edge cases are in scope here too, even if its own code wasn't touched. See [[feedback-edge-case-testing]].

---

## Step 5 — Verify, and report PROOF (not claims)

Do the verification myself — never hand Jake unverified work.

1. Run it in the preview (server already up per hello-claude; resize 480×844). Reproduce the actual flow.
2. Run the relevant Playwright test(s); add smoke tests for the new surface in the same commit (modal open/cancel/validate; page sections render; button visible/clickable). (See [[feedback-smoke-tests]].)
3. Check the Supabase API logs for PGRST errors after any test flow (invisible in the JS console). (See [[reference-supabase-logs]].)
4. Report back with **evidence**: a screenshot for visual changes, test output (X/total) for logic, a network/API check for data changes, the acceptance-criteria scorecard from Step 0. If something can't be verified, say "UNVERIFIED — reason" explicitly and bank it. (See [[feedback-verify]].)

---

## Output format

End with a tight report:

- **Acceptance criteria:** each one met / partial / not met.
- **Affordance & permission findings:** anything that shouldn't be editable/deletable, any missing control, any RLS gap. Fixed inline / flagged.
- **Consistency findings:** divergences from existing patterns. Fixed / flagged.
- **PT lens / gym-user lens:** friction or gaps found, ranked by how much they'd hurt a real user.
- **Proof:** screenshot / test result / API check.
- **Verdict:** ready for Jake to push / needs his decision on X / not ready because Y.

Be honest and direct — a real client hitting the bug in a gym is worse than flagging it now. Flag everything, no matter how small.

## Last step — record what this run actually found

`gates-fired` (the check that used to prove this gate fires by grepping the Vault's `LOG.md`) was
retired 2026-09-15 when `LOG.md` was frozen, with no replacement built. A bare timestamp only proves
a file got touched, not that a real run happened behind it — the same "reports success while doing
nothing" shape this project keeps finding elsewhere, and one this exact marker almost fell into on
2026-09-18 (a stamp was attempted with no run behind it; a permission check caught it, not this OS).
So the marker carries a real one-line result, not just a touch. **Replace the summary text below with
what this run genuinely found — "clean, no issues" is only honest if that's true.**

```bash
node -e "
const fs = require('fs');
const sessionId = fs.readFileSync('C:/Users/jaken/.claude/state/session-current', 'utf8').trim();
fs.writeFileSync('C:/Users/jaken/.claude/state/last-feature-audit-run', JSON.stringify({
  ranAt: new Date().toISOString(),
  sessionId,
  summary: 'REPLACE WITH WHAT THIS RUN ACTUALLY FOUND — e.g. \"clean, no issues\" or \"2 issues found, 1 fixed\"'
}))
"
```

Deliberately just the marker, not a blocking gate — this runs "after every feature build," which
is event-triggered, not periodic, so a naive "N days since last run" RED would misfire on any stretch
spent on bug fixes or non-feature work rather than new builds. `os-lint`'s `checkEventGateEvidence`
(added 2026-09-16) is the measure-first step this needed before being trusted — it correlates this
marker against UI-relevant commits, WARN-only. Giving it RED-level teeth is a separate, later call.
