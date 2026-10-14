"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { CsvError, parseCsv } from "@/lib/csv";
import { catalogDbError } from "./db-errors";
import { validateImport, type ImportPreview } from "./import";
import { buildImportContext, type ImportContextRaw } from "./import-context";

export type ImportState = { preview: ImportPreview | null; error: string | null; applied: number | null };

const MAX_IMPORT_BYTES = 2_000_000;

async function prepare(formData: FormData): Promise<{ error: string } | { preview: ImportPreview; storeId: string }> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) return { error: "Pick a store in the sidebar first." };
  const text = String(formData.get("csv") ?? "");
  if (!text.trim()) return { error: "Choose a CSV file first." };
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { error: "The file is larger than 2 MB. Split it into smaller files." };

  let parsed: { header: string[]; rows: string[][] };
  try {
    parsed = parseCsv(text);
  } catch (error) {
    return { error: error instanceof CsvError ? error.message : "That file couldn't be read as a CSV." };
  }

  const supabase = await createClient();
  const [taxClasses, categories, products, variants] = await Promise.all([
    supabase.from("tax_classes").select("id, name, is_default"),
    supabase.from("categories").select("name"),
    supabase.from("products").select("name, active"),
    supabase.from("product_variants").select("sku, name, barcode, price, cost, product:products(name, tax_class_id, category:categories(name)), stock_levels(store_id, track)"),
  ]);
  const failed = taxClasses.error ?? categories.error ?? products.error ?? variants.error;
  if (failed) return { error: catalogDbError(failed) };

  const raw = {
    taxClasses: taxClasses.data ?? [],
    categories: categories.data ?? [],
    products: products.data ?? [],
    variants: (variants.data ?? []) as unknown as ImportContextRaw["variants"],
  };
  return { preview: validateImport(parsed.header, parsed.rows, buildImportContext(raw, store.id, store.currency)), storeId: store.id };
}

export async function previewImport(_: ImportState, formData: FormData): Promise<ImportState> {
  const result = await prepare(formData);
  if ("error" in result) return { preview: null, error: result.error, applied: null };
  return { preview: result.preview, error: result.preview.fileError, applied: null };
}

export async function applyImport(_: ImportState, formData: FormData): Promise<ImportState> {
  const result = await prepare(formData);
  if ("error" in result) return { preview: null, error: result.error, applied: null };
  const { preview, storeId } = result;
  if (preview.fileError || preview.summary.error > 0) return { preview, error: "Fix the rows with errors, then preview again.", applied: null };
  if (preview.apply.length === 0) return { preview, error: null, applied: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_catalog", { p_store_id: storeId, p_rows: preview.apply });
  if (error) return { preview, error: `Nothing was imported. ${catalogDbError(error)}`, applied: null };

  revalidatePath("/products", "layout");
  return { preview: null, error: null, applied: data ?? preview.apply.length };
}
