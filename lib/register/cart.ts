import type { CartLineInput, OrderDiscountInput } from "@/lib/checkout";
import { selectionDelta, selectionFromIds, selectionIds, selectionKey, selectionLabel, type ModifierGroup, type Selection } from "@/lib/modifiers";

export type RegisterVariant = { id: string; name: string; sku: string; barcode: string | null; price: number; rateBps: number; track: boolean; quantity: number };
export type RegisterProduct = { id: string; name: string; categoryId: string | null; kitchen: boolean; modifierGroups: ModifierGroup[]; variants: RegisterVariant[] };
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
  product_modifier_groups?: {
    sort_order: number;
    group: {
      id: string;
      name: string;
      min_choices: number;
      max_choices: number;
      active: boolean;
      modifier_options: { id: string; name: string; price_delta: number; active: boolean; sort_order: number }[];
    } | null;
  }[];
};
export type CartLine = {
  key: string;
  variantId: string;
  label: string;
  sku: string;
  basePrice: number;
  price: number;
  optionIds: string[];
  modifierLabel: string;
  kitchen: boolean;
  rateBps: number;
  track: boolean;
  stock: number;
  quantity: number;
  discountBps: number | null;
  discountAmount: number | null;
};
export type Discount = { bps: number } | { amount: number } | null;

export function toRegisterCatalog(
  rows: RegisterCatalogRow[],
  storeId: string,
  rates: { tax_class_id: string; rate_bps: number }[],
  kitchenCategoryIds: ReadonlySet<string> = new Set(),
): RegisterProduct[] {
  const rateFor = new Map(rates.map((rate) => [rate.tax_class_id, rate.rate_bps]));
  return rows
    .filter((row) => row.active)
    .map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      kitchen: row.category_id !== null && kitchenCategoryIds.has(row.category_id),
      modifierGroups: (row.product_modifier_groups ?? [])
        .filter((entry) => entry.group?.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((entry) => {
          const group = entry.group!;
          return {
            id: group.id,
            name: group.name,
            min: group.min_choices,
            max: group.max_choices,
            options: group.modifier_options
              .filter((option) => option.active)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((option) => ({ id: option.id, name: option.name, priceDelta: option.price_delta })),
          };
        }),
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

function buildLine(product: RegisterProduct, variant: RegisterVariant, selection: Selection, quantity: number, discountBps: number | null, discountAmount: number | null): CartLine {
  const optionIds = selectionIds(product.modifierGroups, selection);
  return {
    key: optionIds.length > 0 ? `${variant.id}|${selectionKey(optionIds)}` : variant.id,
    variantId: variant.id,
    label: variantLabel(product, variant),
    sku: variant.sku,
    basePrice: variant.price,
    price: variant.price + selectionDelta(product.modifierGroups, selection),
    optionIds,
    modifierLabel: selectionLabel(product.modifierGroups, selection),
    kitchen: product.kitchen,
    rateBps: variant.rateBps,
    track: variant.track,
    stock: variant.quantity,
    quantity,
    discountBps,
    discountAmount,
  };
}

export function cartLineFor(product: RegisterProduct, variant: RegisterVariant, optionIds: string[], quantity: number, key: string): CartLine {
  return { ...buildLine(product, variant, selectionFromIds(product.modifierGroups, optionIds), quantity, null, null), key };
}

export function addToCart(lines: CartLine[], product: RegisterProduct, variant: RegisterVariant, selection: Selection = {}): CartLine[] {
  const line = buildLine(product, variant, selection, 1, null, null);
  if (lines.some((existing) => existing.key === line.key)) {
    return lines.map((existing) => (existing.key === line.key ? { ...existing, quantity: Math.min(9_999, existing.quantity + 1) } : existing));
  }
  return [...lines, line];
}

export function changeSelection(lines: CartLine[], key: string, product: RegisterProduct, selection: Selection): CartLine[] {
  const line = lines.find((entry) => entry.key === key);
  const variant = line ? product.variants.find((entry) => entry.id === line.variantId) : undefined;
  if (!line || !variant) return lines;
  const next = buildLine(product, variant, selection, line.quantity, line.discountBps, line.discountAmount);
  if (next.key === key) return lines.map((entry) => (entry.key === key ? next : entry));
  if (lines.some((entry) => entry.key === next.key)) {
    return lines
      .filter((entry) => entry.key !== key)
      .map((entry) => (entry.key === next.key ? { ...entry, quantity: Math.min(9_999, entry.quantity + line.quantity) } : entry));
  }
  return lines.map((entry) => (entry.key === key ? next : entry));
}

export function setQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.key !== key);
  return lines.map((line) => (line.key === key ? { ...line, quantity: Math.min(9_999, Math.floor(quantity)) } : line));
}

export function setLineDiscount(lines: CartLine[], key: string, discount: Discount): CartLine[] {
  return lines.map((line) =>
    line.key === key
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
