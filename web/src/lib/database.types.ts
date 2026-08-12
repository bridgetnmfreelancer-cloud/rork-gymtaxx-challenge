/**
 * Database shape, mirroring `backend/types.ts`.
 *
 * Kept as a local copy because the web app builds from `web/` and cannot reach
 * outside its own root. If a migration changes the schema, regenerate
 * `backend/types.ts` and copy the `Database` type across.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      challenges: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          number_of_weeks: number;
          reward_per_workout: number;
          start_date: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          number_of_weeks?: number;
          reward_per_workout?: number;
          start_date?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          number_of_weeks?: number;
          reward_per_workout?: number;
          start_date?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          current_workouts_per_week: string | null;
          email: string | null;
          id: string;
          name: string | null;
          onboarding_completed: boolean;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          current_workouts_per_week?: string | null;
          email?: string | null;
          id: string;
          name?: string | null;
          onboarding_completed?: boolean;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          current_workouts_per_week?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          onboarding_completed?: boolean;
        };
        Relationships: [];
      };
      user_challenges: {
        Row: {
          challenge_id: string;
          challenge_status: string;
          created_at: string;
          currency: string;
          ends_at: string;
          goal_workouts_per_week: number;
          id: string;
          payment_status: string;
          started_at: string;
          stripe_payment_intent_id: string | null;
          time_zone: string;
          user_id: string;
        };
        Insert: {
          challenge_id: string;
          challenge_status?: string;
          created_at?: string;
          currency?: string;
          ends_at: string;
          goal_workouts_per_week: number;
          id?: string;
          payment_status?: string;
          started_at?: string;
          stripe_payment_intent_id?: string | null;
          time_zone?: string;
          user_id: string;
        };
        Update: {
          challenge_id?: string;
          challenge_status?: string;
          created_at?: string;
          currency?: string;
          ends_at?: string;
          goal_workouts_per_week?: number;
          id?: string;
          payment_status?: string;
          started_at?: string;
          stripe_payment_intent_id?: string | null;
          time_zone?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_challenges_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_submissions: {
        Row: {
          captured_at: string;
          created_at: string;
          id: string;
          latitude: number | null;
          location_accuracy_m: number | null;
          location_status: string;
          longitude: number | null;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          storage_path: string;
          user_challenge_id: string;
          user_id: string;
        };
        Insert: {
          captured_at: string;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          location_accuracy_m?: number | null;
          location_status?: string;
          longitude?: number | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          storage_path: string;
          user_challenge_id: string;
          user_id: string;
        };
        Update: {
          captured_at?: string;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          location_accuracy_m?: number | null;
          location_status?: string;
          longitude?: number | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          storage_path?: string;
          user_challenge_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_submissions_user_challenge_id_fkey";
            columns: ["user_challenge_id"];
            isOneToOne: false;
            referencedRelation: "user_challenges";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ChallengeRow = Database["public"]["Tables"]["challenges"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type UserChallengeRow = Database["public"]["Tables"]["user_challenges"]["Row"];
export type WorkoutSubmissionRow = Database["public"]["Tables"]["workout_submissions"]["Row"];
