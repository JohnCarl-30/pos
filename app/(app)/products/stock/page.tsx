import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import HistoryFiltersBar from "@/components/products/history-filters";
import Pagination from "@/components/products/pagination";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { HISTORY_PAGE_SIZE, STOCK_REASON_LABELS, dayRange, formatChange, parseHistoryFilters, type StockReason } from "@/lib/catalog/history";

export const metadata: Metadata = { title: "Stock history" };

type StockHistoryPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type HistoryRow = {
  id: string;
  quantity_change: number;
  reason: StockReason;
  note: string | null;
  created_at: string;
  staff: { name: string } | null;
  variant: { name: string; sku: string; product: { name: string } | null } | null;
};

export default async function StockHistoryPage({ searchParams }: StockHistoryPageProps) {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const params = await searchParams;
  const filters = parseHistoryFilters(params);
  const supabase = await createClient();

  let variantIds: string[] | null = null;
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[%_]/g, "")}%`;
    const [bySku, byProduct] = await Promise.all([
      supabase.from("product_variants").select("id").ilike("sku", pattern),
      supabase.from("product_variants").select("id, product:products!inner(name)").ilike("product.name", pattern),
    ]);
    variantIds = [...new Set([...(bySku.data ?? []), ...(byProduct.data ?? [])].map((row) => row.id))];
  }

  const from = (filters.page - 1) * HISTORY_PAGE_SIZE;
  let query = supabase
    .from("stock_movements")
    .select("id, quantity_change, reason, note, created_at, staff:staff(name), variant:product_variants(name, sku, product:products(name))", { count: "exact" })
    .eq("store_id", store?.id ?? "")
    .order("created_at", { ascending: false })
    .range(from, from + HISTORY_PAGE_SIZE - 1);
  if (filters.reason) query = query.eq("reason", filters.reason);
  const range = dayRange(filters.from, filters.to);
  if (range.gte) query = query.gte("created_at", range.gte);
  if (range.lt) query = query.lt("created_at", range.lt);
  if (variantIds) query = query.in("variant_id", variantIds.length ? variantIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data, count } = store ? await query : { data: [], count: 0 };
  const rows = (data ?? []) as unknown as HistoryRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

  const hrefFor = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value) next.set(key, value);
    next.set("page", String(page));
    return `/products/stock?${next.toString()}`;
  };

  return (
    <section id="stock-history" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Stock history" actions={<Button href="/products" variant="ghost" size="md">Back to products</Button>} />
      <HistoryFiltersBar filters={filters} />
      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <EmptyState title="No stock changes match" description="Try a wider date range or a different reason." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{dateFormat.format(new Date(row.created_at))}</TableCell>
                  <TableCell>
                    <span className="block">{row.variant?.product?.name ?? "—"}</span>
                    <span className="caption-style text-subtle block">{row.variant ? `${row.variant.name} · ${row.variant.sku}` : ""}</span>
                  </TableCell>
                  <TableCell>{STOCK_REASON_LABELS[row.reason]}</TableCell>
                  <TableCell className={row.quantity_change < 0 ? "text-danger" : "text-success"}>{formatChange(row.quantity_change)}</TableCell>
                  <TableCell>{row.staff?.name ?? "—"}</TableCell>
                  <TableCell>{row.note ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
      <Pagination page={Math.min(filters.page, pages)} pages={pages} total={total} hrefFor={hrefFor} />
    </section>
  );
}
