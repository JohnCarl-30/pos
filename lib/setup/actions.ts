"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { setupSchema } from "./schema";

export async function completeSetup(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: done } = await admin.rpc("setup_status");
  if (done) {
    return { ok: false, error: "This shop is already set up. Sign in with the owner account instead." };
  }

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.ownerName },
  });
  if (userError || !created.user) {
    return {
      ok: false,
      fieldErrors: { email: "Couldn't create an account with this email. If it's already registered, use a different email." },
    };
  }

  const { error } = await admin.rpc("complete_setup", {
    p_user_id: created.user.id,
    p_owner_name: input.ownerName,
    p_owner_email: input.email,
    p_business_name: input.businessName,
    p_store_name: input.storeName,
    p_currency: input.currency,
    p_prices_include_tax: input.pricing === "inclusive",
    p_tax_rate_bps: input.taxRateBps,
    p_timezone: input.timezone,
  });
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Setup couldn't finish, so nothing was saved. Try again." };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  redirect("/register");
}
