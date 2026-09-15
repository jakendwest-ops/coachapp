# Workout Runner UX Review
_Session: 2026-06-22_

## What's working
- Custom keypad (no keyboard popup covering the screen)
- Rest timer with countdown ring and beeps
- Stats bar above keypad
- Red End button, full exercise name, bigger Set label

## Identified gaps (prioritised)

### P1 — High impact, quick to fix
1. **No previous set reference at keypad** — when on Set 2, the user can't see what they did in Set 1. Should show "Last: 80kg × 8" inline near the weight/reps display so they know what to beat.
2. **No target shown at keypad** — template says "8-10 reps @ 80kg" but that's only in the header. User is looking at the keypad, not the header. Show target inline.
3. **"Next Set" button is dangerous** — skips to next exercise without requiring a LOG. Should be hidden until at least one set is logged for that exercise.

### P2 — Medium impact
4. **Can't edit a logged set** — if wrong number is logged, it's locked in. Tapping a logged set row should open an edit mode.
5. **No session summary on finish** — tapping Finish gives no sense of completion. Should show a summary of all exercises, sets, volume, and time.

### P3 — Nice to have
6. **No bodyweight option** — no way to mark a set as bodyweight or log assisted weight. Need a BW toggle or modifier on the weight field.

## Status
- [ ] P1.1 — Previous set reference at keypad
- [ ] P1.2 — Target reps/weight at keypad
- [ ] P1.3 — Hide Next Set until ≥1 set logged
- [ ] P2.1 — Edit logged set
- [ ] P2.2 — Session summary screen
- [ ] P3.1 — Bodyweight toggle
