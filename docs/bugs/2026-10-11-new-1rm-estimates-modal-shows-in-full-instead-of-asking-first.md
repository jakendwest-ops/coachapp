---
id: 2026-10-11-new-1rm-estimates-modal-shows-in-full-instead-of-asking-first
status: open
priority: low
reported: 2026-10-11
status_detail: "OPEN. Reported by Jake 2026-10-11, not yet investigated. Contains a question (has it ever been used?) to answer from data before any change."
---

# The "New 1RM estimates from today" dialog opens in full after every session

## Jake's report (verbatim, 2026-10-11)

> Has this ever actually been used? I don't think it should display in full, I think it should be asked to the user 'do you wish to view/update your new predicted 1rm's' or something like that

The dialog (`#modal-post-session-1rm`) opened after saving a one-set test session. It read "New 1RM estimates from today", with one row: "Barbell Military Press, 1kg x 5 reps. That puts your estimated 1RM at about 1.2 kg", buttons "Save as my 1RM" and "Skip" per row, and a "Done" button.

## What would close it

**Closes when** Jake's answer on the wanted behaviour is built and he confirms it, once the usage question is answered: the dialog is replaced by a short question first ("do you want to view or update your new estimated 1RMs?"), and only opens in full if the answer is yes.
