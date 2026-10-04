---
id: 2026-10-04-view-as-client-only-works-on-the-dashboard
status: open
priority: low
reported: 2026-10-04
status_detail: "FOUND BY THE PRE-PUSH REVIEW 2026-10-04 (solo-mode angle). 'View as client' (sudoAsClient, owner only) sets role 'client' and window._sudoClientId, and only the dashboard reads that id: _getCurrentClientId() has no view-as branch, so Progress, Workouts and Calendar resolve to the OWNER'S OWN coached record. Before the 2026-10-04 dashboard rework this mattered less because the dashboard carried its own sudo-aware weight / goal / record forms; the rework replaced them with cards that open those pages, which would have shown - and let the owner log into - the wrong person's record with no banner on the page. FIXED FOR THE RELEASE: while view-as is on, the dashboard sets a dash-sudo class and the cards and buttons that lead to those pages are inert (CSS: pointer-events none, links hidden); Start workout and View session still act on the client (they take the client id explicitly). NOT DONE: making view-as work on every page, which needs a banner on every page and a decision about what an owner may log for a client; and sign-out does not clear window._sudoClientId / _sudoClientName (the next normal client login on the same tab would think view-as is on; the old dashboard did the same). Owner-only, no customer impact."
closing_conditions: "Either view-as works on Progress, Workouts and Calendar with a visible 'viewing as' banner on each, or Jake decides the dashboard-only preview is enough and this closes; and sign-out clears the view-as globals."
---

# "View as client" only works on the dashboard

**Closes when:** see `closing_conditions`.
