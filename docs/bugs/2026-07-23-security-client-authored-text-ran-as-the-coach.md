---
id: 2026-07-23-security-client-authored-text-ran-as-the-coach
status: closed
priority: critical
reported: 2026-07-23
status_detail: "CLOSED 2026-09-27 via closure rule (b), proven that day by a neuter run: tests/escaping-sweep-2026-08-12.spec.js (runs scripts/check-escaping.mjs) passed on current code; with the escaped PB notes in renderClientPerformance (the coach's view of a client's PBs) un-escaped it FAILED ('unescaped free-text interpolation(s) found'); after a byte-identical restore it passed again."
---

# SECURITY: client-authored text ran as the COACH

✅ **FIXED + LIVE 2026-07-23 (bd2e501) — SECURITY: client-authored text ran as the COACH.** Full-file review 2026-07-23, found by Agents A and C independently. `performance_logs.name`/`.notes` and `weight_logs.notes` are written BY THE CLIENT (app-clients.js saveClientPB/saveClientWeight, from their own My Progress page) and rendered UNESCAPED in the COACH's client-profile tabs: app-progress.js **:344, :349, :382** (renderClientPerformance) and **:640** (renderClientWeight). A client logging a PB named `<img src=x onerror=...>` executes in the coach's session on the coach's next view → JWT theft → reads every client of that coach. **RLS cannot defend a stolen coach token.** THIRD instance of this shape (2026-07-13, 2026-07-18, now). `escapeHtml` is already applied on the sibling paths (:82, :1063, :1483, :1528) — these four are the copies that never got it. Same sink on the client's own page at :1635 (self-XSS only).
