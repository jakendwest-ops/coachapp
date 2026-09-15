---
id: 2026-09-05-library-search-term-persists-across-a-view-switch
status: open
priority: low
reported: 2026-09-05
status_detail: "Found by the pinned multi-agent review of the Library work, 2026-09-05. Cosmetic and self-correcting; Jake was asked and said it does not need fixing now. Recorded so it is not later re-discovered as a mystery."
---

# Library search term carries over between the coach and Personal views

`js/app-workouts.js` — `_wtSearchTerm` is a single module-level `let`, shared by every render of the
Library page. That page is rendered for both the coach view and the Personal (solo) view of the same
master account.

So: search "chest" in coach Library, switch to Personal, open Library — the box still shows "chest",
and the (correctly scoped, entirely different) personal template list arrives filtered by it.

## Why it is minor

- **Nothing is hidden.** The input renders showing the term, so the filtered state is always visible
  and self-explaining. This is not silent state.
- **No data crosses.** The template list is scoped per role by the query; only the filter string
  carries over. `switchView()` navigates to a dashboard first, so the stale term is never applied to a
  list belonging to the previous role.
- Clearing the box restores everything.

## Fix when picked up

Reset `_wtSearchTerm` in `switchView()` (`js/app-core.js`), or scope the variable per role. Prefer the
former — one line, at the place the role actually changes.

## Related

- Same review found `2026-09-05-coach-library-last-used-under-reports-because-clients-train-clones`
