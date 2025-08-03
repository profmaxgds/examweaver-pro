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
      classes: {
        Row: {
          author_id: string
          created_at: string
          description: string | null
          id: string
          institution_header_id: string | null
          name: string
          semester: number | null
          updated_at: string
          year: number | null
        }
        Insert: {
          author_id: string
          created_at?: string
          description?: string | null
          id?: string
          institution_header_id?: string | null
          name: string
          semester?: number | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          author_id?: string
          created_at?: string
          description?: string | null
          id?: string
          institution_header_id?: string | null
          name?: string
          semester?: number | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_institution_header_id_fkey"
            columns: ["institution_header_id"]
            isOneToOne: false
            referencedRelation: "exam_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections: {
        Row: {
          answers: Json
          auto_corrected: boolean | null
          confidence_score: number | null
          created_at: string
          exam_id: string
          id: string
          image_url: string | null
          manual_review: boolean | null
          ocr_data: Json | null
          score: number
          status: Database["public"]["Enums"]["correction_status"] | null
          student_id: string | null
          student_name: string
          updated_at: string
          version: number | null
        }
        Insert: {
          answers: Json
          auto_corrected?: boolean | null
          confidence_score?: number | null
          created_at?: string
          exam_id: string
          id?: string
          image_url?: string | null
          manual_review?: boolean | null
          ocr_data?: Json | null
          score?: number
          status?: Database["public"]["Enums"]["correction_status"] | null
          student_id?: string | null
          student_name: string
          updated_at?: string
          version?: number | null
        }
        Update: {
          answers?: Json
          auto_corrected?: boolean | null
          confidence_score?: number | null
          created_at?: string
          exam_id?: string
          id?: string
          image_url?: string | null
          manual_review?: boolean | null
          ocr_data?: Json | null
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
      credit_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_name: string
          setting_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_name: string
          setting_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_name?: string
          setting_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          admin_id: string | null
          amount: number
          correction_id: string | null
          created_at: string
          description: string | null
          id: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          amount: number
          correction_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          transaction_type: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          correction_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      exam_corrections: {
        Row: {
          answers: Json
          author_id: string
          auto_corrected: boolean | null
          correction_date: string
          created_at: string
          exam_id: string
          id: string
          image_url: string | null
          max_score: number
          percentage: number
          qr_code_data: string | null
          score: number
          student_id: string | null
          student_identification: string | null
          student_name: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          author_id: string
          auto_corrected?: boolean | null
          correction_date?: string
          created_at?: string
          exam_id: string
          id?: string
          image_url?: string | null
          max_score?: number
          percentage?: number
          qr_code_data?: string | null
          score?: number
          student_id?: string | null
          student_identification?: string | null
          student_name?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          author_id?: string
          auto_corrected?: boolean | null
          correction_date?: string
          created_at?: string
          exam_id?: string
          id?: string
          image_url?: string | null
          max_score?: number
          percentage?: number
          qr_code_data?: string | null
          score?: number
          student_id?: string | null
          student_identification?: string | null
          student_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_corrections_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          correction_template: Json | null
          created_at: string
          exam_date: string | null
          generation_mode: string | null
          grade_scale: Json | null
          header: Json | null
          header_id: string | null
          id: string
          institutions: string | null
          instructions: string | null
          layout: string | null
          professor_name: string | null
          qr_code_data: string | null
          qr_enabled: boolean | null
          question_ids: string[]
          shuffle_options: boolean | null
          shuffle_questions: boolean | null
          students: Json | null
          subject: string
          target_class_id: string | null
          time_limit: number | null
          title: string
          total_points: number
          updated_at: string
          versions: number | null
        }
        Insert: {
          answer_sheet?: Json | null
          author_id: string
          correction_template?: Json | null
          created_at?: string
          exam_date?: string | null
          generation_mode?: string | null
          grade_scale?: Json | null
          header?: Json | null
          header_id?: string | null
          id?: string
          institutions?: string | null
          instructions?: string | null
          layout?: string | null
          professor_name?: string | null
          qr_code_data?: string | null
          qr_enabled?: boolean | null
          question_ids: string[]
          shuffle_options?: boolean | null
          shuffle_questions?: boolean | null
          students?: Json | null
          subject: string
          target_class_id?: string | null
          time_limit?: number | null
          title: string
          total_points?: number
          updated_at?: string
          versions?: number | null
        }
        Update: {
          answer_sheet?: Json | null
          author_id?: string
          correction_template?: Json | null
          created_at?: string
          exam_date?: string | null
          generation_mode?: string | null
          grade_scale?: Json | null
          header?: Json | null
          header_id?: string | null
          id?: string
          institutions?: string | null
          instructions?: string | null
          layout?: string | null
          professor_name?: string | null
          qr_code_data?: string | null
          qr_enabled?: boolean | null
          question_ids?: string[]
          shuffle_options?: boolean | null
          shuffle_questions?: boolean | null
          students?: Json | null
          subject?: string
          target_class_id?: string | null
          time_limit?: number | null
          title?: string
          total_points?: number
          updated_at?: string
          versions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_target_class_id_fkey"
            columns: ["target_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          author_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          file_name: string
          file_size: number
          file_type: string
          id: string
          public_url: string | null
          storage_path: string
        }
        Insert: {
          author_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          file_name: string
          file_size: number
          file_type: string
          id?: string
          public_url?: string | null
          storage_path: string
        }
        Update: {
          author_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          public_url?: string | null
          storage_path?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          credits: number | null
          email: string | null
          id: string
          institution: string | null
          is_professor: boolean | null
          last_login: string | null
          name: string
          pai_id: string | null
          registration_date: string | null
          status: string | null
          subjects: string[] | null
          theme_preference: string | null
          total_corrections: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number | null
          email?: string | null
          id?: string
          institution?: string | null
          is_professor?: boolean | null
          last_login?: string | null
          name: string
          pai_id?: string | null
          registration_date?: string | null
          status?: string | null
          subjects?: string[] | null
          theme_preference?: string | null
          total_corrections?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number | null
          email?: string | null
          id?: string
          institution?: string | null
          is_professor?: boolean | null
          last_login?: string | null
          name?: string
          pai_id?: string | null
          registration_date?: string | null
          status?: string | null
          subjects?: string[] | null
          theme_preference?: string | null
          total_corrections?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          text_lines: number | null
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
          text_lines?: number | null
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
          text_lines?: number | null
          title?: string
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          author_id: string
          data: Json
          exam_id: string | null
          generated_at: string
          id: string
          type: string
        }
        Insert: {
          author_id: string
          data?: Json
          exam_id?: string | null
          generated_at?: string
          id?: string
          type: string
        }
        Update: {
          author_id?: string
          data?: Json
          exam_id?: string | null
          generated_at?: string
          id?: string
          type?: string
        }
        Relationships: []
      }
      student_exams: {
        Row: {
          answer_key: Json
          author_id: string
          bubble_coordinates: Json | null
          created_at: string
          exam_id: string
          id: string
          shuffled_options_map: Json
          shuffled_question_ids: string[]
          student_id: string | null
          version_id: string | null
        }
        Insert: {
          answer_key: Json
          author_id: string
          bubble_coordinates?: Json | null
          created_at?: string
          exam_id: string
          id?: string
          shuffled_options_map: Json
          shuffled_question_ids: string[]
          student_id?: string | null
          version_id?: string | null
        }
        Update: {
          answer_key?: Json
          author_id?: string
          bubble_coordinates?: Json | null
          created_at?: string
          exam_id?: string
          id?: string
          shuffled_options_map?: Json
          shuffled_question_ids?: string[]
          student_id?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_exams_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_exams_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          author_id: string
          class_id: string | null
          course: string | null
          created_at: string
          email: string | null
          exam_id: string | null
          grade: number | null
          id: string
          institution_header_id: string | null
          name: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          class_id?: string | null
          course?: string | null
          created_at?: string
          email?: string | null
          exam_id?: string | null
          grade?: number | null
          id?: string
          institution_header_id?: string | null
          name: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          class_id?: string | null
          course?: string | null
          created_at?: string
          email?: string | null
          exam_id?: string | null
          grade?: number | null
          id?: string
          institution_header_id?: string | null
          name?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_institution_header_id_fkey"
            columns: ["institution_header_id"]
            isOneToOne: false
            referencedRelation: "exam_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          professor_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          professor_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          professor_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_credits: {
        Args: {
          user_uuid: string
          amount: number
          correction_type: string
          correction_id_param?: string
        }
        Returns: boolean
      }
      count_professor_corretors: {
        Args: { professor_uuid: string }
        Returns: number
      }
      get_credit_settings: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          setting_name: string
          setting_value: number
          description: string
        }[]
      }
      get_user_credits: {
        Args: { user_uuid: string }
        Returns: number
      }
      is_admin: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      is_admin_user: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      is_professor: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      update_credit_setting: {
        Args: { setting_name_param: string; new_value: number }
        Returns: boolean
      }
    }
    Enums: {
      correction_status: "pending" | "completed" | "pending_review"
      difficulty_level: "easy" | "medium" | "hard" | "custom"
      question_type: "multiple_choice" | "true_false" | "essay" | "fill_blanks"
      user_role: "admin" | "professor" | "corretor"
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
      user_role: ["admin", "professor", "corretor"],
    },
  },
} as const
