---
id: 2026-07-13-stored-xss-client-authored-text-renders-unescaped-in-the-coa
status: fixed-awaiting-jake
priority: critical
reported: 2026-07-13
status_detail: "fixed — awaiting Jake"
---

# Stored XSS: client-authored text renders unescaped in the COACH s DOM

🔴 **CRITICAL — Stored XSS: client-authored text renders unescaped in the COACH s DOM.** `openWorkoutLog` interpolates `session.name` (app-runner.js:2190), `ex.exercise_name` (:2229) and `session.notes` (:2265) with no `escapeHtml()` — all three are written BY THE CLIENT in the runner finish screen. A client typing a `</textarea><img onerror=...>` payload into How did it go? executes script in the coach browser on the coach next view, with the coach Supabase session → JWT theft → reads every client of that coach. **RLS cannot defend against a stolen coach token.** `escapeHtml()` already exists (app-core.js:69) and is used correctly in app-workouts.js:95/97/113.
