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
      arrivals: {
        Row: {
          client_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["arrival_status"]
          ticket_number: string
          vehicle_id: string | null
        }
        Insert: {
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["arrival_status"]
          ticket_number: string
          vehicle_id?: string | null
        }
        Update: {
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["arrival_status"]
          ticket_number?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrivals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrivals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          reason: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          code: string
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      crushing_file_arrivals: {
        Row: {
          arrival_id: string
          created_at: string
          crushing_file_id: string
          gross_weight_kg: number | null
          id: string
          net_weight_kg: number | null
          position: number
          tare_weight_kg: number | null
        }
        Insert: {
          arrival_id: string
          created_at?: string
          crushing_file_id: string
          gross_weight_kg?: number | null
          id?: string
          net_weight_kg?: number | null
          position?: number
          tare_weight_kg?: number | null
        }
        Update: {
          arrival_id?: string
          created_at?: string
          crushing_file_id?: string
          gross_weight_kg?: number | null
          id?: string
          net_weight_kg?: number | null
          position?: number
          tare_weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crushing_file_arrivals_arrival_id_fkey"
            columns: ["arrival_id"]
            isOneToOne: true
            referencedRelation: "arrivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crushing_file_arrivals_crushing_file_id_fkey"
            columns: ["crushing_file_id"]
            isOneToOne: false
            referencedRelation: "crushing_files"
            referencedColumns: ["id"]
          },
        ]
      }
      crushing_files: {
        Row: {
          arrival_id: string | null
          assigned_line_id: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          estimated_wait_minutes: number | null
          gross_weight_kg: number | null
          id: string
          net_weight_kg: number | null
          notes: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          queue_position: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["crushing_status"]
          tare_weight_kg: number | null
          tracking_code: string
        }
        Insert: {
          arrival_id?: string | null
          assigned_line_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          estimated_wait_minutes?: number | null
          gross_weight_kg?: number | null
          id?: string
          net_weight_kg?: number | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          queue_position?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["crushing_status"]
          tare_weight_kg?: number | null
          tracking_code: string
        }
        Update: {
          arrival_id?: string | null
          assigned_line_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          estimated_wait_minutes?: number | null
          gross_weight_kg?: number | null
          id?: string
          net_weight_kg?: number | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          queue_position?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["crushing_status"]
          tare_weight_kg?: number | null
          tracking_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "crushing_files_arrival_id_fkey"
            columns: ["arrival_id"]
            isOneToOne: false
            referencedRelation: "arrivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crushing_files_assigned_line_id_fkey"
            columns: ["assigned_line_id"]
            isOneToOne: false
            referencedRelation: "crushing_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crushing_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      crushing_lines: {
        Row: {
          code: string
          created_at: string
          hourly_capacity_kg: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["line_status"]
        }
        Insert: {
          code: string
          created_at?: string
          hourly_capacity_kg?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["line_status"]
        }
        Update: {
          code?: string
          created_at?: string
          hourly_capacity_kg?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["line_status"]
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          crushing_file_id: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          notes: string | null
          paid: number
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          total: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          crushing_file_id?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          notes?: string | null
          paid?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          crushing_file_id?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          notes?: string | null
          paid?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_crushing_file_id_fkey"
            columns: ["crushing_file_id"]
            isOneToOne: false
            referencedRelation: "crushing_files"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          error: string | null
          id: string
          recipient: string
          reference_id: string | null
          reference_type: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template_code: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          recipient: string
          reference_id?: string | null
          reference_type?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_code?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          recipient?: string
          reference_id?: string | null
          reference_type?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_code?: string | null
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          code: string
          id: string
          is_active: boolean
          language: string
          subject: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          code: string
          id?: string
          is_active?: boolean
          language: string
          subject?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          code?: string
          id?: string
          is_active?: boolean
          language?: string
          subject?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_by: string | null
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_by?: string | null
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      production_records: {
        Row: {
          created_at: string
          created_by: string | null
          crushing_file_id: string
          duration_minutes: number | null
          id: string
          input_kg: number
          line_id: string | null
          losses_kg: number
          notes: string | null
          oil_kg: number
          operator_ids: string[]
          pomace_kg: number
          yield_percent: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          crushing_file_id: string
          duration_minutes?: number | null
          id?: string
          input_kg?: number
          line_id?: string | null
          losses_kg?: number
          notes?: string | null
          oil_kg?: number
          operator_ids?: string[]
          pomace_kg?: number
          yield_percent?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          crushing_file_id?: string
          duration_minutes?: number | null
          id?: string
          input_kg?: number
          line_id?: string | null
          losses_kg?: number
          notes?: string | null
          oil_kg?: number
          operator_ids?: string[]
          pomace_kg?: number
          yield_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_records_crushing_file_id_fkey"
            columns: ["crushing_file_id"]
            isOneToOne: false
            referencedRelation: "crushing_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "crushing_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_scale_id: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_scale_id?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_scale_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_scale_id_fkey"
            columns: ["default_scale_id"]
            isOneToOne: false
            referencedRelation: "scales"
            referencedColumns: ["id"]
          },
        ]
      }
      scales: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["scale_kind"]
          max_capacity_kg: number
          name: string
          notes: string | null
          updated_at: string
          websocket_url: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["scale_kind"]
          max_capacity_kg?: number
          name: string
          notes?: string | null
          updated_at?: string
          websocket_url?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["scale_kind"]
          max_capacity_kg?: number
          name?: string
          notes?: string | null
          updated_at?: string
          websocket_url?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      stock_lots: {
        Row: {
          client_id: string | null
          created_at: string
          crushing_file_id: string | null
          id: string
          kind: Database["public"]["Enums"]["stock_kind"]
          lot_code: string
          notes: string | null
          quantity_kg: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          crushing_file_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["stock_kind"]
          lot_code: string
          notes?: string | null
          quantity_kg?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          crushing_file_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["stock_kind"]
          lot_code?: string
          notes?: string | null
          quantity_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_lots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_crushing_file_id_fkey"
            columns: ["crushing_file_id"]
            isOneToOne: false
            referencedRelation: "crushing_files"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lot_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          quantity_kg: number
          reason: string | null
          reference_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lot_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          quantity_kg: number
          reason?: string | null
          reference_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lot_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          quantity_kg?: number
          reason?: string | null
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          notes: string | null
          plate: string
          vehicle_type: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plate: string
          vehicle_type?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plate?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      weighings: {
        Row: {
          arrival_id: string
          created_at: string
          id: string
          is_corrected: boolean
          kind: Database["public"]["Enums"]["weighing_kind"]
          manual_reason: string | null
          performed_at: string
          performed_by: string | null
          scale_id: string | null
          source: Database["public"]["Enums"]["weighing_source"]
          weight_kg: number
        }
        Insert: {
          arrival_id: string
          created_at?: string
          id?: string
          is_corrected?: boolean
          kind: Database["public"]["Enums"]["weighing_kind"]
          manual_reason?: string | null
          performed_at?: string
          performed_by?: string | null
          scale_id?: string | null
          source?: Database["public"]["Enums"]["weighing_source"]
          weight_kg: number
        }
        Update: {
          arrival_id?: string
          created_at?: string
          id?: string
          is_corrected?: boolean
          kind?: Database["public"]["Enums"]["weighing_kind"]
          manual_reason?: string | null
          performed_at?: string
          performed_by?: string | null
          scale_id?: string | null
          source?: Database["public"]["Enums"]["weighing_source"]
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weighings_arrival_id_fkey"
            columns: ["arrival_id"]
            isOneToOne: false
            referencedRelation: "arrivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weighings_scale_id_fkey"
            columns: ["scale_id"]
            isOneToOne: false
            referencedRelation: "scales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_arrival_ticket:
        | { Args: never; Returns: string }
        | {
            Args: {
              _service_type?: Database["public"]["Enums"]["service_type"]
            }
            Returns: string
          }
      next_client_code: { Args: never; Returns: string }
      next_crushing_code: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_lot_code: {
        Args: { _kind: Database["public"]["Enums"]["stock_kind"] }
        Returns: string
      }
      recalc_invoice_totals: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role:
        | "admin"
        | "superviseur"
        | "peseur"
        | "operateur"
        | "caisse"
        | "public_display"
      arrival_status: "open" | "routed" | "closed" | "cancelled"
      crushing_status:
        | "queued"
        | "assigned"
        | "in_progress"
        | "completed"
        | "cancelled"
      invoice_status: "draft" | "issued" | "partial" | "paid" | "cancelled"
      line_status: "available" | "busy" | "maintenance" | "offline"
      notification_channel: "whatsapp" | "sms"
      notification_status: "pending" | "sent" | "failed"
      payment_method: "cash" | "transfer" | "card" | "other"
      priority_level: "normal" | "high" | "urgent"
      scale_kind: "scale" | "truck_scale"
      service_type: "weigh_simple" | "weigh_double" | "crushing"
      stock_kind:
        | "client_olives"
        | "client_oil"
        | "own_oil"
        | "pomace"
        | "byproduct"
      stock_movement_type: "in" | "out" | "adjustment"
      weighing_kind: "simple" | "first" | "second"
      weighing_source: "scale" | "manual"
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
      app_role: [
        "admin",
        "superviseur",
        "peseur",
        "operateur",
        "caisse",
        "public_display",
      ],
      arrival_status: ["open", "routed", "closed", "cancelled"],
      crushing_status: [
        "queued",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
      ],
      invoice_status: ["draft", "issued", "partial", "paid", "cancelled"],
      line_status: ["available", "busy", "maintenance", "offline"],
      notification_channel: ["whatsapp", "sms"],
      notification_status: ["pending", "sent", "failed"],
      payment_method: ["cash", "transfer", "card", "other"],
      priority_level: ["normal", "high", "urgent"],
      scale_kind: ["scale", "truck_scale"],
      service_type: ["weigh_simple", "weigh_double", "crushing"],
      stock_kind: [
        "client_olives",
        "client_oil",
        "own_oil",
        "pomace",
        "byproduct",
      ],
      stock_movement_type: ["in", "out", "adjustment"],
      weighing_kind: ["simple", "first", "second"],
      weighing_source: ["scale", "manual"],
    },
  },
} as const
