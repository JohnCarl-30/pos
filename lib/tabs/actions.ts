"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { noteSchema, openTabSchema, payTabSchema, reasonSchema, type PayTabInput } from "./schemas";
import { registerErrorKind, type RegisterErrorKind } from "@/lib/register/errors";
import { tabDbError } from "./errors";

export async function openTab(input: { tableId: string | null; name: string; guests: string }): Promise<{ ok: true; tabId: string } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = openTabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the tab's details." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_tab", {
    p_store_id: store.id,
    p_table_id: parsed.data.tableId ?? undefined,
    p_name: parsed.data.name.trim() || undefined,
    p_guests: parsed.data.guests ?? undefined,
  });
  if (error || !data) return { ok: false, error: tabDbError(error) };
  revalidatePath("/tables");
  return { ok: true, tabId: data };
}

export type TabActionResult = { ok: true } | { ok: false; error: string };

const id = z.guid();

async function call(tabId: string, run: (supabase: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { code?: string; message?: string } | null }>): Promise<TabActionResult> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await run(supabase);
  if (error) return { ok: false, error: tabDbError(error) };
  revalidatePath(`/tabs/${tabId}`);
  revalidatePath("/tables");
  return { ok: true };
}

export async function addTabItems(tabId: string, items: { variantId: string; optionIds: string[]; quantity: number }[]): Promise<TabActionResult> {
  const parsed = z
    .object({ tabId: id, items: z.array(z.object({ variantId: id, optionIds: z.array(id).max(50), quantity: z.number().int().min(1).max(999) })).min(1).max(50) })
    .safeParse({ tabId, items });
  if (!parsed.success) return { ok: false, error: "Something in that item isn't valid. Try again." };
  return call(tabId, (supabase) =>
    supabase.rpc("add_tab_items", {
      p_tab_id: tabId,
      p_items: parsed.data.items.map((item) => ({ variant_id: item.variantId, option_ids: item.optionIds, quantity: item.quantity })),
    }),
  );
}

export async function changeTabItem(tabId: string, itemId: string, quantity: number): Promise<TabActionResult> {
  if (!id.safeParse(itemId).success || !Number.isInteger(quantity) || quantity < 0 || quantity > 999) return { ok: false, error: "Enter a quantity between 0 and 999." };
  return call(tabId, (supabase) => supabase.rpc("change_tab_item", { p_item_id: itemId, p_quantity: quantity }));
}

export async function noteTabItem(tabId: string, itemId: string, note: string): Promise<TabActionResult> {
  const parsed = noteSchema.safeParse({ note });
  if (!parsed.success || !id.safeParse(itemId).success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "Pick a line first." };
  return call(tabId, (supabase) => supabase.rpc("note_tab_item", { p_item_id: itemId, p_note: parsed.data.note || undefined }));
}

export async function voidTabItem(tabId: string, itemId: string, reason: string): Promise<TabActionResult> {
  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success || !id.safeParse(itemId).success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "Pick a line first." };
  return call(tabId, (supabase) => supabase.rpc("void_tab_item", { p_item_id: itemId, p_reason: parsed.data.reason }));
}

export async function sendTab(tabId: string): Promise<TabActionResult> {
  if (!id.safeParse(tabId).success) return { ok: false, error: "This tab no longer exists." };
  return call(tabId, (supabase) => supabase.rpc("send_tab", { p_tab_id: tabId }));
}

export async function printBill(tabId: string): Promise<TabActionResult> {
  if (!id.safeParse(tabId).success) return { ok: false, error: "This tab no longer exists." };
  return call(tabId, (supabase) => supabase.rpc("print_bill", { p_tab_id: tabId }));
}

export async function moveTab(tabId: string, tableId: string): Promise<TabActionResult> {
  if (!id.safeParse(tabId).success || !id.safeParse(tableId).success) return { ok: false, error: "Pick a table." };
  return call(tabId, (supabase) => supabase.rpc("move_tab", { p_tab_id: tabId, p_table_id: tableId }));
}

export async function updateTab(tabId: string, name: string, guests: string): Promise<TabActionResult> {
  const parsed = z
    .object({
      name: z.string().trim().max(40, "Keep the name under 40 characters"),
      guests: z.preprocess((value) => (value === "" ? null : Number(value)), z.number().int().min(1, "Guests must be between 1 and 99").max(99, "Guests must be between 1 and 99").nullable()),
    })
    .safeParse({ name, guests });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  return call(tabId, (supabase) => supabase.rpc("update_tab", { p_tab_id: tabId, p_name: parsed.data.name || undefined, p_guests: parsed.data.guests ?? undefined }));
}

export async function cancelTab(tabId: string): Promise<TabActionResult> {
  if (!id.safeParse(tabId).success) return { ok: false, error: "This tab no longer exists." };
  return call(tabId, (supabase) => supabase.rpc("cancel_tab", { p_tab_id: tabId }));
}

export async function payTab(
  input: PayTabInput,
): Promise<{ ok: true; orderId: string; receiptNumber: number; total: number; change: number; tabPaid: boolean } | { ok: false; error: string; kind?: RegisterErrorKind | null }> {
  await requireStaff();
  const parsed = payTabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something in the payment isn't valid. Check it and try again." };
  const sale = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_tab", {
    p_tab_id: sale.tabId,
    p_session_id: sale.sessionId,
    p_parts: sale.parts.map((part) => ({
      tab_item_id: part.tabItemId,
      quantity: part.quantity,
      discount_bps: part.discountBps ?? null,
      discount_amount: part.discountAmount ?? null,
    })),
    p_order_discount: sale.orderDiscount ? { bps: sale.orderDiscount.bps ?? null, amount: sale.orderDiscount.amount ?? null } : undefined,
    p_approval_id: sale.approvalId ?? undefined,
    p_customer_id: sale.customerId ?? undefined,
    p_payments: sale.payments.map((payment) => ({ method: payment.method, amount: payment.amount, tendered: payment.tendered ?? null, reference: payment.reference ?? null })),
    p_tip: sale.tip ?? 0,
  });
  if (error || !data) return { ok: false, error: tabDbError(error), kind: registerErrorKind(error) };
  const result = data as { order_id: string; receipt_number: number; total: number; change: number; tab_paid: boolean };
  revalidatePath("/register");
  revalidatePath("/tables");
  revalidatePath(`/tabs/${sale.tabId}`);
  return { ok: true, orderId: result.order_id, receiptNumber: result.receipt_number, total: result.total, change: result.change, tabPaid: result.tab_paid };
}
