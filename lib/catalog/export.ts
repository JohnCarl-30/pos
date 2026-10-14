import type { CsvCell } from "@/lib/csv";
import { formatAmount } from "@/lib/money";
import { IMPORT_COLUMNS } from "./import";

export type ExportQueryRow = {
  id: string;
  name: string;
  category: { name: string } | null;
  tax_class: { name: string } | null;
  product_variants: {
    name: string;
    sku: string;
    barcode: string | null;
    price: number;
    cost: number | null;
    active: boolean;
    sort_order: number;
    stock_levels: { store_id: string; quantity: number; track: boolean }[];
  }[];
};

export function buildExportRows(data: ExportQueryRow[], storeId: string, currency: string, productIds: Set<string>): CsvCell[][] {
  const rows: CsvCell[][] = [[...IMPORT_COLUMNS]];
  for (const product of data) {
    if (!productIds.has(product.id)) continue;
    const variants = product.product_variants.filter((variant) => variant.active).sort((a, b) => a.sort_order - b.sort_order);
    for (const variant of variants) {
      const level = variant.stock_levels.find((entry) => entry.store_id === storeId);
      rows.push([
        product.name,
        product.category?.name ?? "",
        variant.name,
        variant.sku,
        variant.barcode ?? "",
        formatAmount(variant.price, currency),
        variant.cost === null ? "" : formatAmount(variant.cost, currency),
        product.tax_class?.name ?? "",
        level?.track === false ? "no" : "yes",
        level && level.track ? level.quantity : "",
      ]);
    }
  }
  return rows;
}
