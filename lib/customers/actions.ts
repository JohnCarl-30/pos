"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-error";
import { customerSchema } from "./schema";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveCustomer(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const parsed = customerSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  if (id) {
    if (!GUID.test(id)) return { ok: false, error: "That customer no longer exists." };
    const { data, error } = await supabase.from("customers").update(parsed.data).eq("id", id).select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || data.length === 0) return { ok: false, error: "That customer no longer exists." };
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { ok: true, message: "Customer saved." };
  }
  const { data: created, error } = await supabase.from("customers").insert(parsed.data).select("id").single();
  if (error || !created) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export async function deleteCustomer(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  if (!GUID.test(id)) return { ok: false, error: "That customer no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error?.code === "23503") return { ok: false, error: "This customer has sales and can't be deleted." };
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data || data.length === 0) return { ok: false, error: "That customer no longer exists." };
  revalidatePath("/customers");
  return { ok: true };
}
