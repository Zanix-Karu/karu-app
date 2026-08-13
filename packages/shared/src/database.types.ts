// Generated from the local Supabase schema (matches migrations through 0019)
// via `supabase gen types typescript --local` on 2026-08-13. Regenerate after
// applying a migration — do not edit by hand.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      booking_counters: {
        Row: {
          counter: number
          day: string
        }
        Insert: {
          counter?: number
          day: string
        }
        Update: {
          counter?: number
          day?: string
        }
        Relationships: []
      }
      booking_message_reads: {
        Row: {
          booking_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          booking_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          booking_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_message_reads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_message_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_messages: {
        Row: {
          body: string
          booking_id: string
          created_at: string
          id: string
          redacted: boolean
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          body: string
          booking_id: string
          created_at?: string
          id?: string
          redacted?: boolean
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
          redacted?: boolean
          sender_id?: string
          sender_role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          confirmed_at: string | null
          created_at: string
          currency: string
          customer_id: string
          customer_note: string | null
          daily_rate_xaf: number
          delivery_address: string | null
          delivery_fee_xaf: number
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          deposit_xaf: number | null
          driver_fee_xaf: number
          end_date: string
          id: string
          pickup_location: string | null
          pickup_time: string | null
          reference: string | null
          requested_at: string
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          total_xaf: number
          updated_at: string
          vehicle_id: string
          vendor_id: string
          vendor_note: string | null
          with_driver: boolean
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          customer_note?: string | null
          daily_rate_xaf: number
          delivery_address?: string | null
          delivery_fee_xaf?: number
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          deposit_xaf?: number | null
          driver_fee_xaf?: number
          end_date: string
          id?: string
          pickup_location?: string | null
          pickup_time?: string | null
          reference?: string | null
          requested_at?: string
          start_date: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_xaf: number
          updated_at?: string
          vehicle_id: string
          vendor_id: string
          vendor_note?: string | null
          with_driver?: boolean
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          customer_note?: string | null
          daily_rate_xaf?: number
          delivery_address?: string | null
          delivery_fee_xaf?: number
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          deposit_xaf?: number | null
          driver_fee_xaf?: number
          end_date?: string
          id?: string
          pickup_location?: string | null
          pickup_time?: string | null
          reference?: string | null
          requested_at?: string
          start_date?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_xaf?: number
          updated_at?: string
          vehicle_id?: string
          vendor_id?: string
          vendor_note?: string | null
          with_driver?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          booking_id: string | null
          created_at: string
          error: string | null
          id: string
          locale: string
          provider_id: string | null
          recipient: string
          status: string
          template: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          locale?: string
          provider_id?: string | null
          recipient: string
          status?: string
          template: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          locale?: string
          provider_id?: string | null
          recipient?: string
          status?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_xaf: number
          booking_id: string
          created_at: string
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_xaf: number
          booking_id: string
          created_at?: string
          id?: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_xaf?: number
          booking_id?: string
          created_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author_id: string
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          target: Database["public"]["Enums"]["review_target"]
        }
        Insert: {
          author_id: string
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          target: Database["public"]["Enums"]["review_target"]
        }
        Update: {
          author_id?: string
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          target?: Database["public"]["Enums"]["review_target"]
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          reason: string | null
          start_date: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_blocks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          category: Database["public"]["Enums"]["vehicle_category"]
          city: Database["public"]["Enums"]["city"]
          created_at: string
          daily_rate_xaf: number
          description: string | null
          driver_daily_rate_xaf: number | null
          driver_option: Database["public"]["Enums"]["driver_option"]
          fuel_type: Database["public"]["Enums"]["fuel_type"] | null
          id: string
          make: string
          model: string
          monthly_rate_xaf: number | null
          photo_angles: Json
          photos: string[]
          pickup_locations: string[]
          registration_number: string | null
          seats: number | null
          status: Database["public"]["Enums"]["vehicle_status"]
          transmission: Database["public"]["Enums"]["transmission"]
          updated_at: string
          vendor_id: string
          weekly_rate_xaf: number | null
          year: number | null
        }
        Insert: {
          category: Database["public"]["Enums"]["vehicle_category"]
          city: Database["public"]["Enums"]["city"]
          created_at?: string
          daily_rate_xaf: number
          description?: string | null
          driver_daily_rate_xaf?: number | null
          driver_option?: Database["public"]["Enums"]["driver_option"]
          fuel_type?: Database["public"]["Enums"]["fuel_type"] | null
          id?: string
          make: string
          model: string
          monthly_rate_xaf?: number | null
          photo_angles?: Json
          photos?: string[]
          pickup_locations?: string[]
          registration_number?: string | null
          seats?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          transmission?: Database["public"]["Enums"]["transmission"]
          updated_at?: string
          vendor_id: string
          weekly_rate_xaf?: number | null
          year?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["vehicle_category"]
          city?: Database["public"]["Enums"]["city"]
          created_at?: string
          daily_rate_xaf?: number
          description?: string | null
          driver_daily_rate_xaf?: number | null
          driver_option?: Database["public"]["Enums"]["driver_option"]
          fuel_type?: Database["public"]["Enums"]["fuel_type"] | null
          id?: string
          make?: string
          model?: string
          monthly_rate_xaf?: number | null
          photo_angles?: Json
          photos?: string[]
          pickup_locations?: string[]
          registration_number?: string | null
          seats?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          transmission?: Database["public"]["Enums"]["transmission"]
          updated_at?: string
          vendor_id?: string
          weekly_rate_xaf?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_documents: {
        Row: {
          created_at: string
          expires_at: string | null
          file_path: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["document_status"]
          type: Database["public"]["Enums"]["document_type"]
          vehicle_id: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          file_path: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          type: Database["public"]["Enums"]["document_type"]
          vehicle_id?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          file_path?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          type?: Database["public"]["Enums"]["document_type"]
          vehicle_id?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          airport_fee_xaf: number | null
          business_name: string
          city: Database["public"]["Enums"]["city"]
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          declaration_accepted_at: string | null
          delivery_fee_xaf: number | null
          id: string
          profile_id: string
          rccm_number: string | null
          status: Database["public"]["Enums"]["vendor_status"]
          updated_at: string
          verified_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          airport_fee_xaf?: number | null
          business_name: string
          city: Database["public"]["Enums"]["city"]
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          declaration_accepted_at?: string | null
          delivery_fee_xaf?: number | null
          id?: string
          profile_id: string
          rccm_number?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          updated_at?: string
          verified_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          airport_fee_xaf?: number | null
          business_name?: string
          city?: Database["public"]["Enums"]["city"]
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          declaration_accepted_at?: string | null
          delivery_fee_xaf?: number | null
          id?: string
          profile_id?: string
          rccm_number?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          updated_at?: string
          verified_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_vendor_id: { Args: never; Returns: string }
      next_booking_reference: { Args: never; Returns: string }
    }
    Enums: {
      booking_status:
        | "requested"
        | "confirmed"
        | "rejected"
        | "cancelled"
        | "in_progress"
        | "completed"
      city: "douala" | "yaounde" | "other"
      delivery_type: "pickup_point" | "airport" | "address"
      document_status: "pending" | "approved" | "rejected"
      document_type:
        | "rccm"
        | "carte_grise"
        | "insurance"
        | "roadworthiness"
        | "national_id"
        | "passport"
      driver_option: "none" | "optional" | "required"
      fuel_type: "petrol" | "diesel" | "hybrid" | "electric"
      payment_provider: "mtn_momo" | "orange_money" | "card" | "manual"
      payment_status: "pending" | "held" | "released" | "refunded" | "failed"
      review_target: "customer" | "vendor"
      transmission: "manual" | "automatic"
      user_role: "customer" | "vendor" | "admin"
      vehicle_category:
        | "economy"
        | "sedan"
        | "suv"
        | "pickup"
        | "van"
        | "luxury"
      vehicle_status: "draft" | "active" | "inactive"
      vendor_status: "pending" | "verified" | "rejected" | "suspended"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: [
        "requested",
        "confirmed",
        "rejected",
        "cancelled",
        "in_progress",
        "completed",
      ],
      city: ["douala", "yaounde", "other"],
      delivery_type: ["pickup_point", "airport", "address"],
      document_status: ["pending", "approved", "rejected"],
      document_type: [
        "rccm",
        "carte_grise",
        "insurance",
        "roadworthiness",
        "national_id",
        "passport",
      ],
      driver_option: ["none", "optional", "required"],
      fuel_type: ["petrol", "diesel", "hybrid", "electric"],
      payment_provider: ["mtn_momo", "orange_money", "card", "manual"],
      payment_status: ["pending", "held", "released", "refunded", "failed"],
      review_target: ["customer", "vendor"],
      transmission: ["manual", "automatic"],
      user_role: ["customer", "vendor", "admin"],
      vehicle_category: ["economy", "sedan", "suv", "pickup", "van", "luxury"],
      vehicle_status: ["draft", "active", "inactive"],
      vendor_status: ["pending", "verified", "rejected", "suspended"],
    },
  },
} as const

