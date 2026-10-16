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
          kitchen: boolean;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kitchen?: boolean;
          name: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          kitchen?: boolean;
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
      dining_areas: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
          store_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
          store_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dining_areas_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      dining_tables: {
        Row: {
          active: boolean;
          area_id: string;
          created_at: string;
          id: string;
          name: string;
          seats: number;
          sort_order: number;
          store_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          area_id: string;
          created_at?: string;
          id?: string;
          name: string;
          seats: number;
          sort_order?: number;
          store_id: string;
        };
        Update: {
          active?: boolean;
          area_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          seats?: number;
          sort_order?: number;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dining_tables_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "dining_areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dining_tables_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
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
      kitchen_ticket_items: {
        Row: {
          choices: string | null;
          id: string;
          name: string;
          note: string | null;
          quantity: number;
          sort_order: number;
          tab_item_id: string | null;
          ticket_id: string;
          voided: boolean;
        };
        ComputedFields: never;
        Insert: {
          choices?: string | null;
          id?: string;
          name: string;
          note?: string | null;
          quantity: number;
          sort_order?: number;
          tab_item_id?: string | null;
          ticket_id: string;
          voided?: boolean;
        };
        Update: {
          choices?: string | null;
          id?: string;
          name?: string;
          note?: string | null;
          quantity?: number;
          sort_order?: number;
          tab_item_id?: string | null;
          ticket_id?: string;
          voided?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "kitchen_ticket_items_tab_item_id_fkey";
            columns: ["tab_item_id"];
            isOneToOne: false;
            referencedRelation: "tab_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kitchen_ticket_items_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "kitchen_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      kitchen_tickets: {
        Row: {
          done_at: string | null;
          done_by: string | null;
          id: string;
          label: string;
          number: number;
          order_id: string | null;
          sent_at: string;
          sent_by: string;
          store_id: string;
          tab_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          done_at?: string | null;
          done_by?: string | null;
          id?: string;
          label: string;
          number: number;
          order_id?: string | null;
          sent_at?: string;
          sent_by: string;
          store_id: string;
          tab_id?: string | null;
          updated_at?: string;
        };
        Update: {
          done_at?: string | null;
          done_by?: string | null;
          id?: string;
          label?: string;
          number?: number;
          order_id?: string | null;
          sent_at?: string;
          sent_by?: string;
          store_id?: string;
          tab_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kitchen_tickets_done_by_fkey";
            columns: ["done_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kitchen_tickets_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kitchen_tickets_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kitchen_tickets_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kitchen_tickets_tab_id_fkey";
            columns: ["tab_id"];
            isOneToOne: false;
            referencedRelation: "tabs";
            referencedColumns: ["id"];
          },
        ];
      };
      modifier_groups: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          max_choices: number;
          min_choices: number;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          max_choices?: number;
          min_choices?: number;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          max_choices?: number;
          min_choices?: number;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      modifier_options: {
        Row: {
          active: boolean;
          created_at: string;
          group_id: string;
          id: string;
          name: string;
          price_delta: number;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          group_id: string;
          id?: string;
          name: string;
          price_delta?: number;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          group_id?: string;
          id?: string;
          name?: string;
          price_delta?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "modifier_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      order_item_modifiers: {
        Row: {
          group_name: string;
          id: string;
          option_id: string | null;
          option_name: string;
          order_item_id: string;
          price_delta: number;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          group_name: string;
          id?: string;
          option_id?: string | null;
          option_name: string;
          order_item_id: string;
          price_delta: number;
          sort_order?: number;
        };
        Update: {
          group_name?: string;
          id?: string;
          option_id?: string | null;
          option_name?: string;
          order_item_id?: string;
          price_delta?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_item_modifiers_option_id_fkey";
            columns: ["option_id"];
            isOneToOne: false;
            referencedRelation: "modifier_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_item_modifiers_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
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
          tab_item_id: string | null;
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
          tab_item_id?: string | null;
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
          tab_item_id?: string | null;
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
            foreignKeyName: "order_items_tab_item_id_fkey";
            columns: ["tab_item_id"];
            isOneToOne: false;
            referencedRelation: "tab_items";
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
          order_name: string | null;
          receipt_number: number;
          register_id: string;
          session_id: string;
          staff_id: string;
          status: Database["public"]["Enums"]["order_status"];
          store_id: string;
          subtotal: number;
          tab_id: string | null;
          tax_total: number;
          tip: number;
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
          order_name?: string | null;
          receipt_number: number;
          register_id: string;
          session_id: string;
          staff_id: string;
          status?: Database["public"]["Enums"]["order_status"];
          store_id: string;
          subtotal: number;
          tab_id?: string | null;
          tax_total: number;
          tip?: number;
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
          order_name?: string | null;
          receipt_number?: number;
          register_id?: string;
          session_id?: string;
          staff_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          store_id?: string;
          subtotal?: number;
          tab_id?: string | null;
          tax_total?: number;
          tip?: number;
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
            foreignKeyName: "orders_tab_id_fkey";
            columns: ["tab_id"];
            isOneToOne: false;
            referencedRelation: "tabs";
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
          tip: number;
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
          tip?: number;
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
          tip?: number;
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
      product_modifier_groups: {
        Row: {
          group_id: string;
          product_id: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          product_id: string;
          sort_order?: number;
        };
        Update: {
          group_id?: string;
          product_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_modifier_groups_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "modifier_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_modifier_groups_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
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
          next_ticket_number: number;
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
          next_ticket_number?: number;
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
          next_ticket_number?: number;
          prices_include_tax?: boolean;
          receipt_footer?: string | null;
          timezone?: string;
        };
        Relationships: [];
      };
      tab_items: {
        Row: {
          added_at: string;
          added_by: string;
          id: string;
          name: string;
          note: string | null;
          option_ids: string[];
          paid_quantity: number;
          quantity: number;
          sent_at: string | null;
          tab_id: string;
          variant_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          added_by: string;
          id?: string;
          name: string;
          note?: string | null;
          option_ids?: string[];
          paid_quantity?: number;
          quantity: number;
          sent_at?: string | null;
          tab_id: string;
          variant_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          added_at?: string;
          added_by?: string;
          id?: string;
          name?: string;
          note?: string | null;
          option_ids?: string[];
          paid_quantity?: number;
          quantity?: number;
          sent_at?: string | null;
          tab_id?: string;
          variant_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tab_items_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tab_items_tab_id_fkey";
            columns: ["tab_id"];
            isOneToOne: false;
            referencedRelation: "tabs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tab_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tab_items_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      tabs: {
        Row: {
          bill_printed_at: string | null;
          closed_at: string | null;
          guests: number | null;
          id: string;
          name: string | null;
          opened_at: string;
          opened_by: string;
          status: Database["public"]["Enums"]["tab_status"];
          store_id: string;
          table_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bill_printed_at?: string | null;
          closed_at?: string | null;
          guests?: number | null;
          id?: string;
          name?: string | null;
          opened_at?: string;
          opened_by: string;
          status?: Database["public"]["Enums"]["tab_status"];
          store_id: string;
          table_id?: string | null;
          updated_at?: string;
        };
        Update: {
          bill_printed_at?: string | null;
          closed_at?: string | null;
          guests?: number | null;
          id?: string;
          name?: string | null;
          opened_at?: string;
          opened_by?: string;
          status?: Database["public"]["Enums"]["tab_status"];
          store_id?: string;
          table_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tabs_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tabs_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tabs_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id"];
          },
        ];
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
      add_tab_items: {
        Args: { p_items: Json; p_tab_id: string };
        Returns: undefined;
      };
      cancel_tab: { Args: { p_tab_id: string }; Returns: undefined };
      change_tab_item: {
        Args: { p_item_id: string; p_quantity: number };
        Returns: undefined;
      };
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
          p_kitchen?: boolean;
          p_lines: Json;
          p_order_discount?: Json;
          p_order_name?: string;
          p_payments?: Json;
          p_session_id: string;
          p_tip?: number;
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
      finish_ticket: { Args: { p_ticket_id: string }; Returns: undefined };
      import_catalog: {
        Args: { p_rows: Json; p_store_id: string };
        Returns: number;
      };
      move_tab: {
        Args: { p_tab_id: string; p_table_id: string };
        Returns: undefined;
      };
      note_tab_item: {
        Args: { p_item_id: string; p_note?: string };
        Returns: undefined;
      };
      open_register: {
        Args: { p_opening_cash: number; p_register_id: string };
        Returns: string;
      };
      open_tab: {
        Args: {
          p_guests?: number;
          p_name?: string;
          p_store_id: string;
          p_table_id?: string;
        };
        Returns: string;
      };
      pay_tab: {
        Args: {
          p_approval_id?: string;
          p_customer_id?: string;
          p_order_discount?: Json;
          p_parts: Json;
          p_payments?: Json;
          p_session_id: string;
          p_tab_id: string;
          p_tip?: number;
        };
        Returns: Json;
      };
      print_bill: { Args: { p_tab_id: string }; Returns: undefined };
      recall_ticket: { Args: { p_store_id: string }; Returns: string };
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
          cash_tips: number;
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
          tips: number;
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
      save_modifier_group: { Args: { p_group: Json }; Returns: string };
      save_product: {
        Args: { p_product: Json; p_store_id: string; p_variants: Json };
        Returns: string;
      };
      send_tab: { Args: { p_tab_id: string }; Returns: string };
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
      update_tab: {
        Args: { p_guests?: number; p_name?: string; p_tab_id: string };
        Returns: undefined;
      };
      void_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: undefined;
      };
      void_tab_item: {
        Args: { p_item_id: string; p_reason: string };
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
      tab_status: "open" | "paid" | "cancelled";
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
      tab_status: ["open", "paid", "cancelled"],
    },
  },
} as const;
