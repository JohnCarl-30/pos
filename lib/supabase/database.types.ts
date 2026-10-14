export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      business: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          setup_completed_at: string | null;
          singleton: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          setup_completed_at?: string | null;
          singleton?: boolean;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          setup_completed_at?: string | null;
          singleton?: boolean;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
        };
        Relationships: [];
      };
      discount_approvals: {
        Row: {
          approved_by: string;
          created_at: string;
          expires_at: string;
          id: string;
          max_bps: number;
          max_discount: number;
          requested_by: string;
          store_id: string;
          used_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_by: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          max_bps: number;
          max_discount: number;
          requested_by: string;
          store_id: string;
          used_at?: string | null;
        };
        Update: {
          approved_by?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          max_bps?: number;
          max_discount?: number;
          requested_by?: string;
          store_id?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "discount_approvals_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discount_approvals_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discount_approvals_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          discount: number;
          id: string;
          line_discount_amount: number | null;
          line_discount_bps: number | null;
          line_number: number | null;
          line_total: number;
          name: string;
          order_id: string;
          quantity: number;
          sku: string;
          tax: number;
          tax_rate_bps: number;
          unit_price: number;
          variant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          discount?: number;
          id?: string;
          line_discount_amount?: number | null;
          line_discount_bps?: number | null;
          line_number?: number | null;
          line_total: number;
          name: string;
          order_id: string;
          quantity: number;
          sku: string;
          tax: number;
          tax_rate_bps: number;
          unit_price: number;
          variant_id?: string | null;
        };
        Update: {
          created_at?: string;
          discount?: number;
          id?: string;
          line_discount_amount?: number | null;
          line_discount_bps?: number | null;
          line_number?: number | null;
          line_total?: number;
          name?: string;
          order_id?: string;
          quantity?: number;
          sku?: string;
          tax?: number;
          tax_rate_bps?: number;
          unit_price?: number;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          created_at: string;
          customer_id: string | null;
          discount_approval_id: string | null;
          discount_by: string | null;
          discount_total: number;
          id: string;
          receipt_number: number;
          register_id: string;
          session_id: string;
          staff_id: string;
          status: Database["public"]["Enums"]["order_status"];
          store_id: string;
          subtotal: number;
          tax_total: number;
          total: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          discount_approval_id?: string | null;
          discount_by?: string | null;
          discount_total?: number;
          id?: string;
          receipt_number: number;
          register_id: string;
          session_id: string;
          staff_id: string;
          status?: Database["public"]["Enums"]["order_status"];
          store_id: string;
          subtotal: number;
          tax_total: number;
          total: number;
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          discount_approval_id?: string | null;
          discount_by?: string | null;
          discount_total?: number;
          id?: string;
          receipt_number?: number;
          register_id?: string;
          session_id?: string;
          staff_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          store_id?: string;
          subtotal?: number;
          tax_total?: number;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_discount_approval_id_fkey";
            columns: ["discount_approval_id"];
            isOneToOne: false;
            referencedRelation: "discount_approvals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_discount_by_fkey";
            columns: ["discount_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_register_id_fkey";
            columns: ["register_id"];
            isOneToOne: false;
            referencedRelation: "registers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "register_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          change: number | null;
          created_at: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          order_id: string;
          reference: string | null;
          tendered: number | null;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          change?: number | null;
          created_at?: string;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          order_id: string;
          reference?: string | null;
          tendered?: number | null;
        };
        Update: {
          amount?: number;
          change?: number | null;
          created_at?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          order_id?: string;
          reference?: string | null;
          tendered?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          active: boolean;
          barcode: string | null;
          cost: number | null;
          created_at: string;
          id: string;
          name: string;
          price: number;
          product_id: string;
          sku: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          barcode?: string | null;
          cost?: number | null;
          created_at?: string;
          id?: string;
          name?: string;
          price: number;
          product_id: string;
          sku: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          barcode?: string | null;
          cost?: number | null;
          created_at?: string;
          id?: string;
          name?: string;
          price?: number;
          product_id?: string;
          sku?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          category_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          tax_class_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          tax_class_id: string;
        };
        Update: {
          active?: boolean;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          tax_class_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_tax_class_id_fkey";
            columns: ["tax_class_id"];
            isOneToOne: false;
            referencedRelation: "tax_classes";
            referencedColumns: ["id"];
          },
        ];
      };
      register_sessions: {
        Row: {
          close_note: string | null;
          closed_at: string | null;
          closed_by: string | null;
          counted_cash: number | null;
          created_at: string;
          id: string;
          opened_at: string;
          opened_by: string;
          opening_cash: number;
          register_id: string;
        };
        ComputedFields: never;
        Insert: {
          close_note?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          counted_cash?: number | null;
          created_at?: string;
          id?: string;
          opened_at?: string;
          opened_by: string;
          opening_cash?: number;
          register_id: string;
        };
        Update: {
          close_note?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          counted_cash?: number | null;
          created_at?: string;
          id?: string;
          opened_at?: string;
          opened_by?: string;
          opening_cash?: number;
          register_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "register_sessions_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "register_sessions_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "register_sessions_register_id_fkey";
            columns: ["register_id"];
            isOneToOne: false;
            referencedRelation: "registers";
            referencedColumns: ["id"];
          },
        ];
      };
      registers: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          next_receipt_number: number;
          store_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          next_receipt_number?: number;
          store_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          next_receipt_number?: number;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "registers_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          active: boolean;
          created_at: string;
          email: string;
          id: string;
          name: string;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          email: string;
          id?: string;
          name: string;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      staff_stores: {
        Row: {
          created_at: string;
          staff_id: string;
          store_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          staff_id: string;
          store_id: string;
        };
        Update: {
          created_at?: string;
          staff_id?: string;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_stores_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_stores_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_levels: {
        Row: {
          created_at: string;
          low_stock_at: number | null;
          quantity: number;
          store_id: string;
          track: boolean;
          variant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          low_stock_at?: number | null;
          quantity?: number;
          store_id: string;
          track?: boolean;
          variant_id: string;
        };
        Update: {
          created_at?: string;
          low_stock_at?: number | null;
          quantity?: number;
          store_id?: string;
          track?: boolean;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_levels_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_levels_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          quantity_change: number;
          reason: Database["public"]["Enums"]["stock_reason"];
          staff_id: string;
          store_id: string;
          transfer_id: string | null;
          variant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          quantity_change: number;
          reason: Database["public"]["Enums"]["stock_reason"];
          staff_id: string;
          store_id: string;
          transfer_id?: string | null;
          variant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          quantity_change?: number;
          reason?: Database["public"]["Enums"]["stock_reason"];
          staff_id?: string;
          store_id?: string;
          transfer_id?: string | null;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      stores: {
        Row: {
          address: string | null;
          created_at: string;
          currency: string;
          id: string;
          max_cashier_discount_bps: number;
          name: string;
          prices_include_tax: boolean;
          receipt_footer: string | null;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          created_at?: string;
          currency: string;
          id?: string;
          max_cashier_discount_bps?: number;
          name: string;
          prices_include_tax?: boolean;
          receipt_footer?: string | null;
          timezone?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          max_cashier_discount_bps?: number;
          name?: string;
          prices_include_tax?: boolean;
          receipt_footer?: string | null;
          timezone?: string;
        };
        Relationships: [];
      };
      tax_classes: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      tax_rates: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          rate_bps: number;
          store_id: string;
          tax_class_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          rate_bps: number;
          store_id: string;
          tax_class_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          rate_bps?: number;
          store_id?: string;
          tax_class_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tax_rates_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tax_rates_tax_class_id_fkey";
            columns: ["tax_class_id"];
            isOneToOne: false;
            referencedRelation: "tax_classes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      close_register: {
        Args: { p_counted_cash: number; p_note?: string; p_session_id: string };
        Returns: Json;
      };
      complete_setup: {
        Args: {
          p_business_name: string;
          p_currency: string;
          p_owner_email: string;
          p_owner_name: string;
          p_prices_include_tax: boolean;
          p_store_name: string;
          p_tax_rate_bps: number;
          p_timezone: string;
          p_user_id: string;
        };
        Returns: string;
      };
      create_order: {
        Args: {
          p_approval_id?: string;
          p_customer_id?: string;
          p_lines: Json;
          p_order_discount?: Json;
          p_payments?: Json;
          p_session_id: string;
        };
        Returns: Json;
      };
      import_catalog: {
        Args: { p_rows: Json; p_store_id: string };
        Returns: number;
      };
      open_register: {
        Args: { p_opening_cash: number; p_register_id: string };
        Returns: string;
      };
      record_stock_count: {
        Args: {
          p_counted: number;
          p_note?: string;
          p_store_id: string;
          p_variant_id: string;
        };
        Returns: number;
      };
      save_product: {
        Args: { p_product: Json; p_store_id: string; p_variants: Json };
        Returns: string;
      };
      set_default_tax_class: { Args: { p_id: string }; Returns: undefined };
      set_staff_access: {
        Args: {
          p_active: boolean;
          p_role: Database["public"]["Enums"]["staff_role"];
          p_staff_id: string;
          p_store_ids: string[];
        };
        Returns: undefined;
      };
      setup_status: { Args: Record<PropertyKey, never>; Returns: boolean };
      transfer_stock: {
        Args: {
          p_from: string;
          p_note?: string;
          p_quantity: number;
          p_to: string;
          p_variant_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      order_status: "completed" | "voided" | "refunded" | "partially_refunded";
      payment_method: "cash" | "card" | "other";
      staff_role: "owner" | "manager" | "cashier";
      stock_reason:
        | "received"
        | "counted"
        | "damaged"
        | "transfer_in"
        | "transfer_out"
        | "sold"
        | "returned"
        | "correction";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      order_status: ["completed", "voided", "refunded", "partially_refunded"],
      payment_method: ["cash", "card", "other"],
      staff_role: ["owner", "manager", "cashier"],
      stock_reason: [
        "received",
        "counted",
        "damaged",
        "transfer_in",
        "transfer_out",
        "sold",
        "returned",
        "correction",
      ],
    },
  },
} as const;
