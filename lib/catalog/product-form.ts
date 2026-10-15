import { parseMoney } from "@/lib/money";

export type ProductFormInput = {
  id?: string;
  name: string;
  categoryId: string;
  taxClassId: string;
  description: string;
  active: boolean;
  modifierGroupIds?: string[];
  variants: {
    id?: string;
    name: string;
    sku: string;
    barcode: string;
    price: string;
    cost: string;
    track: boolean;
    active: boolean;
  }[];
};

export type SaveProductPayload = {
  id?: string;
  name: string;
  category_id: string | null;
  tax_class_id: string;
  description: string | null;
  active: boolean;
  modifier_group_ids?: string[];
};

export type SaveVariantPayload = {
  id?: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  cost: number | null;
  track: boolean;
  active: boolean;
  sort_order: number;
};

type ParseResult =
  | { ok: true; product: SaveProductPayload; variants: SaveVariantPayload[] }
  | { ok: false; fieldErrors: Record<string, string> };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseProductForm(input: ProductFormInput, currency: string): ParseResult {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name) errors.name = "Enter a product name";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters";
  if (!GUID.test(input.taxClassId)) errors.taxClassId = "Pick a tax class";
  if (input.categoryId && !GUID.test(input.categoryId)) errors.categoryId = "Pick a category";
  if (input.variants.filter((variant) => variant.active).length === 0) errors.variants = "Keep at least one active variant";

  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();
  const variants: SaveVariantPayload[] = [];

  input.variants.forEach((variant, index) => {
    const key = (field: string) => `variants.${index}.${field}`;
    const variantName = variant.name.trim() || "Default";
    const sku = variant.sku.trim();
    const barcode = variant.barcode.trim();
    if (variantName.length > 60) errors[key("name")] = "Keep the variant name under 60 characters";
    if (!sku) errors[key("sku")] = "Enter a SKU";
    else if (seenSku.has(sku.toLowerCase())) errors[key("sku")] = "This SKU is already used on another row";
    if (barcode && seenBarcode.has(barcode)) errors[key("barcode")] = "This barcode is already used on another row";
    if (sku) seenSku.add(sku.toLowerCase());
    if (barcode) seenBarcode.add(barcode);

    const price = parseMoney(variant.price, currency);
    if (price === null || price < 0) errors[key("price")] = "Enter a price like 4.50";
    const cost = variant.cost.trim() === "" ? null : parseMoney(variant.cost, currency);
    if (variant.cost.trim() !== "" && (cost === null || cost < 0)) errors[key("cost")] = "Enter a cost like 1.20, or leave it empty";

    variants.push({
      ...(variant.id ? { id: variant.id } : {}),
      name: variantName,
      sku,
      barcode: barcode || null,
      price: price ?? 0,
      cost,
      track: variant.track,
      active: variant.active,
      sort_order: index,
    });
  });

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    product: {
      ...(input.id ? { id: input.id } : {}),
      name,
      category_id: input.categoryId || null,
      tax_class_id: input.taxClassId,
      description: input.description.trim() || null,
      active: input.active,
      ...(input.modifierGroupIds ? { modifier_group_ids: input.modifierGroupIds.filter((id) => GUID.test(id)) } : {}),
    },
    variants,
  };
}
