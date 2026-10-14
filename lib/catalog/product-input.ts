import { z } from "zod";
import { formatAmount } from "@/lib/money";
import type { ProductFormInput } from "./product-form";

const variantInput = z.object({
  id: z.string().optional(),
  name: z.string().max(200),
  sku: z.string().max(200),
  barcode: z.string().max(200),
  price: z.string().max(50),
  cost: z.string().max(50),
  track: z.boolean(),
  active: z.boolean(),
});

export const productFormInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(500),
  categoryId: z.string().max(100),
  taxClassId: z.string().max(100),
  description: z.string().max(2000),
  active: z.boolean(),
  variants: z.array(variantInput).max(100),
});

type ProductRecord = { id: string; name: string; description: string | null; active: boolean; category_id: string | null; tax_class_id: string };
type VariantRecord = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  cost: number | null;
  active: boolean;
  sort_order: number;
  stock_levels: { store_id: string; track: boolean }[];
};

export function toProductFormInput(product: ProductRecord, variants: VariantRecord[], storeId: string, currency: string): ProductFormInput {
  return {
    id: product.id,
    name: product.name,
    categoryId: product.category_id ?? "",
    taxClassId: product.tax_class_id,
    description: product.description ?? "",
    active: product.active,
    variants: [...variants]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode ?? "",
        price: formatAmount(variant.price, currency),
        cost: variant.cost === null ? "" : formatAmount(variant.cost, currency),
        track: variant.stock_levels.find((level) => level.store_id === storeId)?.track ?? true,
        active: variant.active,
      })),
  };
}
