---
id: 2026-10-31-a-255-kg-back-squat-set-sets-the-best-top-set
status: closed
priority: medium
reported: 2026-10-31
status_detail: "closed 2026-10-31 — Jake ran the one-row UPDATE (returned weight_kg 115.67, reps 2); read back in his signed-in app: the set reads 115.67 and Per exercise now shows Back Squat best top set 140 kg x 4."
---

# A 255 kg back squat set is wrong, and it sets the "best top set"

Jake reported it on 2026-10-31 while reviewing Progress › Performance › Per exercise: Back Squat's "Best top set: 255 kg × 2 · 8 sessions".

**Where it is (read-only lookup, his account, 2026-10-31):** `workout_log_sets` row under the session **Full Body A** on **2026-08-02**,
exercise **Back Squat**, set 1, `weight_kg` 255, `reps_achieved` 2. It is the only set at or above 200 kg in his logged history.

**Likely cause (unverified):** pounds typed into a kg field (255 lb ≈ 115.7 kg), or a typo.

**Why it matters:** one wrong set becomes the lift's best top set and estimated 1RM everywhere they are computed (Per exercise, the runner's
Stats sheet, the planned strength trend and block comparison), and nothing in the app flags an implausible jump.

**Closes when:** the set holds the right weight (corrected by Jake in the app, or by a one-row UPDATE he runs) and Per exercise shows the
corrected best. A guard against implausible entries (e.g. a confirm step when a set is far above the lift's previous best) is a separate
question for the charts design.

## Fixed, 2026-10-31

Jake confirmed it was 255 lb typed as kg and ran:

```sql
update public.workout_log_sets set weight_kg = 115.67
where id = 'e1fc137e-99bc-469b-88e8-15fadc1ed413' and weight_kg = 255
returning id, set_number, weight_kg, reps_achieved;
```

It returned one row (115.67, 2 reps). Read back in the app the same day: the set reads 115.67 and Per exercise shows Back Squat's best top set as 140 kg x 4. A guard against implausible entries stays a question for the charts design.
