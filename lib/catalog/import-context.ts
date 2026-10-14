import type { ImportContext } from "./import";

export type ImportContextRaw = {
  taxClasses: { id: string; name: string; is_default: boolean }[];
  categories: { name: string }[];
  products: { name: string; active: boolean }[];
  variants: {
    sku: string;
    name: string;
    barcode: string | null;
    price: number;
    cost: number | null;
    product: { name: string; tax_class_id: string; category: { name: string } | null } | null;
    stock_levels: { store_id: string; track: boolean; quantity: number }[];
  }[];
};

export function buildImportContext(raw: ImportContextRaw, storeId: string, currency: string): ImportContext {
  return {
    currency,
    defaultTaxClassId: raw.taxClasses.find((taxClass) => taxClass.is_default)?.id ?? raw.taxClasses[0]?.id ?? "",
    taxClasses: raw.taxClasses.map(({ id, name }) => ({ id, name })),
    categories: raw.categories,
    products: raw.products,
    variants: raw.variants.map((variant) => ({
      sku: variant.sku,
      name: variant.name,
      barcode: variant.barcode,
      price: variant.price,
      cost: variant.cost,
      track: variant.stock_levels.find((level) => level.store_id === storeId)?.track ?? true,
      quantity: variant.stock_levels.find((level) => level.store_id === storeId)?.quantity ?? 0,
      productName: variant.product?.name ?? "",
      categoryName: variant.product?.category?.name ?? null,
      taxClassId: variant.product?.tax_class_id ?? "",
    })),
  };
}
