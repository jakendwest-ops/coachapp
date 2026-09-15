---
id: 2026-09-06-copy-to-coaching-creates-an-undeletable-orphan-for-a-solo-user
status: open
priority: high
reported: 2026-09-06
status_detail: "Found by the 2026-09-06 full-file review (Agent B), verified at source. js/app-programs.js:1142 gates 'Copy to coaching programs' on program.is_personal ALONE. A native solo account has no coaching view, so the copy it creates is unlistable, unopenable and UNDELETABLE, plus orphan template clones. Reachable today on 4 of 9 live accounts."
---

# "Copy to coaching programs" strands a solo user with an undeletable programme

`js/app-programs.js:1142`:

```js
${program.is_personal
  ? `<button ... onclick="copyProgramToCoaching('${program.id}')">Copy to coaching programs</button>`
  : (window._soloClientId && currentProfile?.role !== 'solo' ? `<button ... >Move to Personal</button>` : '')}
```

**The two arms are not symmetric.** The inbound arm (`Move to Personal`) checks *both* that a Personal
view exists AND that the user is not already in it. The outbound arm checks only `is_personal`.

`renderPrograms:929` filters `.eq('is_personal', currentProfile?.role === 'solo')`, so **every**
programme a solo user can open is `is_personal = true` — the button is on all of them.

## Why the copy is unreachable afterwards

`copyProgramToCoaching` inserts with `is_personal: false`. For a NATIVE solo account:

- `loadUserInfo` (`app-core.js:804`) takes the `role === 'solo'` branch, which sets `_soloClientId`
  but **deliberately not `_masterAccount`** — only the `else if (role === 'coach')` branch at `:815`
  sets that.
- No `_masterAccount` means no view switcher, and `switchView` returns immediately on `!window._masterAccount`.
- `renderPrograms` will never list an `is_personal = false` row for them.
- `deleteProgram` is only reachable from `openProgram`, which is only reachable from the list.

So the copy is **unlistable, unopenable, uneditable and undeletable**, and it drags a full clone of
every template in the programme along with it. Pressing the button again hits the name-collision guard
and reports "A coaching copy of this program already exists" — a permanent dead end.

## This is the documented reasoning, applied to only one direction

`moveProgramToPersonal:1351-1353` carries the comment that states this argument explicitly — that
`_soloClientId` "is the thing that actually proves a Personal view exists", and that without it the
result is "unlistable, uneditable and UNDELETABLE". **That was caught by review on 2026-07-13 and fixed
in the inbound direction only.** [[feedback_fix_the_class_not_the_instance]].

The correct sibling behaviour also exists elsewhere: `_copyTemplateToLibrary` (`app-workouts.js:3215`)
derives `isPersonal` from the current role rather than assuming.

## Reachability — measured, not assumed

Counted on the live project 2026-09-06: **4 of 9 accounts are `role='solo'`**. A master account (coach
who also trains) is unaffected — it has `_masterAccount`, a view switcher, and can reach the copy.

**Closes when** the button is gated so it only renders where a coaching view actually exists (mirroring
`:1353`), proven by a spec that renders the programme header as a native solo account and asserts the
button is absent — red before, green after. **A repair for any orphan already created is a separate
question for Jake**, since deleting a programme is destructive and none may exist.
