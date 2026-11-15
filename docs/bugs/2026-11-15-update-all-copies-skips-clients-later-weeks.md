---
id: 2026-11-15-update-all-copies-skips-clients-later-weeks
status: closed
priority: medium
reported: 2026-11-15
status_detail: "open - FOUND 2026-11-15 by the multi-agent review of the week-scoped 'Update all copies' change, confirmed by reading js/app-workouts.js (_applyToAllSessions): after 'Update all copies' in PT view, the coach's later-week copies and the coach's OWN assigned copies of them were updated, but real clients' copies of those later weeks were collected by _assignedCopiesForSession and then dropped - never written, never offered, and the function's comment claimed they were updated. The 'Update assigned clients?' question only ever covered the edited week's client copy, and came BEFORE the copies choice. No client is on the app yet (Jake has none), so no client plan is affected. Jake approved the fix 2026-11-15: one client question, asked after the copies choice, covering this week and the later weeks; clients only ever get the edits (never 'Whole workout'); Personal view never writes to clients. FIXED 2026-11-15 (_afterSiblingStep; _applyToAllSessions collects the clients' later-week copies under the Save's role). CLOSED under rule (b): tests/client-copies-later-weeks-2026-11-15.spec.js failed 2/2 on the old code and passes on the new. Note the old code failed it at the FIRST assertion (it asked about clients before the copies question), so the red run did not reach the client's Week 3 write; that write is asserted on the new code (client Week 3 copy 110kg/150s, Week 1 untouched). multi-agent-review: no blocking; fixed before commit - a view switch could slip into the gap while 'Update all copies' wrote and show the clients question over Personal view (in-flight flag, mutation-checked), an earlier copies error hidden by the clients success toast, 'keeps its own' promised for added sets, client-plan guard. NOT LIVE until the next release tag."
closing_conditions: "After 'Update all copies' in PT view, a real client with the programme assigned is asked once and, on yes, gets the edits on this week's and the later weeks' copies (never an earlier week's), proven by a test that fails before the fix and passes after."
---

# "Update all copies" skips real clients' copies of the later weeks

In PT view, editing Week 2 of a master programme and choosing **Update all copies** changes Weeks 2+ and the coach's own
assigned copies. A client assigned that programme keeps their old Week 3+ copies, and nothing asks or says so. The only
client question ("Update assigned clients?") covers the edited week alone and comes before the copies choice.

**Expected:** one client question after the copies choice, covering this week and the later weeks; clients get only the
edits.

**Closes when:** a test that fails before the fix and passes after shows the client's later-week copies updated on yes and
their earlier weeks untouched.
