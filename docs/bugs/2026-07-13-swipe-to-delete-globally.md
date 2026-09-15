---
id: 2026-07-13-swipe-to-delete-globally
status: open
priority: medium
reported: 2026-07-13
reported_detail: re-raised 2026-08-02
---

# swipe-to-delete, globally

**DECISION — swipe-to-delete, globally.** Jake: "could we globally introduce the swipe to delete functionality?" Needs a sounding-board pass, not a build: it is a new interaction primitive touching every list in the app (sets, templates, exercises, programs, events). Discoverability + accidental-delete risk on a gym phone are the real questions. **Re-raised 2026-08-02** ("how big a job is this?") — confirmed zero existing swipe/gesture code anywhere in the codebase (grepped `touchstart`/`touchmove`/`swipe`, only hit was an unrelated "Hammer Curl" exercise name), so this is new infrastructure, not a retrofit: one shared gesture component (~half a day) + retrofitting every list that has a delete button (the bulk of the work) + an undo-toast pattern instead of a confirm dialog (a swipe is supposed to be fast; a confirm defeats it). Jake: "just curiosity for now" — not scoped further, no build.
