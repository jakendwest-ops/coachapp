---
id: 2026-08-17-progress-renders-missing-clientid-and-host-guards
status: open
priority: medium
reported: 2026-08-17
status_detail: "Weekly full-file review. Both verified against their guarded siblings. Item 1 is adjacent to work shipped the same day."
---

# Two Progress renders are missing guards every sibling has

## 1. `renderProgressPBs` has no `!clientId` guard — it paints a working-looking form that saves to nothing

`js/app-progress.js:2451-2455`:

```js
const clientId = await _getCurrentClientId()
const addPBBtn = `...onclick="showClientPBForm('${clientId}')"...`
```

Four siblings bail on a falsy clientId: `renderProgressWeight` (`:1435`), `renderPerformance` (`:1181`),
`renderProgressStrength` (`:2001`), and `renderProgress`'s Personal Bests branch (`:1165`). This one does
not.

With `window._soloClientId` unset — the state `renderSoloDashboard` guards with "Personal account not set
up yet" — this renders `showClientPBForm('null')`, and `_pbFormHtml(null)` wires `saveClientPB('null')`.
A fully functional-looking PB form whose Save silently fails at the database.

`_pbFormHtml(clientId)` was wired into this exact path on 2026-08-17 (commit `7bd1493`) without adding
the guard. Every other solo surface degrades to a named empty state; this one degrades to a trap.

## 2. `renderProgress`'s Personal Bests branch re-resolves its host AFTER an await

`js/app-progress.js:1162-1171` looks `#progress-tab-content` up again after a DB round trip, where its
three siblings (`:1159`-`:1161`) resolve it synchronously and pass it as a parameter.

Master account only: in **Client** view (`_getCurrentClientId()` is a real query, ~80ms) open My Progress,
tap **Personal Bests**, and within that window tap **Personal**. `switchView('solo')` → `navigate` →
`renderSoloDashboard` sets `main.innerHTML`, destroying the node. The branch resumes, `host` is `null`,
`host.innerHTML` throws. Invoked from an inline `onclick` (`:1149`), NOT through `navigate`'s `_catch`
wrapper, so it surfaces as an unhandled rejection rather than the retry card.

Solo view is unaffected (`_getCurrentClientId` returns `_soloClientId` with no round trip), which is why
it only fires switching OUT of Client view — and why it has survived.

## Recorded because the brief was wrong

The review asked for every unguarded stale-render race. Only 3 of 11 Progress renders carry a token — but
the wrong person's data CANNOT paint, because every identity change funnels through `switchView()` →
`navigate()`, which replaces `innerHTML` and detaches the node each render holds. A stale render writes
into a detached node: invisible, harmless. Item 2 matters precisely because it is the one function that
re-acquires its host by id, so its write can reach a live node.
