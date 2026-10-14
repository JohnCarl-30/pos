"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { catalogDbError } from "./db-errors";
import { moveInOrder } from "./category-order";

const GONE = "That category no longer exists. Reload the page and try again.";

const categorySchema = z.object({
  id: z.preprocess((value) => (value === "" ? undefined : value), z.guid().optional()),
  name: z.string().trim().min(1, "Enter a category name").max(60, "Keep it under 60 characters"),
});

export async function saveCategory(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("manager");
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const supabase = await createClient();
  const { id, name } = parsed.data;
  if (id) {
    const { data, error } = await supabase.from("categories").update({ name }).eq("id", id).select("id");
    if (error) return { ok: false, error: catalogDbError(error) };
    if (!data || data.length === 0) return { ok: false, error: GONE };
  } else {
    const { count } = await supabase.from("categories").select("id", { count: "exact", head: true });
    const { error } = await supabase.from("categories").insert({ name, sort_order: count ?? 0 });
    if (error) return { ok: false, error: catalogDbError(error) };
  }
  revalidatePath("/products", "layout");
  return { ok: true, message: id ? "Category renamed." : "Category added." };
}

export async function moveCategory(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("manager");
  const parsed = z.object({ id: z.guid(), direction: z.enum(["-1", "1"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Pick a category to move." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id").order("sort_order").order("name");
  if (error) return { ok: false, error: catalogDbError(error) };
  const order = moveInOrder((data ?? []).map((row) => row.id), parsed.data.id, Number(parsed.data.direction) as -1 | 1);
  for (const [index, id] of order.entries()) {
    const { error: updateError } = await supabase.from("categories").update({ sort_order: index }).eq("id", id);
    if (updateError) return { ok: false, error: catalogDbError(updateError) };
  }
  revalidatePath("/products", "layout");
  return { ok: true };
}

export async function deleteCategory(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("manager");
  const parsed = z.object({ id: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Pick a category to remove." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").delete().eq("id", parsed.data.id).select("id");
  if (error) return { ok: false, error: catalogDbError(error) };
  if (!data || data.length === 0) return { ok: false, error: GONE };
  revalidatePath("/products", "layout");
  return { ok: true, message: "Category removed. Its products are now uncategorised." };
}
