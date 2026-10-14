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
  const { id, pricing, ...fields } = parsed.data;
  const row = { ...fields, prices_include_tax: pricing === "inclusive" };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("stores").update(row).eq("id", id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { data: store, error } = await supabase.from("stores").insert(row).select("id").single();
    if (error || !store) return { ok: false, error: friendlyDbError(error) };
    await supabase.from("registers").insert({ store_id: store.id, name: "Register 1" });
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
