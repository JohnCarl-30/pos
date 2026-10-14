"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { catalogDbError } from "./db-errors";
import { clashErrors } from "./clashes";
import { parseProductForm } from "./product-form";
import { productFormInputSchema } from "./product-input";

export async function saveProduct(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, error: "Something went wrong. Reload the page and try again." };
  }
  const shape = productFormInputSchema.safeParse(raw);
  if (!shape.success) return { ok: false, error: "Something went wrong. Reload the page and try again." };

  const parsed = parseProductForm(shape.data, store.currency);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  const supabase = await createClient();
  const skus = parsed.variants.map((variant) => variant.sku);
  const barcodes = parsed.variants.flatMap((variant) => (variant.barcode ? [variant.barcode] : []));
  const select = "id, sku, barcode, product:products(name)";
  const [bySku, byBarcode] = await Promise.all([
    supabase.from("product_variants").select(select).in("sku", skus),
    barcodes.length ? supabase.from("product_variants").select(select).in("barcode", barcodes) : Promise.resolve({ data: [], error: null }),
  ]);
  if (bySku.error || byBarcode.error) return { ok: false, error: catalogDbError(bySku.error ?? byBarcode.error) };
  const existing = [...(bySku.data ?? []), ...(byBarcode.data ?? [])].map((row) => ({
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    productName: (row.product as { name: string } | null)?.name ?? "another product",
  }));
  const clashes = clashErrors(parsed.variants, existing);
  if (Object.keys(clashes).length > 0) return { ok: false, fieldErrors: clashes };

  const { data: productId, error } = await supabase.rpc("save_product", {
    p_store_id: store.id,
    p_product: parsed.product,
    p_variants: parsed.variants,
  });
  if (error || !productId) return { ok: false, error: catalogDbError(error) };

  revalidatePath("/products", "layout");
  if (!parsed.product.id) redirect(`/products/${productId}`);
  return { ok: true, message: "Product saved." };
}
