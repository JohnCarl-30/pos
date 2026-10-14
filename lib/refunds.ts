import { divRoundHalfEven } from "./tax";

export type RefundMethod = "cash" | "card" | "other";
export type RefundLineInput = { lineTotal: number; tax: number; quantity: number; refunded: number; units: number };
export type RefundLineAmount = { amount: number; tax: number };
export type RefundTotals = { subtotal: number; taxTotal: number; total: number; lines: RefundLineAmount[] };
export type RefundPayment = { method: RefundMethod; amount: number; reference?: string | null };
export type MethodRoom = { card: number; other: number };
export type RefundVector = { name: string; line: RefundLineInput; expected: RefundLineAmount };

export class RefundError extends Error {}

function share(total: number, units: number, quantity: number): number {
  return Number(divRoundHalfEven(BigInt(total) * BigInt(units), BigInt(quantity)));
}

export function refundLine({ lineTotal, tax, quantity, refunded, units }: RefundLineInput): RefundLineAmount {
  if (!Number.isInteger(units) || units < 1) throw new RefundError("Refund at least 1 of each item");
  if (refunded + units > quantity) throw new RefundError(`Only ${quantity - refunded} left to refund`);
  return {
    amount: share(lineTotal, refunded + units, quantity) - share(lineTotal, refunded, quantity),
    tax: share(tax, refunded + units, quantity) - share(tax, refunded, quantity),
  };
}

export function priceRefund(lines: RefundLineInput[]): RefundTotals {
  const priced = lines.map(refundLine);
  const total = priced.reduce((sum, line) => sum + line.amount, 0);
  const taxTotal = priced.reduce((sum, line) => sum + line.tax, 0);
  return { subtotal: total - taxTotal, taxTotal, total, lines: priced };
}

function sumFor(rows: { method: RefundMethod; amount: number }[], method: RefundMethod): number {
  return rows.filter((row) => row.method === method).reduce((sum, row) => sum + row.amount, 0);
}

export function methodRoom(paid: { method: RefundMethod; amount: number }[], refunded: { method: RefundMethod; amount: number }[]): MethodRoom {
  return { card: sumFor(paid, "card") - sumFor(refunded, "card"), other: sumFor(paid, "other") - sumFor(refunded, "other") };
}

export function suggestPayout(total: number, room: MethodRoom): RefundPayment[] {
  const card = Math.min(total, Math.max(room.card, 0));
  const other = Math.min(total - card, Math.max(room.other, 0));
  const rows: RefundPayment[] = [
    { method: "card", amount: card },
    { method: "other", amount: other },
    { method: "cash", amount: total - card - other },
  ];
  return rows.filter((row) => row.amount > 0);
}

export function checkPayout(total: number, payments: RefundPayment[], room: MethodRoom): string | null {
  if (payments.some((payment) => !Number.isSafeInteger(payment.amount) || payment.amount <= 0)) return "Each refund payment needs an amount above 0";
  if (payments.some((payment) => payment.method === "cash" && payment.reference)) return "Only card and other refunds can have a reference";
  if (payments.some((payment) => (payment.reference ?? "").length > 100)) return "Keep the reference under 100 characters";
  if (sumFor(payments, "card") > room.card) return "Card refunds can't be more than was paid by card";
  if (sumFor(payments, "other") > room.other) return "Other refunds can't be more than was paid by other methods";
  if (payments.reduce((sum, payment) => sum + payment.amount, 0) !== total) return "Refund payments must add up to the refund";
  return null;
}
