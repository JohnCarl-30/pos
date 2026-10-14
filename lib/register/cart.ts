import type { CartLineInput, OrderDiscountInput } from "@/lib/checkout";

export type RegisterVariant = { id: string; name: string; sku: string; barcode: string | null; price: number; rateBps: number; track: boolean; quantity: number };
export type RegisterProduct = { id: string; name: string; categoryId: string | null; variants: RegisterVariant[] };
export type RegisterCatalogRow = {
  id: string;
  name: string;
  active: boolean;
  category_id: string | null;
  tax_class_id: string;
  product_variants: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    price: number;
    active: boolean;
    sort_order: number;
    stock_levels: { store_id: string; quantity: number; track: boolean }[];
  }[];
};
export type CartLine = {
  variantId: string;
  label: string;
  sku: string;
  price: number;
  rateBps: number;
  track: boolean;
  stock: number;
  quantity: number;
  discountBps: number | null;
  discountAmount: number | null;
};
export type Discount = { bps: number } | { amount: number } | null;

export function toRegisterCatalog(rows: RegisterCatalogRow[], storeId: string, rates: { tax_class_id: string; rate_bps: number }[]): RegisterProduct[] {
  const rateFor = new Map(rates.map((rate) => [rate.tax_class_id, rate.rate_bps]));
  return rows
    .filter((row) => row.active)
    .map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      variants: row.product_variants
        .filter((variant) => variant.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((variant) => {
          const level = variant.stock_levels.find((entry) => entry.store_id === storeId);
          return {
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            barcode: variant.barcode,
            price: variant.price,
            rateBps: rateFor.get(row.tax_class_id) ?? 0,
            track: level?.track ?? false,
            quantity: level?.quantity ?? 0,
          };
        }),
    }))
    .filter((product) => product.variants.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findByCode(products: RegisterProduct[], code: string): { product: RegisterProduct; variant: RegisterVariant } | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.barcode === trimmed || variant.sku.toLowerCase() === trimmed.toLowerCase()) return { product, variant };
    }
  }
  return null;
}

export function searchProducts(products: RegisterProduct[], query: string, categoryId: string): RegisterProduct[] {
  const needle = query.trim().toLowerCase();
  return products.filter(
    (product) =>
      (!categoryId || product.categoryId === categoryId) &&
      (!needle || product.name.toLowerCase().includes(needle) || product.variants.some((variant) => variant.sku.toLowerCase().includes(needle))),
  );
}

export function variantLabel(product: RegisterProduct, variant: RegisterVariant): string {
  return variant.name === "Default" ? product.name : `${product.name} – ${variant.name}`;
}

export function addToCart(lines: CartLine[], product: RegisterProduct, variant: RegisterVariant): CartLine[] {
  if (lines.some((line) => line.variantId === variant.id)) {
    return lines.map((line) => (line.variantId === variant.id ? { ...line, quantity: Math.min(9_999, line.quantity + 1) } : line));
  }
  return [
    ...lines,
    {
      variantId: variant.id,
      label: variantLabel(product, variant),
      sku: variant.sku,
      price: variant.price,
      rateBps: variant.rateBps,
      track: variant.track,
      stock: variant.quantity,
      quantity: 1,
      discountBps: null,
      discountAmount: null,
    },
  ];
}

export function setQuantity(lines: CartLine[], variantId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.variantId !== variantId);
  return lines.map((line) => (line.variantId === variantId ? { ...line, quantity: Math.min(9_999, Math.floor(quantity)) } : line));
}

export function setLineDiscount(lines: CartLine[], variantId: string, discount: Discount): CartLine[] {
  return lines.map((line) =>
    line.variantId === variantId
      ? {
          ...line,
          discountBps: discount && "bps" in discount ? discount.bps : null,
          discountAmount: discount && "amount" in discount ? discount.amount : null,
        }
      : line,
  );
}

export function cartInputs(lines: CartLine[]): CartLineInput[] {
  return lines.map((line) => ({ price: line.price, quantity: line.quantity, rateBps: line.rateBps, discountBps: line.discountBps, discountAmount: line.discountAmount }));
}

export function isOverStock(line: CartLine): boolean {
  return line.track && line.quantity > line.stock;
}

export function discountInput(discount: Discount): OrderDiscountInput {
  if (!discount) return null;
  return "bps" in discount ? { bps: discount.bps } : { amount: discount.amount };
}
