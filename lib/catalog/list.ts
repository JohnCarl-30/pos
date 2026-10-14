import { formatMoney } from "@/lib/money";

export type ProductQueryRow = {
  id: string;
  name: string;
  active: boolean;
  category: { id: string; name: string } | null;
  product_variants: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    price: number;
    active: boolean;
    stock_levels: { store_id: string; quantity: number; track: boolean; low_stock_at: number | null }[];
  }[];
};

export type ProductRow = {
  id: string;
  name: string;
  active: boolean;
  categoryId: string | null;
  categoryName: string | null;
  variantCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  trackedStock: number | null;
  lowStock: boolean;
  search: string;
};

export type ProductFilters = { q: string; category: string; view: "active" | "low" | "archived"; page: number };

export const PAGE_SIZE = 50;

export function toProductRows(data: ProductQueryRow[], storeId: string): ProductRow[] {
  return data.map((product) => {
    const variants = product.product_variants.filter((variant) => variant.active);
    const prices = variants.map((variant) => variant.price);
    const levels = variants.flatMap((variant) => variant.stock_levels.filter((level) => level.store_id === storeId && level.track));
    return {
      id: product.id,
      name: product.name,
      active: product.active,
      categoryId: product.category?.id ?? null,
      categoryName: product.category?.name ?? null,
      variantCount: variants.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      trackedStock: levels.length ? levels.reduce((sum, level) => sum + level.quantity, 0) : null,
      lowStock: levels.some((level) => level.low_stock_at !== null && level.quantity <= level.low_stock_at),
      search: [product.name, ...product.product_variants.flatMap((variant) => [variant.sku, variant.barcode ?? ""])].join(" ").toLowerCase(),
    };
  });
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseProductFilters(params: Record<string, string | string[] | undefined>): ProductFilters {
  const view = first(params.view);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).trim(),
    category: first(params.category),
    view: view === "low" || view === "archived" ? view : "active",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function matchProductRows(rows: ProductRow[], filters: ProductFilters): ProductRow[] {
  const query = filters.q.toLowerCase();
  return rows
    .filter((row) => (filters.view === "archived" ? !row.active : row.active))
    .filter((row) => filters.view !== "low" || row.lowStock)
    .filter((row) => !filters.category || row.categoryId === filters.category)
    .filter((row) => !query || row.search.includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterProductRows(rows: ProductRow[], filters: ProductFilters) {
  const matching = matchProductRows(rows, filters);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  return { rows: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matching.length, pages };
}

export function formatPriceRange(row: ProductRow, currency: string): string {
  if (row.minPrice === null || row.maxPrice === null) return "—";
  if (row.minPrice === row.maxPrice) return formatMoney(row.minPrice, currency, "en-US");
  return `${formatMoney(row.minPrice, currency, "en-US")} – ${formatMoney(row.maxPrice, currency, "en-US")}`;
}
