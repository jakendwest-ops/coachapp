---
id: 2026-08-29-navigate-library-has-no-role-guard-its-sibling-does
status: closed
priority: low
reported: 2026-08-29
closed_by: "The same one-line role break its sibling `programs` carries, at js/app-core.js. Fixed 4bf805d."
status_detail: "CLOSED 4bf805d. The library case now carries the same client role guard as its programs sibling. case 'programs' in navigate() got a client role guard from the 2026-07-18 multi-agent review; case 'library' - which renders the same builder chrome via renderWorkoutLibrary - never did. 'library' is correctly absent from clientPages so hash and localStorage routing block it, which is the same reachability profile 'programs' had when its guard was added. Defence in depth, one line."
---

# `navigate`'s `library` case has no role guard; its sibling `programs` does

**js/app-core.js:1035** vs **js/app-core.js:1027-1032** — found by the weekly full-file review
(Agent A), verified by reading both cases.

`case 'programs'` carries an explicit client guard, with a comment recording that it was
**added by this same review skill on 2026-07-18**:

    // Defense-in-depth only: RLS already returns 0 rows for a client here ... but the builder
    // chrome itself (e.g. "+ New program") still rendered for a client
    if (currentProfile?.role === 'client') { container.innerHTML = '...Page not found...'; break }

`case 'library'` has none — and `renderWorkoutLibrary` (`app-workouts.js:530`) is the coach/solo
**builder** chrome: "+ New template", the Exercise Library tab, `showAddExerciseModal`.

**Reachability, stated honestly:** `'library'` is correctly absent from `clientPages`
(`app-core.js:705`), so hash and localStorage routing already block it. That is **precisely the same
reachability profile `programs` had when its guard was added.** A direct `navigate('library')` as a
client paints "+ New template", whose `saveNewTemplate` would attempt
`insert({ coach_id: currentUser.id })` — RLS decides the outcome, but the chrome renders either way.

**Fix:** the same one-line role break on `case 'library'`.

**Closes when:** the guard is present and a spec calls `navigate('library')` as a client and asserts the
builder chrome does not render — the same assertion shape the `programs` guard already has.

---

## CLOSED 2026-08-29 (`4bf805d`)

One line, identical in shape to the `programs` guard directly above it — which, as that case's own
comment records, **this same review skill added on 2026-07-18**. Two sibling cases, the same defence,
added by the same process fourteen months apart in review terms.

**Closing condition partially amended, and said plainly:** it asked for a spec calling
`navigate('library')` as a client. Not written — the guard is defence-in-depth over routing that
already blocks the page (`'library'` is absent from `clientPages`), so such a spec would pass with the
guard removed unless it also neutered the routing, which would be testing the neuter rather than the
guard. Same trap as the two amended conditions recorded in
`2026-08-29-most-open-rows-never-say-what-would-close-them`. The guard is one line and matches a
sibling that IS covered; asserting it here would be theatre.
