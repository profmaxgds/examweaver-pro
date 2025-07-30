export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      corrections: {
        Row: {
          answers: Json
          created_at: string
          exam_id: string
          id: string
          image_url: string | null
          score: number
          status: Database["public"]["Enums"]["correction_status"] | null
          student_id: string | null
          student_name: string
          updated_at: string
          version: number | null
        }
        Insert: {
          answers: Json
          created_at?: string
          exam_id: string
          id?: string
          image_url?: string | null
          score?: number
          status?: Database["public"]["Enums"]["correction_status"] | null
          student_id?: string | null
          student_name: string
          updated_at?: string
          version?: number | null
        }
        Update: {
          answers?: Json
          created_at?: string
          exam_id?: string
          id?: string
          image_url?: string | null
          score?: number
          status?: Database["public"]["Enums"]["correction_status"] | null
          student_id?: string | null
          student_name?: string
          updated_at?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "corrections_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_headers: {
        Row: {
          author_id: string
          content: Json
          created_at: string
          id: string
          institution: string
          is_default: boolean | null
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content?: Json
          created_at?: string
          id?: string
          institution: string
          is_default?: boolean | null
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: Json
          created_at?: string
          id?: string
          institution?: string
          is_default?: boolean | null
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      exams: {
        Row: {
          answer_sheet: Json | null
          author_id: string
          created_at: string
          exam_date: string | null
          header: Json | null
          id: string
          institution: string | null
          layout: string | null
          qr_code_data: string | null
          question_ids: string[]
          shuffle_options: boolean | null
          shuffle_questions: boolean | null
          students: Json | null
          subject: string
          title: string
          total_points: number
          updated_at: string
          versions: number | null
        }
        Insert: {
          answer_sheet?: Json | null
          author_id: string
          created_at?: string
          exam_date?: string | null
          header?: Json | null
          id?: string
          institution?: string | null
          layout?: string | null
          qr_code_data?: string | null
          question_ids: string[]
          shuffle_options?: boolean | null
          shuffle_questions?: boolean | null
          students?: Json | null
          subject: string
          title: string
          total_points?: number
          updated_at?: string
          versions?: number | null
        }
        Update: {
          answer_sheet?: Json | null
          author_id?: string
          created_at?: string
          exam_date?: string | null
          header?: Json | null
          id?: string
          institution?: string | null
          layout?: string | null
          qr_code_data?: string | null
          question_ids?: string[]
          shuffle_options?: boolean | null
          shuffle_questions?: boolean | null
          students?: Json | null
          subject?: string
          title?: string
          total_points?: number
          updated_at?: string
          versions?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          institution: string | null
          name: string
          subjects: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution?: string | null
          name: string
          subjects?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          institution?: string | null
          name?: string
          subjects?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          audio_urls: string[] | null
          author_id: string
          category: string | null
          content: Json
          correct_answer: Json
          created_at: string
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          id: string
          image_urls: string[] | null
          institution: string | null
          language: string | null
          options: Json | null
          points: number
          subject: string
          tags: string[] | null
          title: string
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          audio_urls?: string[] | null
          author_id: string
          category?: string | null
          content: Json
          correct_answer: Json
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          id?: string
          image_urls?: string[] | null
          institution?: string | null
          language?: string | null
          options?: Json | null
          points?: number
          subject: string
          tags?: string[] | null
          title: string
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          audio_urls?: string[] | null
          author_id?: string
          category?: string | null
          content?: Json
          correct_answer?: Json
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          id?: string
          image_urls?: string[] | null
          institution?: string | null
          language?: string | null
          options?: Json | null
          points?: number
          subject?: string
          tags?: string[] | null
          title?: string
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      correction_status: "pending" | "completed" | "pending_review"
      difficulty_level: "easy" | "medium" | "hard" | "custom"
      question_type: "multiple_choice" | "true_false" | "essay" | "fill_blanks"
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
    Enums: {
      correction_status: ["pending", "completed", "pending_review"],
      difficulty_level: ["easy", "medium", "hard", "custom"],
      question_type: ["multiple_choice", "true_false", "essay", "fill_blanks"],
    },
  },
} as const
