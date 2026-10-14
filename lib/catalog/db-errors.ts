import { friendlyDbError } from "@/lib/db-error";

const CONSTRAINTS: Record<string, string> = {
  product_variants_sku_key: "That SKU is already used by another product.",
  product_variants_barcode_key: "That barcode is already used by another product.",
  categories_name_key: "A category with that name already exists.",
};

export function catalogDbError(error: { code?: string; message?: string } | null): string {
  if (error?.code === "P0002") return "That item no longer exists. Reload the page and try again.";
  if (error?.code === "23505" && error.message) {
    const match = Object.keys(CONSTRAINTS).find((name) => error.message!.includes(name));
    if (match) return CONSTRAINTS[match];
  }
  return friendlyDbError(error);
}
