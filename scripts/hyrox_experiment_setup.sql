-- ============================================================
-- Hyrox Experiment — setup script
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Add session_order column for AM/PM support
ALTER TABLE program_phase_workouts
  ADD COLUMN IF NOT EXISTS session_order integer NOT NULL DEFAULT 1;

-- ============================================================
-- 2. Create strength templates + program (as Jake's coach account)
-- ============================================================

DO $$
DECLARE
  v_coach_id         uuid;
  v_tpl_upper_a      uuid;
  v_tpl_lower_a      uuid;
  v_tpl_upper_b      uuid;
  v_program_id       uuid;
  v_phase_id         uuid;
  v_row_threshold    uuid;
  v_run_aerobic      uuid;
  v_skierg_aerobic   uuid;
  v_run_threshold    uuid;
  v_row_aerobic      uuid;
  v_skierg_threshold uuid;
BEGIN

  -- Get Jake's user ID
  SELECT id INTO v_coach_id FROM auth.users WHERE email = 'jakendwest@gmail.com';
  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Coach user not found — check email address';
  END IF;

  -- ── Upper A ──────────────────────────────────────────────
  INSERT INTO workout_templates (coach_id, name, description)
  VALUES (v_coach_id, 'Upper A — Horizontal Push & Pull', 'Horizontal push/pull strength session. 50 min.')
  RETURNING id INTO v_tpl_upper_a;

  INSERT INTO workout_template_exercises
    (template_id, exercise_name, exercise_type, order_index, sets, sets_json, notes)
  VALUES
    (v_tpl_upper_a, 'Bench Press', 'strength', 1, 4,
     '[{"repsMin":6,"repsMax":6,"intensityMin":70,"intensityMax":85,"restMin":"3:00","restMax":"3:00"},{"repsMin":6,"repsMax":6,"intensityMin":70,"intensityMax":85,"restMin":"3:00","restMax":"3:00"},{"repsMin":6,"repsMax":6,"intensityMin":70,"intensityMax":85,"restMin":"3:00","restMax":"3:00"},{"repsMin":6,"repsMax":6,"intensityMin":70,"intensityMax":85,"restMin":"3:00","restMax":"3:00"}]'::jsonb,
     '70–85% 1RM. Control the descent.'),

    (v_tpl_upper_a, 'Barbell / Dumbbell Row', 'strength', 2, 4,
     '[{"repsMin":8,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":8,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":8,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":8,"repsMax":8,"restMin":"2:00","restMax":"2:30"}]'::jsonb,
     'Heavy. Chest-supported preferred.'),

    (v_tpl_upper_a, 'Weighted Pull-Up', 'strength', 3, 4,
     '[{"repsMin":5,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":5,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":5,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":5,"repsMax":8,"restMin":"2:00","restMax":"2:30"}]'::jsonb,
     null),

    (v_tpl_upper_a, 'Overhead Press', 'strength', 4, 3,
     '[{"repsMin":8,"repsMax":10,"restMin":"1:30","restMax":"2:00"},{"repsMin":8,"repsMax":10,"restMin":"1:30","restMax":"2:00"},{"repsMin":8,"repsMax":10,"restMin":"1:30","restMax":"2:00"}]'::jsonb,
     null),

    (v_tpl_upper_a, 'Farmer''s Carry (30–50m)', 'strength', 5, 3,
     '[{"repsMin":1,"repsMax":1,"restMin":"1:30","restMax":"2:00"},{"repsMin":1,"repsMax":1,"restMin":"1:30","restMax":"2:00"},{"repsMin":1,"repsMax":1,"restMin":"1:30","restMax":"2:00"}]'::jsonb,
     '30–50m per set. Grip and upper back focus.');

  -- ── Lower A ──────────────────────────────────────────────
  INSERT INTO workout_templates (coach_id, name, description)
  VALUES (v_coach_id, 'Lower A — Squat & Posterior Chain', 'Squat-focused lower session. 50 min.')
  RETURNING id INTO v_tpl_lower_a;

  INSERT INTO workout_template_exercises
    (template_id, exercise_name, exercise_type, order_index, sets, sets_json, notes)
  VALUES
    (v_tpl_lower_a, 'Back Squat', 'strength', 1, 4,
     '[{"repsMin":5,"repsMax":5,"intensityMin":70,"intensityMax":85,"restMin":"3:00","restMax":"3:00"},{"repsMin":5,"repsMax":5,"intensityMin":70,"intensityMax":85,"restMin":"3:00","restMax":"3:00"},{"repsMin":5,"repsMax":5,"intensityMin":70,"intensityMax":85,"restMin":"3:00","restMax":"3:00"},{"repsMin":5,"repsMax":5,"intensityMin":70,"intensityMax":85,"restMin":"3:00","restMax":"3:00"}]'::jsonb,
     '70–85% 1RM. Depth to parallel.'),

    (v_tpl_lower_a, 'Romanian Deadlift', 'strength', 2, 3,
     '[{"repsMin":10,"repsMax":12,"restMin":"2:00","restMax":"2:00"},{"repsMin":10,"repsMax":12,"restMin":"2:00","restMax":"2:00"},{"repsMin":10,"repsMax":12,"restMin":"2:00","restMax":"2:00"}]'::jsonb,
     null),

    (v_tpl_lower_a, 'Bulgarian Split Squat', 'strength', 3, 3,
     '[{"repsMin":8,"repsMax":8,"restMin":"1:30","restMax":"2:00"},{"repsMin":8,"repsMax":8,"restMin":"1:30","restMax":"2:00"},{"repsMin":8,"repsMax":8,"restMin":"1:30","restMax":"2:00"}]'::jsonb,
     '8 reps each leg.'),

    (v_tpl_lower_a, 'Leg Curl / Nordic', 'strength', 4, 3,
     '[{"repsMin":10,"repsMax":10,"restMin":"1:30","restMax":"1:30"},{"repsMin":10,"repsMax":10,"restMin":"1:30","restMax":"1:30"},{"repsMin":10,"repsMax":10,"restMin":"1:30","restMax":"1:30"}]'::jsonb,
     null),

    (v_tpl_lower_a, 'Calf Raise', 'strength', 5, 3,
     '[{"repsMin":20,"repsMax":20,"restMin":"1:00","restMax":"1:00"},{"repsMin":20,"repsMax":20,"restMin":"1:00","restMax":"1:00"},{"repsMin":20,"repsMax":20,"restMin":"1:00","restMax":"1:00"}]'::jsonb,
     null);

  -- ── Upper B ──────────────────────────────────────────────
  INSERT INTO workout_templates (coach_id, name, description)
  VALUES (v_coach_id, 'Upper B — Vertical Push, Pull & Stations', 'Vertical push/pull + Hyrox stations. 50 min.')
  RETURNING id INTO v_tpl_upper_b;

  INSERT INTO workout_template_exercises
    (template_id, exercise_name, exercise_type, order_index, sets, sets_json, notes)
  VALUES
    (v_tpl_upper_b, 'Push Press', 'strength', 1, 4,
     '[{"repsMin":6,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":6,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":6,"repsMax":8,"restMin":"2:00","restMax":"2:30"},{"repsMin":6,"repsMax":8,"restMin":"2:00","restMax":"2:30"}]'::jsonb,
     null),

    (v_tpl_upper_b, 'Weighted Pull-Up / Lat Pulldown', 'strength', 2, 4,
     '[{"repsMin":6,"repsMax":8,"restMin":"2:00","restMax":"2:00"},{"repsMin":6,"repsMax":8,"restMin":"2:00","restMax":"2:00"},{"repsMin":6,"repsMax":8,"restMin":"2:00","restMax":"2:00"},{"repsMin":6,"repsMax":8,"restMin":"2:00","restMax":"2:00"}]'::jsonb,
     null),

    (v_tpl_upper_b, 'Wall Ball Endurance Sets', 'strength', 3, 5,
     '[{"repsMin":20,"repsMax":50,"restMin":"1:30","restMax":"2:00"},{"repsMin":20,"repsMax":50,"restMin":"1:30","restMax":"2:00"},{"repsMin":20,"repsMax":50,"restMin":"1:30","restMax":"2:00"},{"repsMin":20,"repsMax":50,"restMin":"1:30","restMax":"2:00"},{"repsMin":20,"repsMax":50,"restMin":"1:30","restMax":"2:00"}]'::jsonb,
     '10 kg. Sets get longer each phase — peak is 100 unbroken in weeks 9–11.'),

    (v_tpl_upper_b, 'Burpee Broad Jump', 'strength', 4, 3,
     '[{"repsMin":1,"repsMax":1,"restMin":"2:00","restMax":"2:00"},{"repsMin":1,"repsMax":1,"restMin":"2:00","restMax":"2:00"},{"repsMin":1,"repsMax":1,"restMin":"2:00","restMax":"2:00"}]'::jsonb,
     '20–40m per set.'),

    (v_tpl_upper_b, 'Tricep Dip / Pushdown', 'strength', 5, 3,
     '[{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"},{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"},{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"}]'::jsonb,
     null);

  -- ── Look up existing cardio templates ────────────────────
  SELECT id INTO v_row_threshold    FROM workout_templates WHERE coach_id = v_coach_id AND name = 'Row Threshold'    LIMIT 1;
  SELECT id INTO v_run_aerobic      FROM workout_templates WHERE coach_id = v_coach_id AND name = 'Run Aerobic'      LIMIT 1;
  SELECT id INTO v_skierg_aerobic   FROM workout_templates WHERE coach_id = v_coach_id AND name = 'SkiErg Aerobic'   LIMIT 1;
  SELECT id INTO v_run_threshold    FROM workout_templates WHERE coach_id = v_coach_id AND name = 'Run Threshold'    LIMIT 1;
  SELECT id INTO v_row_aerobic      FROM workout_templates WHERE coach_id = v_coach_id AND name = 'Row Aerobic'      LIMIT 1;
  SELECT id INTO v_skierg_threshold FROM workout_templates WHERE coach_id = v_coach_id AND name = 'SkiErg Threshold' LIMIT 1;

  -- Warn if any cardio template is missing
  IF v_row_threshold    IS NULL THEN RAISE WARNING 'Row Threshold template not found'; END IF;
  IF v_run_aerobic      IS NULL THEN RAISE WARNING 'Run Aerobic template not found'; END IF;
  IF v_skierg_aerobic   IS NULL THEN RAISE WARNING 'SkiErg Aerobic template not found'; END IF;
  IF v_run_threshold    IS NULL THEN RAISE WARNING 'Run Threshold template not found'; END IF;
  IF v_row_aerobic      IS NULL THEN RAISE WARNING 'Row Aerobic template not found'; END IF;
  IF v_skierg_threshold IS NULL THEN RAISE WARNING 'SkiErg Threshold template not found'; END IF;

  -- ── Create program ────────────────────────────────────────
  INSERT INTO programs (coach_id, name, description)
  VALUES (v_coach_id,
    'Hyrox Experiment',
    'Hyrox-specific training plan. Strength + endurance. Sub-1:30 target. Two-a-day sessions on Mon / Wed / Fri / Sat.')
  RETURNING id INTO v_program_id;

  -- ── Phase 1 — Base Building (1 week preview) ─────────────
  INSERT INTO program_phases (program_id, name, duration_weeks, order_index)
  VALUES (v_program_id, 'Phase 1 — Base Building', 1, 1)
  RETURNING id INTO v_phase_id;

  -- ── Assign workouts ───────────────────────────────────────
  -- MON: Upper A (AM) + Row Threshold (PM)
  INSERT INTO program_phase_workouts (phase_id, day_of_week, day_label, template_id, session_order, notes) VALUES
    (v_phase_id, 1, 'Monday', v_tpl_upper_a, 1,
     'Strength before cardio. Upper pull pairs well with rowing — lats and upper back are pre-activated. Keep 2–3 min rest on main lifts.'),
    (v_phase_id, 1, 'Monday', v_row_threshold, 2,
     'Pace: 2:04–2:09/500m. HR 163–176 bpm. Phase-dependent intervals. Warm-up 8 min easy, cool-down 5 min easy.');

  -- TUE: Run aerobic (single)
  INSERT INTO program_phase_workouts (phase_id, day_of_week, day_label, template_id, session_order, notes) VALUES
    (v_phase_id, 2, 'Tuesday', v_run_aerobic, 1,
     'Full recovery from Monday''s upper session. Keep genuinely easy — if HR drifts above 155, slow down. The aerobic base built here is the foundation of your Hyrox run.');

  -- WED: Lower A (AM) + SkiErg Aerobic (PM)
  INSERT INTO program_phase_workouts (phase_id, day_of_week, day_label, template_id, session_order, notes) VALUES
    (v_phase_id, 3, 'Wednesday', v_tpl_lower_a, 1,
     'Squat-focused lower day. SkiErg after squats reinforces the hip hinge under fatigue — useful for the SkiErg station.'),
    (v_phase_id, 3, 'Wednesday', v_skierg_aerobic, 2,
     'Pace: 2:40–2:55/500m. HR 134–154 bpm. Stroke rate 18–22 spm. 25–30 min. Keep aerobic pace genuinely easy.');

  -- THU: Run threshold (single — highest priority)
  INSERT INTO program_phase_workouts (phase_id, day_of_week, day_label, template_id, session_order, notes) VALUES
    (v_phase_id, 4, 'Thursday', v_run_threshold, 1,
     'No strength today — arrive completely fresh. This is the single most important session in the plan. Running is your biggest lever for a sub-1:30 finish. P1: km intervals. P2: 25 min tempo. P3: 6–8 × 1 km at race pace.');

  -- FRI: Upper B (AM) + Row Aerobic (PM)
  INSERT INTO program_phase_workouts (phase_id, day_of_week, day_label, template_id, session_order, notes) VALUES
    (v_phase_id, 5, 'Friday', v_tpl_upper_b, 1,
     'Hyrox upper-body stations live here. Wall ball sets get longer each phase — peak is 100 unbroken in weeks 9–11.'),
    (v_phase_id, 5, 'Friday', v_row_aerobic, 2,
     'Pace: 2:35–2:50/500m. HR 134–154 bpm. 25–40 min. Easy — legs are rested.');

  -- SAT: Lower A again (AM, Lower B not yet in screenshots) + SkiErg Threshold (PM)
  -- NOTE: Lower B is implied but not fully shown in screenshots. Using Lower A as placeholder.
  -- Replace v_tpl_lower_a with a proper Lower B template once you define it.
  INSERT INTO program_phase_workouts (phase_id, day_of_week, day_label, template_id, session_order, notes) VALUES
    (v_phase_id, 6, 'Saturday', v_tpl_lower_a, 1,
     'Lower B (placeholder — same as Lower A for now). Posterior chain focus. Define Lower B template to replace.'),
    (v_phase_id, 6, 'Saturday', v_skierg_threshold, 2,
     'SkiErg threshold after lower body. HR 163–176 bpm. Upper-body fatigue accumulates fast — focus on hip drive in later reps.');

  -- SUN: Rest (no assignment — rest day)

  RAISE NOTICE 'Hyrox Experiment created successfully. Program ID: %', v_program_id;

END $$;
