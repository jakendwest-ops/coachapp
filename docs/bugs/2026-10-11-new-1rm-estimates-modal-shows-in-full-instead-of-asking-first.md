---
id: 2026-10-11-new-1rm-estimates-modal-shows-in-full-instead-of-asking-first
status: fixed-awaiting-jake
priority: low
reported: 2026-10-11
status_detail: "FIXED 2026-10-11 on master, unreleased (app-runner v116); awaiting Jake's look on a phone. Red before, green after: tests/onerm-ask-first-2026-10-11.spec.js (a session that points to a new 1RM asks 'view or update?' and the list is not shown by itself; Not now goes on and saves nothing; View opens the full list; leaving the page while the question is open does not route on to Workouts a second time; the 'Workout saved!' toast no longer covers the question (found in a phone-width walkthrough); a session with nothing to offer asks nothing). The specs that expected the list straight after a save now answer View first."
---

# The "New 1RM estimates from today" dialog opens in full after every session

## Jake's report (verbatim, 2026-10-11)

> Has this ever actually been used? I don't think it should display in full, I think it should be asked to the user 'do you wish to view/update your new predicted 1rm's' or something like that

The dialog (`#modal-post-session-1rm`) opened after saving a one-set test session. It read "New 1RM estimates from today", with one row: "Barbell Military Press, 1kg x 5 reps. That puts your estimated 1RM at about 1.2 kg", buttons "Save as my 1RM" and "Skip" per row, and a "Done" button.

## Has it ever been used? (read-only, his account, 2026-10-11)

On his account, no. His five saved 1RMs are all whole numbers (200, 75, 150, 160, 110) with dates that match typing them into Personal Bests; the dialog would have saved the raw estimate (for example 116.666...). The 1 kg x 5 test fired it because his Military Press 1RM is saved as "Military Press" with no exercise link, while his workouts use "Barbell Military Press": the app found no 1RM for that lift, and any estimate beats "none". (Re-saving that 1RM against "Barbell Military Press" on Personal Bests links it; that is a data fix, not code.)

## What changed

After saving a session that points to a new estimated 1RM, the runner asks one short question: "Your session points to a new estimated 1RM. Do you want to view or update it now?" with "View" and "Not now". "View" opens the full list exactly as before; "Not now" (or closing the question) goes on to the Workouts page. The question saves nothing. A session with no new estimate asks nothing.

Not changed: which sessions produce an estimate (sets of 1 to 10 reps that beat the stored 1RM, or any estimate when none is matched); the name-matching gap above.

**Closes when** Jake confirms on his phone that the question appears after a session and the full list only on "View".
