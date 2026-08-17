/* eslint-disable */
// AUTO-GENERATED — DO NOT EDIT
// Run migrations to regenerate.

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
      challenges: {
        Row: {
          created_at: string
          id: string
          name: string
          number_of_weeks: number
          reward_per_workout: number
          start_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          number_of_weeks?: number
          reward_per_workout?: number
          start_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          number_of_weeks?: number
          reward_per_workout?: number
          start_date?: string
        }
        Relationships: []
      }
      private_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          answered_questions_at: string | null
          avatar_url: string | null
          created_at: string
          current_workouts_per_week: string | null
          email: string | null
          id: string
          installed_at: string | null
          last_seen_at: string | null
          name: string | null
          onboarding_completed: boolean
        }
        Insert: {
          answered_questions_at?: string | null
          avatar_url?: string | null
          created_at?: string
          current_workouts_per_week?: string | null
          email?: string | null
          id: string
          installed_at?: string | null
          last_seen_at?: string | null
          name?: string | null
          onboarding_completed?: boolean
        }
        Update: {
          answered_questions_at?: string | null
          avatar_url?: string | null
          created_at?: string
          current_workouts_per_week?: string | null
          email?: string | null
          id?: string
          installed_at?: string | null
          last_seen_at?: string | null
          name?: string | null
          onboarding_completed?: boolean
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_sent_on: string | null
          p256dh: string
          time_zone: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_sent_on?: string | null
          p256dh: string
          time_zone?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_sent_on?: string | null
          p256dh?: string
          time_zone?: string
          user_id?: string
        }
        Relationships: []
      }
      user_challenges: {
        Row: {
          capi_purchase_sent_at: string | null
          challenge_id: string
          challenge_status: string
          client_ip: string | null
          client_user_agent: string | null
          created_at: string
          currency: string
          ends_at: string
          fbc: string | null
          fbp: string | null
          goal_workouts_per_week: number
          id: string
          payment_status: string
          started_at: string
          stripe_payment_intent_id: string | null
          time_zone: string
          user_id: string
        }
        Insert: {
          capi_purchase_sent_at?: string | null
          challenge_id: string
          challenge_status?: string
          client_ip?: string | null
          client_user_agent?: string | null
          created_at?: string
          currency?: string
          ends_at: string
          fbc?: string | null
          fbp?: string | null
          goal_workouts_per_week: number
          id?: string
          payment_status?: string
          started_at?: string
          stripe_payment_intent_id?: string | null
          time_zone?: string
          user_id: string
        }
        Update: {
          capi_purchase_sent_at?: string | null
          challenge_id?: string
          challenge_status?: string
          client_ip?: string | null
          client_user_agent?: string | null
          created_at?: string
          currency?: string
          ends_at?: string
          fbc?: string | null
          fbp?: string | null
          goal_workouts_per_week?: number
          id?: string
          payment_status?: string
          started_at?: string
          stripe_payment_intent_id?: string | null
          time_zone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          campaign: string | null
          first_seen_at: string
          is_in_app_browser: boolean
          is_standalone: boolean
          landed_at: string | null
          last_seen_at: string
          reached_install_at: string | null
          reached_signup_at: string | null
          referrer_host: string | null
          signed_up_at: string | null
          source: string | null
          tapped_join_at: string | null
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          campaign?: string | null
          first_seen_at?: string
          is_in_app_browser?: boolean
          is_standalone?: boolean
          landed_at?: string | null
          last_seen_at?: string
          reached_install_at?: string | null
          reached_signup_at?: string | null
          referrer_host?: string | null
          signed_up_at?: string | null
          source?: string | null
          tapped_join_at?: string | null
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          campaign?: string | null
          first_seen_at?: string
          is_in_app_browser?: boolean
          is_standalone?: boolean
          landed_at?: string | null
          last_seen_at?: string
          reached_install_at?: string | null
          reached_signup_at?: string | null
          referrer_host?: string | null
          signed_up_at?: string | null
          source?: string | null
          tapped_join_at?: string | null
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      workout_submissions: {
        Row: {
          captured_at: string
          created_at: string
          id: string
          latitude: number | null
          location_accuracy_m: number | null
          location_status: string
          longitude: number | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          user_challenge_id: string
          user_id: string
        }
        Insert: {
          captured_at: string
          created_at?: string
          id?: string
          latitude?: number | null
          location_accuracy_m?: number | null
          location_status?: string
          longitude?: number | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          user_challenge_id: string
          user_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          id?: string
          latitude?: number | null
          location_accuracy_m?: number | null
          location_status?: string
          longitude?: number | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          user_challenge_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_submissions_user_challenge_id_fkey"
            columns: ["user_challenge_id"]
            isOneToOne: false
            referencedRelation: "user_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_funnel_rows: {
        Args: { p_since: string }
        Returns: {
          answered: boolean
          currency: string
          email: string
          goal: number
          has_challenge: boolean
          has_device: boolean
          installed_at: string
          last_seen_at: string
          last_sign_in_at: string
          payment_status: string
          signed_up_at: string
          submissions: number
          time_zone: string
          user_id: string
          verified: number
        }[]
      }
      claim_push_device: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_time_zone: string
        }
        Returns: undefined
      }
      mark_app_open: { Args: { p_standalone: boolean }; Returns: undefined }
      mark_questions_answered: { Args: never; Returns: undefined }
      record_visit: {
        Args: {
          p_campaign?: string
          p_in_app?: boolean
          p_referrer?: string
          p_source?: string
          p_standalone?: boolean
          p_step: string
          p_visitor: string
        }
        Returns: undefined
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
