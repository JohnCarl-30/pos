import type { OrderStatus } from "@/lib/orders/list";

export type CustomerRow = { id: string; name: string; email: string | null; phone: string | null; totalSpent: number; lastVisit: string | null };
export type CustomerSale = { customer_id: string; total: number; created_at: string; status: OrderStatus; refunds: { total: number }[] };
export type CustomerFilters = { q: string; page: number };

export const CUSTOMER_PAGE_SIZE = 50;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseCustomerFilters(params: Record<string, string | string[] | undefined>): CustomerFilters {
  const page = Number.parseInt(first(params.page), 10);
  return { q: first(params.q).trim().slice(0, 60), page: Number.isFinite(page) && page > 0 ? page : 1 };
}

export function summariseCustomers(customers: { id: string; name: string; email: string | null; phone: string | null }[], sales: CustomerSale[]): CustomerRow[] {
  const spent = new Map<string, number>();
  const last = new Map<string, string>();
  for (const sale of sales) {
    if (sale.status === "voided") continue;
    const net = sale.total - sale.refunds.reduce((sum, refund) => sum + refund.total, 0);
    spent.set(sale.customer_id, (spent.get(sale.customer_id) ?? 0) + net);
    const seen = last.get(sale.customer_id);
    if (!seen || sale.created_at > seen) last.set(sale.customer_id, sale.created_at);
  }
  return customers
    .map((customer) => ({ ...customer, totalSpent: spent.get(customer.id) ?? 0, lastVisit: last.get(customer.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchCustomers(rows: CustomerRow[], q: string): CustomerRow[] {
  const query = q.toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => [row.name, row.email ?? "", row.phone ?? ""].some((value) => value.toLowerCase().includes(query)));
}

export function pageOf<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages, total: rows.length };
}
