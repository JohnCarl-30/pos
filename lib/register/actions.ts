"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { parseMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/action-result";
import { REGISTER_COOKIE } from "./pick-register";
import { registerDbError } from "./errors";
import { saleSchema, type SaleInput } from "./sale-schema";

export type CloseTillState = {
  error: string | null;
  summary: { opening_cash: number; cash_sales: number; expected_cash: number; counted_cash: number; difference: number } | null;
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function selectRegister(registerId: string): Promise<void> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store || !GUID.test(registerId)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("registers").select("id").eq("id", registerId).eq("store_id", store.id).maybeSingle();
  if (!data) return;
  const cookieStore = await cookies();
  cookieStore.set(REGISTER_COOKIE, registerId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/register");
}

export async function clearRegister(): Promise<void> {
  await requireStaff();
  const cookieStore = await cookies();
  cookieStore.delete(REGISTER_COOKIE);
  revalidatePath("/register");
}

export async function openTill(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const registerId = String(formData.get("registerId") ?? "");
  const openingCash = parseMoney(String(formData.get("openingCash") ?? ""), store.currency);
  if (!GUID.test(registerId)) return { ok: false, error: "Pick a register first." };
  if (openingCash === null || openingCash < 0) return { ok: false, fieldErrors: { openingCash: "Enter the cash in the drawer, like 100.00" } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_register", { p_register_id: registerId, p_opening_cash: openingCash });
  if (error) return { ok: false, error: registerDbError(error) };
  revalidatePath("/register");
  return { ok: true };
}

export async function closeTill(_: CloseTillState, formData: FormData): Promise<CloseTillState> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { error: "Pick a store in the sidebar first.", summary: null };
  const sessionId = String(formData.get("sessionId") ?? "");
  const counted = parseMoney(String(formData.get("countedCash") ?? ""), store.currency);
  const note = String(formData.get("note") ?? "").trim();
  if (!GUID.test(sessionId)) return { error: "This till is no longer open.", summary: null };
  if (counted === null || counted < 0) return { error: "Enter the cash you counted, like 152.50", summary: null };
  if (note.length > 300) return { error: "Keep the note under 300 characters.", summary: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_register", { p_session_id: sessionId, p_counted_cash: counted, p_note: note || undefined });
  if (error || !data) return { error: registerDbError(error), summary: null };
  return { error: null, summary: data as CloseTillState["summary"] };
}

export async function completeSale(
  input: SaleInput,
): Promise<{ ok: true; orderId: string; receiptNumber: number; total: number; change: number } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something in the sale isn't valid. Check it and try again." };
  const sale = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_session_id: sale.sessionId,
    p_lines: sale.lines.map((line) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
      discount_bps: line.discountBps ?? null,
      discount_amount: line.discountAmount ?? null,
    })),
    p_order_discount: sale.orderDiscount ? { bps: sale.orderDiscount.bps ?? null, amount: sale.orderDiscount.amount ?? null } : undefined,
    p_approval_id: sale.approvalId ?? undefined,
    p_customer_id: sale.customerId ?? undefined,
    p_payments: sale.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      tendered: payment.tendered ?? null,
      reference: payment.reference ?? null,
    })),
  });
  if (error || !data) return { ok: false, error: registerDbError(error) };
  const result = data as { order_id: string; receipt_number: number; total: number; change: number };
  revalidatePath("/register");
  return { ok: true, orderId: result.order_id, receiptNumber: result.receipt_number, total: result.total, change: result.change };
}

const approvalSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
  shareBps: z.number().int().min(1).max(10_000),
});

export async function requestApproval(input: { email: string; password: string; shareBps: number }): Promise<{ ok: true; approvalId: string; maxBps: number } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = approvalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the manager's email and password." };

  const verifier = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signedIn, error: signInError } = await verifier.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (signInError || !signedIn.user) return { ok: false, error: "Email or password is incorrect." };

  const admin = createAdminClient();
  const { data: approver } = await admin.from("staff").select("id, role, active, staff_stores(store_id)").eq("user_id", signedIn.user.id).maybeSingle();
  await verifier.auth.signOut({ scope: "local" });
  if (!approver || !approver.active || (approver.role !== "manager" && approver.role !== "owner")) {
    return { ok: false, error: "Only an active manager or owner can approve discounts." };
  }
  if (approver.role === "manager" && !approver.staff_stores.some((entry) => entry.store_id === store.id)) {
    return { ok: false, error: "That manager doesn't work in this store." };
  }

  const { data: approval, error } = await admin
    .from("discount_approvals")
    .insert({ store_id: store.id, approved_by: approver.id, requested_by: staff.id, max_bps: parsed.data.shareBps })
    .select("id, max_bps")
    .single();
  if (error || !approval) return { ok: false, error: "Couldn't record the approval. Try again." };
  return { ok: true, approvalId: approval.id, maxBps: approval.max_bps };
}

function searchPattern(query: string): string {
  return query.replace(/[^\p{L}\p{N}@.+\- ]/gu, "").trim();
}

export async function searchCustomers(query: string): Promise<{ id: string; name: string; email: string | null; phone: string | null }[]> {
  await requireStaff();
  const clean = searchPattern(query).slice(0, 60);
  if (!clean) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, email, phone")
    .or(`name.ilike.%${clean}%,email.ilike.%${clean}%,phone.ilike.%${clean}%`)
    .order("name")
    .limit(10);
  return data ?? [];
}

const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter the customer's name").max(120),
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  phone: z.string().trim().max(40),
});

export async function addCustomer(input: { name: string; email: string; phone: string }): Promise<{ ok: true; customer: { id: string; name: string } } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = customerSchema.safeParse({ name: input.name, email: input.email.trim(), phone: input.phone });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the customer's details." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ name: parsed.data.name, email: parsed.data.email || null, phone: parsed.data.phone || null })
    .select("id, name")
    .single();
  if (error || !data) return { ok: false, error: registerDbError(error) };
  return { ok: true, customer: data };
}
