import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { REGISTER_COOKIE } from "@/lib/register/pick-register";
import { ORDER_PAGE_SIZE, likePattern, nextDay, receiptNumberFrom, zonedDayStart, type OrderFilters, type OrderStatus } from "./list";
import type { DeviceSession, OrderDetailRow } from "./detail";

type Client = SupabaseClient<Database>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OrderListRow = {
  id: string;
  receipt_number: number;
  created_at: string;
  status: OrderStatus;
  total: number;
  register: { name: string } | null;
  staff: { name: string } | null;
  customer: { name: string } | null;
};

const LIST_FIELDS = "id, receipt_number, created_at, status, total, register:registers(name), staff:staff!orders_staff_id_fkey(name)";

export async function loadOrders(supabase: Client, storeId: string, filters: OrderFilters, timeZone: string): Promise<{ rows: OrderListRow[]; total: number }> {
  const receipt = receiptNumberFrom(filters.q);
  const customerSearch = filters.q && receipt === null ? filters.q : "";
  const select: string = `${LIST_FIELDS}, customer:customers${customerSearch ? "!inner" : ""}(name)`;
  let query = supabase.from("orders").select(select, { count: "exact" }).eq("store_id", storeId);
  if (receipt !== null) query = query.eq("receipt_number", receipt);
  if (customerSearch) query = query.ilike("customer.name", likePattern(customerSearch));
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.register) query = query.eq("register_id", filters.register);
  if (filters.cashier) query = query.eq("staff_id", filters.cashier);
  if (filters.from) query = query.gte("created_at", zonedDayStart(filters.from, timeZone).toISOString());
  if (filters.to) query = query.lt("created_at", zonedDayStart(nextDay(filters.to), timeZone).toISOString());
  const start = (filters.page - 1) * ORDER_PAGE_SIZE;
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(start, start + ORDER_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as OrderListRow[], total: count ?? 0 };
}

const DETAIL_FIELDS = [
  "id, store_id, staff_id, receipt_number, created_at, status, subtotal, discount_total, tax_total, total, void_reason, voided_at, tip, order_name",
  "register:registers(name)",
  "store:stores(timezone)",
  "session:register_sessions(closed_at)",
  "staff:staff!orders_staff_id_fkey(name)",
  "discounter:staff!orders_discount_by_fkey(name)",
  "voider:staff!orders_voided_by_fkey(name)",
  "customer:customers(id, name)",
  "order_items(id, line_number, name, sku, unit_price, quantity, discount, tax, line_total, order_item_modifiers(option_name, sort_order))",
  "payments(id, method, amount, tendered, change, reference, tip)",
  "refunds(id, receipt_number, created_at, reason, note, total, staff:staff!refunds_staff_id_fkey(name), approver:staff!refunds_approved_by_fkey(name), refund_items(order_item_id, quantity, restock, amount), refund_payments(method, amount, reference))",
].join(", ");

export async function loadOrder(supabase: Client, id: string): Promise<OrderDetailRow | null> {
  if (!GUID.test(id)) return null;
  const { data, error } = await supabase.from("orders").select(DETAIL_FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const order = data as unknown as OrderDetailRow;
  order.refunds.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return order;
}

export async function loadDeviceSession(supabase: Client, storeId: string): Promise<DeviceSession | null> {
  const cookieStore = await cookies();
  const registerId = cookieStore.get(REGISTER_COOKIE)?.value;
  if (!registerId || !GUID.test(registerId)) return null;
  const { data } = await supabase
    .from("register_sessions")
    .select("id, register:registers!inner(name, store_id)")
    .eq("register_id", registerId)
    .eq("register.store_id", storeId)
    .is("closed_at", null)
    .maybeSingle();
  if (!data) return null;
  return { sessionId: data.id, registerName: (data.register as unknown as { name: string }).name };
}
