import { friendlyDbError } from "@/lib/db-error";
import { formatMoney } from "@/lib/money";

export type OrderErrorKind = "approval" | "closed";

const MESSAGES: [string, string][] = [
  ["till is closed — refund it instead", "This sale can't be voided: its till has been closed. Refund it instead."],
  ["till is closed", "Open a till to give refunds."],
  ["refund needs approval", "This refund needs a manager's approval."],
  ["sale has refunds", "This sale has refunds and can't be voided."],
  ["you can only void your own sales", "You can only void your own sales."],
  ["sale is already voided", "This sale is already voided."],
  ["sale is voided", "This sale was voided, so it can't be refunded."],
  ["sale not found", "That sale no longer exists."],
];

export function orderDbError(error: { code?: string; message?: string } | null, currency: string): string {
  if (!error) return "Something went wrong. Try again.";
  const message = error.message ?? "";
  const left = /^only (\d+) left to refund on (.+)$/.exec(message);
  if (left) return `Only ${left[1]} left to refund on ${left[2]}.`;
  const cap = /^(card|other) refunds can't be more than (\d+)$/.exec(message);
  if (cap) return `${cap[1] === "card" ? "Card" : "Other"} refunds can't be more than ${formatMoney(Number(cap[2]), currency, "en-US")}. Use cash for the rest.`;
  const known = MESSAGES.find(([key]) => message.includes(key));
  if (known) return known[1];
  if (error.code === "22023" && message) return `${message.charAt(0).toUpperCase()}${message.slice(1)}.`;
  return friendlyDbError(error);
}

export function orderErrorKind(error: { message?: string } | null): OrderErrorKind | null {
  const message = error?.message ?? "";
  if (message.includes("refund needs approval")) return "approval";
  if (message === "till is closed") return "closed";
  return null;
}
