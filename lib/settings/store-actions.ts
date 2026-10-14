"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-error";
import { formToObject, registerSchema, storeSchema } from "./schemas";

export async function saveStore(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = storeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { id, pricing, maxCashierDiscount, receiptFooter, ...fields } = parsed.data;
  const row = { ...fields, prices_include_tax: pricing === "inclusive", max_cashier_discount_bps: maxCashierDiscount, receipt_footer: receiptFooter };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("stores").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || data.length === 0) return { ok: false, error: "That store no longer exists. Reload the page and try again." };
  } else {
    const { data: store, error } = await supabase.from("stores").insert(row).select("id").single();
    if (error || !store) return { ok: false, error: friendlyDbError(error) };
    const { error: registerError } = await supabase.from("registers").insert({ store_id: store.id, name: "Register 1" });
    if (registerError) {
      revalidatePath("/", "layout");
      return { ok: false, error: "The store was added, but its first register wasn't. Use Add register to create one." };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Store saved." : "Store added." };
}

export async function createRegister(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = registerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("registers").insert({ store_id: parsed.data.storeId, name: parsed.data.name });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/settings/stores");
  return { ok: true, message: "Register added." };
}
