"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { CsvError, parseCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/supabase/fetch-all";
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
  let raw: ImportContextRaw;
  try {
    const [taxClasses, categories, products, variants] = await Promise.all([
      fetchAll((from, to) => supabase.from("tax_classes").select("id, name, is_default").order("id").range(from, to)),
      fetchAll((from, to) => supabase.from("categories").select("name").order("id").range(from, to)),
      fetchAll((from, to) => supabase.from("products").select("name, active").order("id").range(from, to)),
      fetchAll((from, to) =>
        supabase
          .from("product_variants")
          .select("sku, name, barcode, price, cost, product:products(name, tax_class_id, category:categories(name)), stock_levels(store_id, track, quantity)")
          .order("id")
          .range(from, to),
      ),
    ]);
    raw = { taxClasses, categories, products, variants: variants as unknown as ImportContextRaw["variants"] };
  } catch (error) {
    return { error: catalogDbError(error as { code?: string; message?: string }) };
  }
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
