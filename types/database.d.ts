export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _cardio_merge_backup_2026_08_09: {
        Row: {
          id: string | null
          metric_type: string | null
          name: string | null
          sets_json: Json | null
          source_table: string | null
        }
        Insert: {
          id?: string | null
          metric_type?: string | null
          name?: string | null
          sets_json?: Json | null
          source_table?: string | null
        }
        Update: {
          id?: string | null
          metric_type?: string | null
          name?: string | null
          sets_json?: Json | null
          source_table?: string | null
        }
        Relationships: []
      }
      app_errors: {
        Row: {
          build: string | null
          code: string | null
          created_at: string
          detail: string | null
          env: string | null
          frame: string | null
          id: string
          kind: string
          page: string | null
          role: string | null
          tag: string
          user_id: string
        }
        Insert: {
          build?: string | null
          code?: string | null
          created_at?: string
          detail?: string | null
          env?: string | null
          frame?: string | null
          id?: string
          kind: string
          page?: string | null
          role?: string | null
          tag: string
          user_id?: string
        }
        Update: {
          build?: string | null
          code?: string | null
          created_at?: string
          detail?: string | null
          env?: string | null
          frame?: string | null
          id?: string
          kind?: string
          page?: string | null
          role?: string | null
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      client_1rms: {
        Row: {
          client_id: string
          created_at: string | null
          exercise_id: string | null
          exercise_name: string
          id: string
          one_rm_kg: number
          recorded_at: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          exercise_id?: string | null
          exercise_name: string
          id?: string
          one_rm_kg: number
          recorded_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          exercise_id?: string | null
          exercise_name?: string
          id?: string
          one_rm_kg?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_1rms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_1rms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_1rms_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      client_check_ins: {
        Row: {
          client_id: string
          coach_reply: string | null
          created_at: string
          energy: number | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sleep: number | null
          soreness: number | null
          stress: number | null
        }
        Insert: {
          client_id: string
          coach_reply?: string | null
          created_at?: string
          energy?: number | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sleep?: number | null
          soreness?: number | null
          stress?: number | null
        }
        Update: {
          client_id?: string
          coach_reply?: string | null
          created_at?: string
          energy?: number | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sleep?: number | null
          soreness?: number | null
          stress?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_check_ins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_check_ins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_check_ins_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_program_blocks: {
        Row: {
          assigned_at: string
          client_id: string
          created_at: string
          ended_at: string
          ended_reason: string | null
          id: string
          planned_weeks: number | null
          program_id: string | null
          program_name: string
          source_client_program_id: string | null
          start_date: string | null
        }
        Insert: {
          assigned_at: string
          client_id: string
          created_at?: string
          ended_at?: string
          ended_reason?: string | null
          id?: string
          planned_weeks?: number | null
          program_id?: string | null
          program_name: string
          source_client_program_id?: string | null
          start_date?: string | null
        }
        Update: {
          assigned_at?: string
          client_id?: string
          created_at?: string
          ended_at?: string
          ended_reason?: string | null
          id?: string
          planned_weeks?: number | null
          program_id?: string | null
          program_name?: string
          source_client_program_id?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_program_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_program_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_program_blocks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_program_workouts: {
        Row: {
          client_program_id: string
          created_at: string | null
          id: string
          program_phase_workout_id: string
          week_number: number
          workout_template_id: string
        }
        Insert: {
          client_program_id: string
          created_at?: string | null
          id?: string
          program_phase_workout_id: string
          week_number?: number
          workout_template_id: string
        }
        Update: {
          client_program_id?: string
          created_at?: string | null
          id?: string
          program_phase_workout_id?: string
          week_number?: number
          workout_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_program_workouts_client_program_id_fkey"
            columns: ["client_program_id"]
            isOneToOne: false
            referencedRelation: "client_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_program_workouts_program_phase_workout_id_fkey"
            columns: ["program_phase_workout_id"]
            isOneToOne: false
            referencedRelation: "program_phase_workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_program_workouts_workout_template_id_fkey"
            columns: ["workout_template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_programs: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          program_id: string
          start_date: string | null
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          program_id: string
          start_date?: string | null
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          program_id?: string
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_programs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_programs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          coach_id: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          goal_weight_kg: number | null
          height_cm: number | null
          id: string
          invited_at: string | null
          notes: string | null
          phone: string | null
          starting_weight_kg: number | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          goal_weight_kg?: number | null
          height_cm?: number | null
          id?: string
          invited_at?: string | null
          notes?: string | null
          phone?: string | null
          starting_weight_kg?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          goal_weight_kg?: number | null
          height_cm?: number | null
          id?: string
          invited_at?: string | null
          notes?: string | null
          phone?: string | null
          starting_weight_kg?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_branding: {
        Row: {
          business_name: string | null
          coach_id: string
          created_at: string | null
          logo_path: string | null
          updated_at: string | null
        }
        Insert: {
          business_name?: string | null
          coach_id: string
          created_at?: string | null
          logo_path?: string | null
          updated_at?: string | null
        }
        Update: {
          business_name?: string | null
          coach_id?: string
          created_at?: string | null
          logo_path?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string
          date: string
          id: string
          is_pt_assigned: boolean | null
          notes: string | null
          title: string
          type: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by: string
          date: string
          id?: string
          is_pt_assigned?: boolean | null
          notes?: string | null
          title: string
          type?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string
          date?: string
          id?: string
          is_pt_assigned?: boolean | null
          notes?: string | null
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string | null
          coach_id: string
          created_at: string | null
          default_reps: number | null
          default_sets: number | null
          id: string
          is_archived: boolean
          is_personal: boolean
          metric_type: string
          muscle_group: string | null
          muscle_groups: string[] | null
          name: string
          notes: string | null
          one_rm: number | null
        }
        Insert: {
          category?: string | null
          coach_id: string
          created_at?: string | null
          default_reps?: number | null
          default_sets?: number | null
          id?: string
          is_archived?: boolean
          is_personal?: boolean
          metric_type?: string
          muscle_group?: string | null
          muscle_groups?: string[] | null
          name: string
          notes?: string | null
          one_rm?: number | null
        }
        Update: {
          category?: string | null
          coach_id?: string
          created_at?: string | null
          default_reps?: number | null
          default_sets?: number | null
          id?: string
          is_archived?: boolean
          is_personal?: boolean
          metric_type?: string
          muscle_group?: string | null
          muscle_groups?: string[] | null
          name?: string
          notes?: string | null
          one_rm?: number | null
        }
        Relationships: []
      }
      goal_check_ins: {
        Row: {
          created_at: string | null
          created_by: string
          current_value: number | null
          date: string
          goal_id: string
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          current_value?: number | null
          date: string
          goal_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          current_value?: number | null
          date?: string
          goal_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_check_ins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_check_ins_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_milestones: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          goal_id: string
          id: string
          notes: string | null
          order: number | null
          target_date: string | null
          target_value: number | null
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          goal_id: string
          id?: string
          notes?: string | null
          order?: number | null
          target_date?: string | null
          target_value?: number | null
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          goal_id?: string
          id?: string
          notes?: string | null
          order?: number | null
          target_date?: string | null
          target_value?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_milestones_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string
          current_value: number | null
          description: string | null
          goal_type: string | null
          id: string
          metric_label: string | null
          metric_unit: string | null
          priority: number | null
          start_value: number | null
          status: string | null
          target_date: string | null
          target_value: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by: string
          current_value?: number | null
          description?: string | null
          goal_type?: string | null
          id?: string
          metric_label?: string | null
          metric_unit?: string | null
          priority?: number | null
          start_value?: number | null
          status?: string | null
          target_date?: string | null
          target_value?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string
          current_value?: number | null
          description?: string | null
          goal_type?: string | null
          id?: string
          metric_label?: string | null
          metric_unit?: string | null
          priority?: number | null
          start_value?: number | null
          status?: string | null
          target_date?: string | null
          target_value?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      logged_sessions: {
        Row: {
          client_id: string | null
          created_at: string | null
          date: string
          exercises: Json | null
          id: string
          name: string | null
          session_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          date: string
          exercises?: Json | null
          id?: string
          name?: string | null
          session_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          date?: string
          exercises?: Json | null
          id?: string
          name?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logged_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logged_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "logged_sessions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_logs: {
        Row: {
          category: string
          client_id: string
          created_at: string | null
          date: string
          id: string
          logged_by: string
          name: string
          notes: string | null
          unit: string
          value: number
        }
        Insert: {
          category: string
          client_id: string
          created_at?: string | null
          date: string
          id?: string
          logged_by: string
          name: string
          notes?: string | null
          unit: string
          value: number
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string | null
          date?: string
          id?: string
          logged_by?: string
          name?: string
          notes?: string | null
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "performance_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cardio_distance_unit: string
          consent_policy_version: string | null
          consented_at: string | null
          created_at: string | null
          full_name: string | null
          id: string
          jump_height_unit: string
          role: string
          solo_only: boolean
          starter_seeded: boolean
          updated_at: string | null
          weekly_session_target: number | null
          weight_unit: string
        }
        Insert: {
          avatar_url?: string | null
          cardio_distance_unit?: string
          consent_policy_version?: string | null
          consented_at?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          jump_height_unit?: string
          role?: string
          solo_only?: boolean
          starter_seeded?: boolean
          updated_at?: string | null
          weekly_session_target?: number | null
          weight_unit?: string
        }
        Update: {
          avatar_url?: string | null
          cardio_distance_unit?: string
          consent_policy_version?: string | null
          consented_at?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          jump_height_unit?: string
          role?: string
          solo_only?: boolean
          starter_seeded?: boolean
          updated_at?: string | null
          weekly_session_target?: number | null
          weight_unit?: string
        }
        Relationships: []
      }
      program_phase_workouts: {
        Row: {
          day_label: string
          day_of_week: number | null
          id: string
          notes: string | null
          order_index: number
          phase_id: string
          session_order: number
          template_id: string | null
          tier: string | null
          week_number: number
        }
        Insert: {
          day_label: string
          day_of_week?: number | null
          id?: string
          notes?: string | null
          order_index?: number
          phase_id: string
          session_order?: number
          template_id?: string | null
          tier?: string | null
          week_number?: number
        }
        Update: {
          day_label?: string
          day_of_week?: number | null
          id?: string
          notes?: string | null
          order_index?: number
          phase_id?: string
          session_order?: number
          template_id?: string | null
          tier?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_phase_workouts_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "program_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_phase_workouts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      program_phases: {
        Row: {
          duration_weeks: number
          id: string
          name: string
          order_index: number
          periodization_config: Json | null
          periodization_type: string | null
          program_id: string
        }
        Insert: {
          duration_weeks?: number
          id?: string
          name: string
          order_index?: number
          periodization_config?: Json | null
          periodization_type?: string | null
          program_id: string
        }
        Update: {
          duration_weeks?: number
          id?: string
          name?: string
          order_index?: number
          periodization_config?: Json | null
          periodization_type?: string | null
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_phases_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string | null
          id: string
          is_personal: boolean
          name: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean
          name: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_exercises: {
        Row: {
          amrap: boolean | null
          countdown_seconds: number | null
          distance_m: number | null
          duration_seconds: number | null
          effort_max: number | null
          effort_min: number | null
          effort_type: string | null
          exercise_id: string
          id: string
          intensity_max: number | null
          intensity_min: number | null
          load_type: string | null
          load_value: number | null
          notes: string | null
          one_rm: number | null
          order: number
          reps_max: number | null
          reps_max_target: number | null
          reps_min: number | null
          reps_min_target: number | null
          rest_max_seconds: number | null
          rest_min_seconds: number | null
          rest_seconds: number | null
          session_id: string
          sets: number | null
          tempo: string | null
          timed: boolean | null
          unilateral: boolean | null
          weight_label: string | null
        }
        Insert: {
          amrap?: boolean | null
          countdown_seconds?: number | null
          distance_m?: number | null
          duration_seconds?: number | null
          effort_max?: number | null
          effort_min?: number | null
          effort_type?: string | null
          exercise_id: string
          id?: string
          intensity_max?: number | null
          intensity_min?: number | null
          load_type?: string | null
          load_value?: number | null
          notes?: string | null
          one_rm?: number | null
          order?: number
          reps_max?: number | null
          reps_max_target?: number | null
          reps_min?: number | null
          reps_min_target?: number | null
          rest_max_seconds?: number | null
          rest_min_seconds?: number | null
          rest_seconds?: number | null
          session_id: string
          sets?: number | null
          tempo?: string | null
          timed?: boolean | null
          unilateral?: boolean | null
          weight_label?: string | null
        }
        Update: {
          amrap?: boolean | null
          countdown_seconds?: number | null
          distance_m?: number | null
          duration_seconds?: number | null
          effort_max?: number | null
          effort_min?: number | null
          effort_type?: string | null
          exercise_id?: string
          id?: string
          intensity_max?: number | null
          intensity_min?: number | null
          load_type?: string | null
          load_value?: number | null
          notes?: string | null
          one_rm?: number | null
          order?: number
          reps_max?: number | null
          reps_max_target?: number | null
          reps_min?: number | null
          reps_min_target?: number | null
          rest_max_seconds?: number | null
          rest_min_seconds?: number | null
          rest_seconds?: number | null
          session_id?: string
          sets?: number | null
          tempo?: string | null
          timed?: boolean | null
          unilateral?: boolean | null
          weight_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string | null
          estimated_duration_minutes: number | null
          id: string
          name: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          name: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          name?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          body_fat_pct: number | null
          client_id: string
          created_at: string | null
          date: string
          id: string
          notes: string | null
          resting_hr: number | null
          weight_kg: number
        }
        Insert: {
          body_fat_pct?: number | null
          client_id: string
          created_at?: string | null
          date: string
          id?: string
          notes?: string | null
          resting_hr?: number | null
          weight_kg: number
        }
        Update: {
          body_fat_pct?: number | null
          client_id?: string
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          resting_hr?: number | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
        ]
      }
      workout_log_exercises: {
        Row: {
          client_notes: string | null
          exercise_id: string | null
          exercise_name: string
          exercise_type: string | null
          id: string
          log_id: string
          metric_type: string
          notes: string | null
          order_index: number | null
          reps: number | null
          sets_completed: number | null
          weight_kg: number | null
        }
        Insert: {
          client_notes?: string | null
          exercise_id?: string | null
          exercise_name: string
          exercise_type?: string | null
          id?: string
          log_id: string
          metric_type?: string
          notes?: string | null
          order_index?: number | null
          reps?: number | null
          sets_completed?: number | null
          weight_kg?: number | null
        }
        Update: {
          client_notes?: string | null
          exercise_id?: string | null
          exercise_name?: string
          exercise_type?: string | null
          id?: string
          log_id?: string
          metric_type?: string
          notes?: string | null
          order_index?: number | null
          reps?: number | null
          sets_completed?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_log_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_log_exercises_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_log_sets: {
        Row: {
          amrap: boolean | null
          avg_hr: number | null
          avg_watts: number | null
          countdown_seconds: number | null
          created_at: string | null
          distance_m: number | null
          duration_seconds: number | null
          effort_type: string | null
          effort_value: number | null
          height_cm: number | null
          id: string
          intensity_max: number | null
          intensity_min: number | null
          max_hr: number | null
          notes: string | null
          pace_500m_secs: number | null
          phase: string | null
          reps_achieved: number | null
          reps_left: number | null
          reps_right: number | null
          rest_max_seconds: number | null
          rest_min_seconds: number | null
          set_number: number
          set_type: string | null
          side: string | null
          stroke_rate_spm: number | null
          tempo: string | null
          timed: boolean | null
          unilateral: boolean | null
          weight_kg: number | null
          weight_label: string | null
          workout_log_exercise_id: string
        }
        Insert: {
          amrap?: boolean | null
          avg_hr?: number | null
          avg_watts?: number | null
          countdown_seconds?: number | null
          created_at?: string | null
          distance_m?: number | null
          duration_seconds?: number | null
          effort_type?: string | null
          effort_value?: number | null
          height_cm?: number | null
          id?: string
          intensity_max?: number | null
          intensity_min?: number | null
          max_hr?: number | null
          notes?: string | null
          pace_500m_secs?: number | null
          phase?: string | null
          reps_achieved?: number | null
          reps_left?: number | null
          reps_right?: number | null
          rest_max_seconds?: number | null
          rest_min_seconds?: number | null
          set_number: number
          set_type?: string | null
          side?: string | null
          stroke_rate_spm?: number | null
          tempo?: string | null
          timed?: boolean | null
          unilateral?: boolean | null
          weight_kg?: number | null
          weight_label?: string | null
          workout_log_exercise_id: string
        }
        Update: {
          amrap?: boolean | null
          avg_hr?: number | null
          avg_watts?: number | null
          countdown_seconds?: number | null
          created_at?: string | null
          distance_m?: number | null
          duration_seconds?: number | null
          effort_type?: string | null
          effort_value?: number | null
          height_cm?: number | null
          id?: string
          intensity_max?: number | null
          intensity_min?: number | null
          max_hr?: number | null
          notes?: string | null
          pace_500m_secs?: number | null
          phase?: string | null
          reps_achieved?: number | null
          reps_left?: number | null
          reps_right?: number | null
          rest_max_seconds?: number | null
          rest_min_seconds?: number | null
          set_number?: number
          set_type?: string | null
          side?: string | null
          stroke_rate_spm?: number | null
          tempo?: string | null
          timed?: boolean | null
          unilateral?: boolean | null
          weight_kg?: number | null
          weight_label?: string | null
          workout_log_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_log_sets_exercise_id_fkey"
            columns: ["workout_log_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_log_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string | null
          date: string
          duration_minutes: number | null
          id: string
          name: string
          notes: string | null
          template_id: string | null
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string | null
          date?: string
          duration_minutes?: number | null
          id?: string
          name: string
          notes?: string | null
          template_id?: string | null
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string | null
          date?: string
          duration_minutes?: number | null
          id?: string
          name?: string
          notes?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_template_exercises: {
        Row: {
          exercise_id: string | null
          exercise_name: string
          exercise_type: string | null
          id: string
          metric_type: string
          notes: string | null
          one_rm_kg: number | null
          order_index: number | null
          reps: number | null
          rest_seconds: number | null
          sets: number | null
          sets_json: Json | null
          superset_group: string | null
          template_id: string
          weight_kg: number | null
        }
        Insert: {
          exercise_id?: string | null
          exercise_name: string
          exercise_type?: string | null
          id?: string
          metric_type?: string
          notes?: string | null
          one_rm_kg?: number | null
          order_index?: number | null
          reps?: number | null
          rest_seconds?: number | null
          sets?: number | null
          sets_json?: Json | null
          superset_group?: string | null
          template_id: string
          weight_kg?: number | null
        }
        Update: {
          exercise_id?: string | null
          exercise_name?: string
          exercise_type?: string | null
          id?: string
          metric_type?: string
          notes?: string | null
          one_rm_kg?: number | null
          order_index?: number | null
          reps?: number | null
          rest_seconds?: number | null
          sets?: number | null
          sets_json?: Json | null
          superset_group?: string | null
          template_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_template_exercises_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          client_id: string | null
          coach_id: string
          created_at: string | null
          description: string | null
          family_id: string | null
          generated_from_phase_id: string | null
          id: string
          is_personal: boolean
          name: string
          notes: string | null
          program_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string | null
          description?: string | null
          family_id?: string | null
          generated_from_phase_id?: string | null
          id?: string
          is_personal?: boolean
          name: string
          notes?: string | null
          program_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string | null
          description?: string | null
          family_id?: string | null
          generated_from_phase_id?: string | null
          id?: string
          is_personal?: boolean
          name?: string
          notes?: string | null
          program_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_client_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "workout_templates_generated_from_phase_id_fkey"
            columns: ["generated_from_phase_id"]
            isOneToOne: false
            referencedRelation: "program_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_templates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      coach_client_summary: {
        Row: {
          check_in_energy: number | null
          check_in_sleep: number | null
          check_in_soreness: number | null
          check_in_stress: number | null
          client_id: string | null
          created_at: string | null
          full_name: string | null
          invited_at: string | null
          last_check_in_at: string | null
          last_session_date: string | null
          last_weigh_in_date: string | null
          next_program_start: string | null
          program_id: string | null
          program_name: string | null
          program_start: string | null
          program_weeks: number | null
          sessions_28d: number | null
          sessions_7d: number | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_program: {
        Args: {
          p_client_id: string
          p_program_id: string
          p_restart?: boolean
          p_start_date?: string
          p_today?: string
        }
        Returns: Json
      }
      client_may_delete_log: { Args: { p_log_id: string }; Returns: boolean }
      client_may_delete_log_exercise: {
        Args: { p_exercise_id: string }
        Returns: boolean
      }
      delete_current_user: { Args: never; Returns: undefined }
      mock_openapi: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
