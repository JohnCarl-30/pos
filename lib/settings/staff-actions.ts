"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-error";
import { formToObject, staffCreateSchema, staffUpdateSchema } from "./schemas";
import { staffChangeError } from "./staff-rules";

const STAFF_NOT_FOUND = "That staff member no longer exists. Reload the page and try again.";

export async function createStaff(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = staffCreateSchema.safeParse(formToObject(formData, ["storeIds"]));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (userError || !created.user) {
    return {
      ok: false,
      fieldErrors: { email: "Couldn't create an account with this email. If it's already registered, use a different email." },
    };
  }

  const supabase = await createClient();
  const { data: staff, error } = await supabase
    .from("staff")
    .insert({ user_id: created.user.id, name: input.name, email: input.email, role: input.role })
    .select("id")
    .single();
  if (error || !staff) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteUserError) console.error("createStaff: failed to delete the auth user after a failed staff insert", deleteUserError);
    return { ok: false, error: friendlyDbError(error) };
  }

  const { error: accessError } = await supabase.rpc("set_staff_access", {
    p_staff_id: staff.id,
    p_role: input.role,
    p_active: true,
    p_store_ids: input.storeIds,
  });
  if (accessError) {
    const { error: deleteStaffError } = await supabase.from("staff").delete().eq("id", staff.id);
    if (deleteStaffError) console.error("createStaff: failed to delete the staff row after a failed access grant", deleteStaffError);
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteUserError) console.error("createStaff: failed to delete the auth user after a failed access grant", deleteUserError);
    return { ok: false, error: friendlyDbError(accessError) };
  }

  revalidatePath("/settings/staff");
  return { ok: true, message: `${input.name} can now sign in with the temporary password.` };
}

export async function updateStaff(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireRole("owner");
  const parsed = staffUpdateSchema.safeParse(formToObject(formData, ["storeIds"]));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const input = parsed.data;

  const blocked = staffChangeError({
    actorStaffId: actor.id,
    targetStaffId: input.id,
    nextRole: input.role,
    nextActive: input.active,
  });
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_access", {
    p_staff_id: input.id,
    p_role: input.role,
    p_active: input.active,
    p_store_ids: input.storeIds,
  });
  if (error) return { ok: false, error: error.code === "P0002" ? STAFF_NOT_FOUND : friendlyDbError(error) };

  revalidatePath("/settings/staff");
  return { ok: true, message: "Staff member saved." };
}
