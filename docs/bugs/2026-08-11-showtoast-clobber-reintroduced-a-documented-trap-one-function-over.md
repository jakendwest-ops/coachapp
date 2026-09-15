---
id: 2026-08-11-showtoast-clobber-reintroduced-a-documented-trap-one-function-over
status: fixed-awaiting-jake
priority: high
reported: 2026-08-11
---

# showToast clobber — three error toasts rendered as one green one

`showToast` keeps a single `#app-toast` node and REMOVES any existing one before painting, so
consecutive calls in the same tick leave only the LAST.

`generatePhasePeriodization`'s reporting was written as three separate statements — genFailures error,
propFailures error, then the unconditional success line. The user saw pure green while sessions were
silently missing.

That exact trap is documented **1200 lines up in the same file**, from a previous multi-agent review on
2026-07-29: *"showToast keeps a single DOM node with no queue, so an unconditional caller-side success
toast would instantly clobber whatever this function just told the user."* A previous review found it,
someone wrote the warning down, and it was reintroduced one function over.

Two more clobber sites fixed: `_cloneTemplateForClient`'s in-loop toast, and the solo
"your clients were not changed" info toast erasing the propagation error toast.

**This is the strongest argument for the pre-push review gate that exists.** Found by Agent C.

Fixed `c4e7ecb`.
