---
id: 2026-07-05-client-can-self-detach-from-their-pt-with-no-workflow
status: deferred
priority: medium
reported: 2026-07-05
status_detail: "deferred (Jake)"
---

# Client can self-detach from their PT with no workflow

**Client can self-detach from their PT with no workflow** — RLS is row-level, so the client-write policy on `clients` also permits changing their own `coach_id`. Accepted as consistent with the current trust model; needs a designed cancellation/detach flow eventually.
