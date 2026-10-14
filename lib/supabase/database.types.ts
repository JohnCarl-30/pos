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
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
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
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
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
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
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
          {
            foreignKeyName: "orders_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "staff";
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
      refund_approvals: {
        Row: {
          approved_by: string;
          created_at: string;
          expires_at: string;
          id: string;
          max_amount: number;
          order_id: string;
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
          max_amount: number;
          order_id: string;
          requested_by: string;
          store_id: string;
          used_at?: string | null;
        };
        Update: {
          approved_by?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          max_amount?: number;
          order_id?: string;
          requested_by?: string;
          store_id?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "refund_approvals_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_approvals_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_approvals_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_approvals_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      refund_items: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          order_item_id: string;
          quantity: number;
          refund_id: string;
          restock: boolean;
          tax: number;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          order_item_id: string;
          quantity: number;
          refund_id: string;
          restock: boolean;
          tax: number;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          order_item_id?: string;
          quantity?: number;
          refund_id?: string;
          restock?: boolean;
          tax?: number;
        };
        Relationships: [
          {
            foreignKeyName: "refund_items_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_items_refund_id_fkey";
            columns: ["refund_id"];
            isOneToOne: false;
            referencedRelation: "refunds";
            referencedColumns: ["id"];
          },
        ];
      };
      refund_payments: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          reference: string | null;
          refund_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          reference?: string | null;
          refund_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          reference?: string | null;
          refund_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refund_payments_refund_id_fkey";
            columns: ["refund_id"];
            isOneToOne: false;
            referencedRelation: "refunds";
            referencedColumns: ["id"];
          },
        ];
      };
      refunds: {
        Row: {
          approval_id: string | null;
          approved_by: string | null;
          created_at: string;
          id: string;
          note: string | null;
          order_id: string;
          reason: string;
          receipt_number: number;
          register_id: string;
          session_id: string;
          staff_id: string;
          store_id: string;
          subtotal: number;
          tax_total: number;
          total: number;
        };
        ComputedFields: never;
        Insert: {
          approval_id?: string | null;
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          order_id: string;
          reason: string;
          receipt_number: number;
          register_id: string;
          session_id: string;
          staff_id: string;
          store_id: string;
          subtotal: number;
          tax_total: number;
          total: number;
        };
        Update: {
          approval_id?: string | null;
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          order_id?: string;
          reason?: string;
          receipt_number?: number;
          register_id?: string;
          session_id?: string;
          staff_id?: string;
          store_id?: string;
          subtotal?: number;
          tax_total?: number;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "refunds_approval_id_fkey";
            columns: ["approval_id"];
            isOneToOne: false;
            referencedRelation: "refund_approvals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_register_id_fkey";
            columns: ["register_id"];
            isOneToOne: false;
            referencedRelation: "registers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "register_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
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
      create_refund: {
        Args: {
          p_approval_id?: string;
          p_lines: Json;
          p_note?: string;
          p_order_id: string;
          p_payments: Json;
          p_reason?: string;
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
      report_cashups: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          cash_refunds: number;
          cash_sales: number;
          close_note: string;
          closed_at: string;
          closed_by: string;
          counted_cash: number;
          difference: number;
          expected_cash: number;
          opened_at: string;
          opened_by: string;
          opening_cash: number;
          register: string;
          session_id: string;
        }[];
      };
      report_products: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          category: string;
          name: string;
          net_revenue: number;
          net_units: number;
          refunded: number;
          revenue: number;
          units_refunded: number;
          units_sold: number;
          variant_id: string;
        }[];
      };
      report_staff: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: {
          cash_void_count: number;
          discounts: number;
          name: string;
          refund_count: number;
          refunds_total: number;
          sales_count: number;
          sales_total: number;
          staff_id: string;
          void_count: number;
          void_total: number;
        }[];
      };
      report_summary: {
        Args: { p_from: string; p_store_id: string; p_to: string };
        Returns: Json;
      };
      report_trend: {
        Args: {
          p_bucket: string;
          p_from: string;
          p_store_id: string;
          p_to: string;
        };
        Returns: {
          bucket: string;
          net_sales: number;
          refunds_total: number;
          sales_count: number;
          sales_total: number;
        }[];
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
      void_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: undefined;
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
