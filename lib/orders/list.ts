import type { Database } from "@/lib/supabase/database.types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  completed: "Completed",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  voided: "Voided",
};

export const ORDER_PAGE_SIZE = 50;

export type OrderFilters = { q: string; from: string; to: string; status: OrderStatus | ""; register: string; cashier: string; page: number };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function day(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}

export function parseOrderFilters(params: Record<string, string | string[] | undefined>): OrderFilters {
  const status = first(params.status);
  const register = first(params.register);
  const cashier = first(params.cashier);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).trim().slice(0, 60),
    from: day(first(params.from)),
    to: day(first(params.to)),
    status: Object.hasOwn(ORDER_STATUS_LABELS, status) ? (status as OrderStatus) : "",
    register: GUID.test(register) ? register : "",
    cashier: GUID.test(cashier) ? cashier : "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function receiptNumberFrom(q: string): number | null {
  const match = /^#?(\d{1,9})$/.exec(q.trim());
  return match ? Number(match[1]) : null;
}

export function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, "")}%`;
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function zonedDayStart(date: string, timeZone: string): Date {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, dayOfMonth);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

export function nextDay(date: string): string {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth + 1)).toISOString().slice(0, 10);
}
