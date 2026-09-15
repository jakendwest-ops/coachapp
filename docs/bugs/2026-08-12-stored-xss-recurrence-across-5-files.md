---
id: 2026-08-12-stored-xss-recurrence-across-5-files
status: fixed-awaiting-jake
priority: high
reported: 2026-08-12
status_detail: "found by the full-codebase architecture audit; recurring class, 5th/6th/7th time this pattern has been found in this project"
---

# Unescaped free-text renders found across 5 files — the stored-XSS class that has already recurred 4 times (2026-07-13/-18/-23/-28) has more unfixed instances

Found by the 2026-08-12 full-codebase audit (`architecture-audit-2026-08-12.md`). CRITICAL.md's incident timeline shows this exact bug shape (client- or coach-authored free text rendered into another user's session without `escapeHtml`/`escapeAttr`) has already been found and fixed 4 separate times. This pass found more unfixed sites, including one **confirmed regression against a specific dated fix**.

## Confirmed — spot-checked directly against the live code, not just agent-reported

**js/app-programs.js:87 — `renderClientPrograms`'s `sessionSummary`, a direct regression against a documented 2026-07-18 fix.** `sessionSummary` (line 81) is computed identically to `js/app-workouts.js:642` (byte-for-byte the same expression) — but app-workouts.js:647 correctly wraps it in `escapeHtml(sessionSummary)` while app-programs.js:87 renders it raw: `${sessionSummary}`. STATUS.md's Continuity block (Week-tabs display model, 2026-07-18) explicitly documents this exact bug as fixed ("the DAY-header `sessionSummary` was a raw coach→client XSS, escaped 2026-07-18") but only names two surfaces as covered — `renderClientPrograms` (app-programs.js, the coach's own client-detail "Programs" tab) is a third surface with the identical render pattern that was never brought into that hardening pass. **Verified by direct code read, not just agent citation.**

**js/app-runner.js:844 — the "Your notes" textarea (`ex.clientNotes`) — live, round-trips via localStorage draft, not just same-keystroke self-XSS.** `${ex.clientNotes||''}` renders raw inside the textarea's innerHTML on every `renderRunner()` repaint. A value containing a literal `</textarea>` breaks out of the textarea and the remainder is parsed as real markup — e.g. typing `</textarea><img src=x onerror=alert(1)>` into the notes field, then checking off any set (which triggers a re-render), executes it. This value also round-trips through `localStorage` via `_saveRunnerDraft`/`_loadRunnerDraft` (app-runner.js:88-131), so a resumed draft replays the injection on a later visit, not just the original keystroke. **Verified by direct code read.**

## Additional sites reported by the audit (not independently re-verified by direct read in this pass, cite with that caveat)

- **js/app-runner.js:787** — exercise name interpolated raw into a `title="..."` attribute (contrast the same value correctly escaped 3 lines later at :780).
- **js/app-runner.js:584/590 and :1648/1666** — "Next: {exercise name}" labels in the inline rest bar and the wizard-mode rest overlay, unescaped (contrast the sibling "Resting…" chip at :791, correctly escaped).
- **js/app-programs.js:57, 101, 134** — program name, session/template name, phase name, all unescaped in `renderClientPrograms` (contrast the same three fields correctly escaped in this file's own sibling functions `renderPrograms`:766, `renderPhaseWeekGrid`:1871, `openProgram`:919).
- **js/app-programs.js:767, 892** — `programs.description`, unescaped in `renderPrograms` and `openProgram`.
- **js/app-dashboard.js:534-535 and :805-806** — `pb.name`/`pb.unit` (client/solo-authored free text from the "Log PB" form) unescaped in both `renderClientDashboard` and `renderSoloDashboard`, while every other free-text field in the same two functions (goal title, event title, check-in notes) is correctly escaped.
- **js/app-dashboard.js:119** — `clientMap[f.client_id]` (client `full_name`) unescaped in the coach's "Recent activity" feed, inconsistent with the same file's own compliance-row rendering 4 lines away (:158, correctly escaped).
- **js/app-calendar-goals.js:191** — the identical `clientMap[e.client_id]` pattern, unescaped, in the calendar's event list.
- **js/app-calendar-goals.js:510-511, 676, 683-685** — `metric_label`/`metric_unit` on goal cards, unescaped (self-XSS-tier — coach's own typed input).
- **js/app-clients.js:394** — `showUpdateEmailModal` renders `currentEmail` raw into a fresh `overlay.innerHTML`, re-opening the attribute-breakout class `escapeAttr`/`escapeHtml` exist to prevent, even though the value was correctly `escapeAttr`'d at the point it was first embedded into an onclick string. The sibling modal for the same field, `showEditClientModal` (:439), gets it right (`escapeHtml(c.email || '')`).
- **js/app-clients.js:306** — `programName` unescaped in `clientOverviewTab`, while every other field on the same card (email, phone, notes) is escaped.
- **js/app-dashboard.js:81, :356** — the user's own `firstName` in page-header greetings, self-XSS-tier only.

## Suggested fix direction

Same shape as the prior 4 fixes: wrap each site in `escapeHtml()` (or `escapeAttr()` for onclick-string contexts). Given this is the 5th+ recurrence, also worth a repo-wide grep sweep (`grep -rn '\${' js/*.js` filtered to interpolations of known free-text fields — `name`, `notes`, `description`, `full_name`, `email`, `title`) as a one-time closing pass, rather than relying on catching each new instance during unrelated feature work.

---

**✅ FIXED + LIVE `2e9535d` + `9d0003b` (2026-08-12). 20 sites, and the class is now mechanically
detected.**

Escaped: a client's real `full_name` rendered raw in BOTH app-dashboard.js and app-calendar-goals.js
(the audit's cross-file finding, correct), session names, performance-log name and unit, phase names,
day_label, template names, exercise category, programme descriptions, and two attribute contexts.

**The sweep itself shipped a worse bug than the one it fixed, caught by pre-push review:** I used
`escapeAttr` in plain `value=""` attributes. `escapeAttr` is for a user string inside a JS STRING
LITERAL in an attribute (`onclick="fn('${escapeAttr(x)}')"`) — it backslash-escapes first. In a plain
attribute the browser hands `.value` back WITH the backslash, and `saveSettingsProfile` writes it to
`profiles.full_name`. It compounds on every save:

    O'Brien -> O\'Brien -> O\\\'Brien -> O\\\\\\\'Brien

`app-clients.js:442` had used `escapeHtml` on that same field all along. Verified empirically, then
fixed at all 3 sites.

**Rule 9d was also scoped narrower than the class it certified** — it omitted `.name`, the commonest
free-text field here, so it would have caught 6 of 17 sites and reported CLEAN while three live sinks
sat in app-programs.js:57, app-calendar-goals.js:144 and app-workouts.js:624 (now escaped). It also
filtered whole LINES, so an escaped interpolation masked an unescaped neighbour — the same hole class
as the `!==` exclusion removed one commit earlier.

Now `scripts/check-escaping.mjs`, called from checks.sh, proven against all six shapes and blocking
pushes. Pinned by `tests/escaping-sweep-2026-08-12.spec.js` (4 tests) — rewritten after review,
because its first version tested the helpers rather than the call sites and would have stayed green
if the whole sweep were reverted.
