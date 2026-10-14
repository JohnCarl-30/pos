import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { OrderStatus } from "@/lib/orders/list";
import { summariseCustomers, type CustomerRow, type CustomerSale } from "./list";

type Client = SupabaseClient<Database>;

export type CustomerDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  orders: {
    id: string;
    receipt_number: number;
    created_at: string;
    status: OrderStatus;
    total: number;
    store: { name: string; currency: string; timezone: string } | null;
    refunds: { id: string; receipt_number: number; created_at: string; total: number }[];
  }[];
};

export async function loadCustomerRows(supabase: Client): Promise<CustomerRow[]> {
  const [customers, sales] = await Promise.all([
    fetchAll((from, to) => supabase.from("customers").select("id, name, email, phone").order("name").order("id").range(from, to)),
    fetchAll((from, to) =>
      supabase.from("orders").select("customer_id, total, created_at, status, refunds(total)").not("customer_id", "is", null).order("id").range(from, to),
    ),
  ]);
  return summariseCustomers(customers, sales as unknown as CustomerSale[]);
}

export async function loadCustomer(supabase: Client, id: string): Promise<CustomerDetail | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, notes, orders(id, receipt_number, created_at, status, total, store:stores(name, currency, timezone), refunds(id, receipt_number, created_at, total))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const customer = data as unknown as CustomerDetail;
  customer.orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return customer;
}
