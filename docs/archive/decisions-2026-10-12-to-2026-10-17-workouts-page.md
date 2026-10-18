# Decisions, 2026-10-12 to 2026-10-17: the Personal account's Workouts page (archived verbatim)

Moved here from `docs/decisions.md` on 2026-10-18 to keep the live file inside its size budget. Nothing was edited. Point-in-time record; the live behaviour is in the code and the bug ledger.

---

**2026-10-17 — The Personal account's Workouts page: the plan first, "Create a workout" with two choices, a search, Edit in place, and a plan lock.**
Jake, from a prototype and a clickable plan ("Approved - build"). *Create a workout:* Choose a template (My workouts saves a copy; Past sessions saves a workout of that session's exercises) or Create new (a name, then the existing editor);
both SAVE at once. "Train now" stays as a small link for a blank live session; "Start from a past session" is gone. *The lock:* a workout in the plan the account is on NOW has no Edit (it names the plan and
offers "Open in Training plans"; Make a copy still works); a plan that has run its course or been removed unlocks its workouts. *Not chosen:* ready-made starter workouts as templates; locking by workout name.
*Left for Phase 2:* the PT page (a Client filter, search and paging on the server), the Library page, and one shared code path for both roles. Known limits are in the ledger row.

**2026-10-12 — "Programs" are now "Training plans" everywhere they are read; a solo account is on one plan at a time; the Workouts page is for workouts made and used.**
Jake, from a prototype and clickable questions. *Words:* every visible "program/programme" became "training plan" (nav, headings, buttons, dialogs, toasts, coach screens); code names, tables,
ids and routes keep "program". *One plan at a time (solo):* adding a plan takes the other off (assign first, remove second; a failed removal warns and leaves both); "Remove from my plan" keeps every
logged session, drops the upcoming ones, and the plan stays in Training plans. A coach gets the same wording for a client. *Workouts page (solo only):* start buttons, "Up next" while a plan is on,
the plan folded away, "Your workouts" (made and used; a plan session joins once done), Recent sessions. "Start an empty workout" starts blank; "Save as a workout" on the finish screen is the only way
a session becomes reusable, and only when tapped. Not chosen: saving every session automatically; two plans at once. A coached client's page is unchanged.
