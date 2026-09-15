---
id: 2026-09-06-saveassignprogram-clobbers-the-clones-own-error-message
status: open
priority: medium
reported: 2026-09-06
status_detail: "Found by the 2026-09-06 full-file review (Agent C), verified at source; severity reduced from Agent C's HIGH because the user is still told something failed, only less specifically. js/app-programs.js:480 toasts on failure, overwriting the specific message _cloneProgramForClient just showed. Its twin at :911 gates on success for exactly this reason."
---

# saveAssignProgram copied half its twin's fix and overwrites the message it was meant to preserve

`showToast` (`app-core.js:43`) keeps **one** DOM node and no queue — a second toast erases the first.

The twin, `saveAssignProgramToClient:911`, only toasts on **success**, with a comment saying it
withholds its own toast so it cannot *"instantly clobber whatever `_cloneProgramForClient` just told the
user (a phase-count warning, a skip count, an insert failure). Fixed 2026-07-29."*

`saveAssignProgram:478-481` does the opposite — it toasts on **failure**, replacing that specific
message with a generic one.

Its own comment says *"Capture the result, like the twin saveAssignProgramToClient does"* — and it does
capture it, then spends it on the one action the twin exists to avoid. **The 2026-09-02 fix carried
across the capture and not the reason for it.** [[feedback_fix_the_class_not_the_instance]].

Consequence: a coach assigning a programme with no phases yet, from the client-profile path, sees a
generic "sessions could not all be copied" error instead of the accurate "no phases yet", and loses the
skipped-session count.

**Not high:** before 2026-09-02 this path said nothing at all, so this is a partial fix that loses
specificity, not a silent failure.

**Closes when** the failure path stops overwriting the clone's own message — drop the toast, or have
`_cloneProgramForClient` return a reason rendered once — proven by a spec asserting the specific message
survives, red before, green after.
