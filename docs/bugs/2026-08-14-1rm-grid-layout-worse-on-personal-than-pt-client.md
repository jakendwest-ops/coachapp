---
id: 2026-08-14-1rm-grid-layout-worse-on-personal-than-pt-client
status: fixed-awaiting-jake
priority: medium
reported: 2026-08-14
---

# The 1RM "grid" Jake preferred was the EMPTY state, not the PT-side layout

**Jake, 2026-08-14, verbatim:** *"The 1RM grid on the PT > Client side (eg for alex turner) is better UI and
layout than the grid used for personal."*

**There is only ONE implementation.** `renderClient1RMs` (`js/app-progress.js:48`) serves both the coach's
client-profile tab and the client/solo page. What differed was DATA, not code: Alex Turner has no 1RM rows
and got the clean "Quick-start — The Big 5" grid; Jake has rows and got a completely different
card-per-exercise layout. Empty vs populated, not PT vs Personal — and Jake could never see the grid again
on his own account.

The one genuine parity gap underneath it: 1RMs is a full-width TAB for coaches but was appended as a footer
below `renderProgressPBs`' own header and PB cards for solo.

**✅ FIXED + LIVE `d337418` (2026-08-14).** Grid always (Jake's choice), values editable inline, one Save
all. 1RMs promoted to its own top-level Progress tab.

**⚠️ Partially reverses the 2026-07-08 restructure**, which deliberately moved 1RMs INTO Personal Bests
from its own sub-tab. Flagged rather than done silently; easy to undo if it feels wrong in use.

Two real bugs found while building, neither reported:
- `client_1rms` is append-only ("+ Update" always INSERTED), so a naive Save-all would stamp a duplicate
  dated today for every untouched lift, burying real history. Only edited rows are written.
- `_refresh1RMs` could throw AFTER a successful write, making a save that worked look like it failed.

And one affordance regression caught by review: the removed cards hosted **backdating** and **"estimate
from a set" (Epley)**, neither of which inline editing covers. Restored behind a per-row `⋯` button. This is
the documented [[feedback-removing-container-drops-affordances]] shape, hit again.

**Closes when:** Jake opens 1RMs on Personal, edits a value, saves, and confirms the layout and that his
previous number is kept as history.
