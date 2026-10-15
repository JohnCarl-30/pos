import { methodRoom, type MethodRoom, type RefundMethod } from "@/lib/refunds";
import type { StaffRole } from "@/lib/auth/roles";
import type { OrderStatus } from "./list";

export type RefundReason = "changed_mind" | "damaged" | "wrong_item" | "other";

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  changed_mind: "Changed mind",
  damaged: "Damaged",
  wrong_item: "Wrong item",
  other: "Other",
};

export const REFUND_REASONS = (Object.keys(REFUND_REASON_LABELS) as RefundReason[]).map((value) => ({ value, label: REFUND_REASON_LABELS[value] }));

export type OrderDetailRow = {
  id: string;
  store_id: string;
  staff_id: string;
  receipt_number: number;
  created_at: string;
  status: OrderStatus;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  void_reason: string | null;
  voided_at: string | null;
  tip: number;
  order_name: string | null;
  register: { name: string } | null;
  store: { timezone: string } | null;
  session: { closed_at: string | null } | null;
  staff: { name: string } | null;
  discounter: { name: string } | null;
  voider: { name: string } | null;
  customer: { id: string; name: string } | null;
  order_items: {
    id: string;
    line_number: number | null;
    name: string;
    sku: string;
    unit_price: number;
    quantity: number;
    discount: number;
    tax: number;
    line_total: number;
    order_item_modifiers: { option_name: string; sort_order: number }[];
  }[];
  payments: { id: string; method: RefundMethod; amount: number; tendered: number | null; change: number | null; reference: string | null }[];
  refunds: {
    id: string;
    receipt_number: number;
    created_at: string;
    reason: RefundReason;
    note: string | null;
    total: number;
    staff: { name: string } | null;
    approver: { name: string } | null;
    refund_items: { order_item_id: string; quantity: number; restock: boolean; amount: number }[];
    refund_payments: { method: RefundMethod; amount: number; reference: string | null }[];
  }[];
};

export type RefundableLine = { orderItemId: string; name: string; quantity: number; refunded: number; lineTotal: number; tax: number; unitPaid: number };

export type RefundContext = { orderId: string; receiptNumber: number; registerName: string; createdAt: string; timeZone: string; total: number; lines: RefundableLine[]; room: MethodRoom };

export type DeviceSession = { sessionId: string; registerName: string };

export function refundedByItem(order: OrderDetailRow): Map<string, number> {
  const refunded = new Map<string, number>();
  for (const refund of order.refunds) {
    for (const item of refund.refund_items) refunded.set(item.order_item_id, (refunded.get(item.order_item_id) ?? 0) + item.quantity);
  }
  return refunded;
}

export function toRefundContext(order: OrderDetailRow): RefundContext {
  const refunded = refundedByItem(order);
  const lines = [...order.order_items]
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))
    .map((item) => ({
      orderItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      refunded: refunded.get(item.id) ?? 0,
      lineTotal: item.line_total,
      tax: item.tax,
      unitPaid: Math.round(item.line_total / item.quantity),
    }));
  return {
    orderId: order.id,
    receiptNumber: order.receipt_number,
    registerName: order.register?.name ?? "",
    createdAt: order.created_at,
    timeZone: order.store?.timezone ?? "UTC",
    total: order.total,
    lines,
    room: methodRoom(order.payments, order.refunds.flatMap((refund) => refund.refund_payments)),
  };
}

export function unitsLeft(context: RefundContext): number {
  return context.lines.reduce((sum, line) => sum + line.quantity - line.refunded, 0);
}

export function canVoid(order: OrderDetailRow, staff: { id: string; role: StaffRole }): boolean {
  if (order.status !== "completed" || order.refunds.length > 0) return false;
  if (!order.session || order.session.closed_at !== null) return false;
  return staff.role !== "cashier" || order.staff_id === staff.id;
}

export function refundAvailability(order: OrderDetailRow, session: DeviceSession | null): "ok" | "no-till" | "nothing" {
  if (order.status === "voided" || unitsLeft(toRefundContext(order)) === 0) return "nothing";
  return session ? "ok" : "no-till";
}

export function pickReceiptMatch(matches: { id: string; register_id: string; created_at: string }[], registerId: string | null): string | null {
  const own = matches.find((match) => match.register_id === registerId);
  if (own) return own.id;
  const newest = [...matches].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return newest?.id ?? null;
}
