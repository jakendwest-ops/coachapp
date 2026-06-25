-- ============================================================
-- Lower B template + Saturday AM fix
-- Run AFTER hyrox_experiment_setup.sql
-- ============================================================

DO $$
DECLARE
  v_coach_id    uuid;
  v_tpl_lower_b uuid;
  v_tpl_lower_a uuid;
  v_phase_id    uuid;
  v_sat_am_id   uuid;
BEGIN

  SELECT id INTO v_coach_id FROM auth.users WHERE email = 'jakendwest@gmail.com';

  -- ── Create Lower B ────────────────────────────────────────
  INSERT INTO workout_templates (coach_id, name, description)
  VALUES (v_coach_id, 'Lower B — Deadlift Pattern & Unilateral', 'Deadlift-focused lower day. Complements Lower A squat focus. 50 min.')
  RETURNING id INTO v_tpl_lower_b;

  INSERT INTO workout_template_exercises
    (template_id, exercise_name, exercise_type, order_index, sets, sets_json, notes)
  VALUES
    (v_tpl_lower_b, 'Conventional Deadlift', 'strength', 1, 4,
     '[{"repsMin":3,"repsMax":5,"intensityMin":75,"intensityMax":90,"restMin":"3:00","restMax":"4:00"},{"repsMin":3,"repsMax":5,"intensityMin":75,"intensityMax":90,"restMin":"3:00","restMax":"4:00"},{"repsMin":3,"repsMax":5,"intensityMin":75,"intensityMax":90,"restMin":"3:00","restMax":"4:00"},{"repsMin":3,"repsMax":5,"intensityMin":75,"intensityMax":90,"restMin":"3:00","restMax":"4:00"}]'::jsonb,
     '75–90% 1RM. Brace hard, drive floor away.'),

    (v_tpl_lower_b, 'Single-Leg Romanian Deadlift', 'strength', 2, 3,
     '[{"repsMin":10,"repsMax":10,"restMin":"1:30","restMax":"2:00"},{"repsMin":10,"repsMax":10,"restMin":"1:30","restMax":"2:00"},{"repsMin":10,"repsMax":10,"restMin":"1:30","restMax":"2:00"}]'::jsonb,
     '10 reps each leg.'),

    (v_tpl_lower_b, 'Step-Up (Weighted)', 'strength', 3, 3,
     '[{"repsMin":10,"repsMax":12,"restMin":"1:30","restMax":"2:00"},{"repsMin":10,"repsMax":12,"restMin":"1:30","restMax":"2:00"},{"repsMin":10,"repsMax":12,"restMin":"1:30","restMax":"2:00"}]'::jsonb,
     '10–12 reps each leg.'),

    (v_tpl_lower_b, 'Glute Bridge / Hip Thrust', 'strength', 4, 3,
     '[{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"},{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"},{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"}]'::jsonb,
     null),

    (v_tpl_lower_b, 'Sandbag Good Morning', 'strength', 5, 3,
     '[{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"},{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"},{"repsMin":12,"repsMax":12,"restMin":"1:00","restMax":"1:30"}]'::jsonb,
     'Lower back endurance. Key for sandbag lunge station in Hyrox.');

  -- ── Replace Saturday AM placeholder with Lower B ──────────
  -- Find the Lower A placeholder on Saturday (session_order=1)
  SELECT ppw.id INTO v_sat_am_id
  FROM program_phase_workouts ppw
  JOIN program_phases pp ON pp.id = ppw.phase_id
  JOIN programs p ON p.id = pp.program_id
  JOIN workout_templates wt ON wt.id = ppw.template_id
  WHERE p.coach_id = v_coach_id
    AND p.name = 'Hyrox Experiment'
    AND ppw.day_of_week = 6
    AND ppw.session_order = 1
  LIMIT 1;

  IF v_sat_am_id IS NULL THEN
    RAISE WARNING 'Saturday AM slot not found — check Hyrox Experiment program exists';
  ELSE
    UPDATE program_phase_workouts
    SET template_id = v_tpl_lower_b,
        notes = 'Deadlift-focused lower day — complements Wednesday squat focus so both lower sessions hit different primary patterns. Sandbag good mornings build the lower back endurance needed for the sandbag lunge station. In Phase 3 the SkiErg becomes a brick — ski straight into a run.'
    WHERE id = v_sat_am_id;
    RAISE NOTICE 'Saturday AM updated to Lower B. Template ID: %', v_tpl_lower_b;
  END IF;

END $$;
