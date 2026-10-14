"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-error";
import { formToObject, taxClassSchema, taxRateSchema } from "./schemas";

const TAX_CLASS_GONE = "That tax class no longer exists. Reload the page and try again.";

export async function saveTaxClass(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = taxClassSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { id, name } = parsed.data;
  if (id) {
    const { data, error } = await supabase.from("tax_classes").update({ name }).eq("id", id).select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || data.length === 0) return { ok: false, error: TAX_CLASS_GONE };
  } else {
    const { error } = await supabase.from("tax_classes").insert({ name });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath("/settings/tax");
  return { ok: true, message: id ? "Tax class renamed." : "Tax class added." };
}

export async function setDefaultTaxClass(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = z.object({ id: z.guid() }).safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: "Pick a tax class." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_default_tax_class", { p_id: parsed.data.id });
  if (error) return { ok: false, error: error.code === "P0002" ? TAX_CLASS_GONE : friendlyDbError(error) };
  revalidatePath("/settings/tax");
  return { ok: true, message: "Default tax class updated." };
}

export async function saveTaxRate(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = taxRateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { storeId, taxClassId, name, rateBps } = parsed.data;
  const { error } = await supabase
    .from("tax_rates")
    .upsert({ store_id: storeId, tax_class_id: taxClassId, name, rate_bps: rateBps }, { onConflict: "store_id,tax_class_id" });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/settings/tax");
  return { ok: true, message: "Rate saved." };
}
