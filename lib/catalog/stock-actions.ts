"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { catalogDbError } from "./db-errors";
import { parseStockAction, parseStockSettings } from "./stock-form";

function formStrings(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") values[key] = value;
  return values;
}

export async function recordStock(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = parseStockAction(formStrings(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
  const action = parsed.action;
  const supabase = await createClient();

  let error: { code?: string; message?: string } | null = null;
  if (action.kind === "counted") {
    ({ error } = await supabase.rpc("record_stock_count", {
      p_store_id: store.id,
      p_variant_id: action.variantId,
      p_counted: action.counted,
      p_note: action.note ?? undefined,
    }));
  } else if (action.kind === "transfer") {
    ({ error } = await supabase.rpc("transfer_stock", {
      p_from: store.id,
      p_to: action.toStoreId,
      p_variant_id: action.variantId,
      p_quantity: action.quantity,
      p_note: action.note ?? undefined,
    }));
  } else {
    const change = action.kind === "correction" ? action.change : action.kind === "received" ? action.quantity : -action.quantity;
    ({ error } = await supabase.from("stock_movements").insert({
      store_id: store.id,
      variant_id: action.variantId,
      quantity_change: change,
      reason: action.kind,
      staff_id: staff.id,
      note: action.note,
    }));
  }
  if (error) return { ok: false, error: catalogDbError(error) };

  revalidatePath("/products", "layout");
  return { ok: true, message: "Stock updated." };
}

export async function updateStockSettings(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = parseStockSettings(formStrings(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_levels")
    .update({ track: parsed.track, low_stock_at: parsed.lowStockAt })
    .eq("store_id", store.id)
    .eq("variant_id", parsed.variantId)
    .select("variant_id");
  if (error) return { ok: false, error: catalogDbError(error) };
  if (!data || data.length === 0) return { ok: false, error: "That item no longer exists. Reload the page and try again." };

  revalidatePath("/products", "layout");
  return { ok: true, message: "Saved." };
}
