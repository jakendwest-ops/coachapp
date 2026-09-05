# <VERSION> — <ONE LINE SUMMARY>

**Cut:** <YYYY-MM-DD>
**Commits:** `<FIRST>..<LAST>`
**Previous release:** <PREVIOUS VERSION, or "none — first release">

---

## Scope

<WHAT THIS RELEASE SET OUT TO DO — the sprint's intent, in a sentence or two. If it grew beyond the
original scope, say so and say why.>

**In:**
- <ITEM>

**Deliberately out:**
- <ITEM AND WHY>

---

## What shipped

<PLAIN ENGLISH FIRST — what a user will notice, and what problem it solves. Then the technical detail.
Someone reading this in six months should be able to tell whether a bug they are chasing was
introduced here.>

---

## Database changes

<ANY MIGRATION RUN AGAINST PRODUCTION, WITH THE SCRIPT NAME. State whether it was applied BEFORE or
AFTER the code, since that ordering is what breaks rollbacks. Write "none" if none.>

---

## Verification

- **Full suite:** <N passed / N failed / N skipped, and the run time>
- **Flaky:** <ANY TEST THAT FAILED AND PASSED ON RETRY — name it, do not round it to "green">
- **checks.sh:** <RESULT>
- **Review:** <WHICH REVIEW RAN, AND WHAT IT FOUND — "clean" only if it genuinely found nothing>

---

## Known issues carried into this release

<BUGS THAT EXIST AND ARE SHIPPING ANYWAY, each with its ledger id and one line on why it is acceptable
to carry. This section is the honest one — an empty list here should be rare and suspicious.>

---

## Rollback

<HOW TO UNDO THIS RELEASE. Usually: tag the previous version's commit and push it, or revert the
range. Note anything that CANNOT be rolled back — a database migration, data written in a new shape.>
