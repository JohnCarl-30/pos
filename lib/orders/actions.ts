"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyApprover } from "@/lib/register/approver";
import { refundSchema, type RefundInput } from "./refund-schema";
import { orderDbError, orderErrorKind, type OrderErrorKind } from "./errors";
import { loadOrder } from "./queries";
import { pickReceiptMatch, toRefundContext, unitsLeft, type RefundContext } from "./detail";

async function currencyOf(orderId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("store:stores(currency)").eq("id", orderId).maybeSingle();
  return (data?.store as unknown as { currency: string } | null)?.currency ?? "USD";
}

export async function refundSale(
  input: RefundInput,
): Promise<{ ok: true; refundId: string; receiptNumber: number; total: number } | { ok: false; error: string; kind?: OrderErrorKind | null }> {
  await requireStaff();
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) {
    const noteMissing = parsed.error.issues.some((issue) => issue.path[0] === "note");
    return { ok: false, error: noteMissing ? "Add a note for the refund." : "Something in the refund isn't valid. Check it and try again." };
  }
  const refund = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_refund", {
    p_order_id: refund.orderId,
    p_session_id: refund.sessionId,
    p_lines: refund.lines.map((line) => ({ order_item_id: line.orderItemId, quantity: line.quantity, restock: line.restock })),
    p_payments: refund.payments.map((payment) => ({ method: payment.method, amount: payment.amount, reference: payment.reference || null })),
    p_approval_id: refund.approvalId ?? undefined,
    p_reason: refund.reason,
    p_note: refund.note || undefined,
  });
  if (error || !data) return { ok: false, error: orderDbError(error, await currencyOf(refund.orderId)), kind: orderErrorKind(error) };
  const result = data as { refund_id: string; receipt_number: number; total: number };
  revalidatePath("/orders");
  revalidatePath(`/orders/${refund.orderId}`);
  return { ok: true, refundId: result.refund_id, receiptNumber: result.receipt_number, total: result.total };
}

const voidSchema = z.object({ orderId: z.guid(), reason: z.string().trim().min(1).max(300) });

export async function voidSale(input: { orderId: string; reason: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Add a reason for the void, up to 300 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_order", { p_order_id: parsed.data.orderId, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: orderDbError(error, "USD") };
  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/register");
  return { ok: true };
}

const approvalSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
  orderId: z.guid(),
  amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export async function requestRefundApproval(input: {
  email: string;
  password: string;
  orderId: string;
  amount: number;
}): Promise<{ ok: true; approvalId: string; maxAmount: number } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const parsed = approvalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the manager's email and password." };
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("id, store_id").eq("id", parsed.data.orderId).maybeSingle();
  if (!order) return { ok: false, error: "That sale no longer exists." };

  const approver = await verifyApprover(parsed.data.email, parsed.data.password, order.store_id);
  if (!approver.ok) return approver;

  const admin = createAdminClient();
  const { data: approval, error } = await admin
    .from("refund_approvals")
    .insert({ store_id: order.store_id, order_id: order.id, approved_by: approver.approverId, requested_by: staff.id, max_amount: parsed.data.amount })
    .select("id, max_amount")
    .single();
  if (error || !approval) return { ok: false, error: "Couldn't record the approval. Try again." };
  return { ok: true, approvalId: approval.id, maxAmount: approval.max_amount };
}

export async function findSaleByReceipt(input: { receiptNumber: number; sessionId: string }): Promise<{ ok: true; context: RefundContext } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  if (!Number.isInteger(input.receiptNumber) || input.receiptNumber < 1 || input.receiptNumber > 999_999_999) {
    return { ok: false, error: "Enter a receipt number, like 42." };
  }
  const supabase = await createClient();
  const [{ data: matches }, { data: session }] = await Promise.all([
    supabase.from("orders").select("id, register_id, created_at").eq("store_id", store.id).eq("receipt_number", input.receiptNumber),
    supabase.from("register_sessions").select("register_id").eq("id", input.sessionId).maybeSingle(),
  ]);
  const foundId = pickReceiptMatch(matches ?? [], session?.register_id ?? null);
  const order = foundId ? await loadOrder(supabase, foundId) : null;
  if (!order) return { ok: false, error: "No sale with that receipt number in this store." };
  if (order.status === "voided") return { ok: false, error: "That sale was voided, so there's nothing to refund." };
  const context = toRefundContext(order);
  if (unitsLeft(context) === 0) return { ok: false, error: "Everything on that sale has already been refunded." };
  return { ok: true, context };
}
