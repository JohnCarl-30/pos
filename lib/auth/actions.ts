"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { HOME_PATH, safeNext } from "./routes";
import { newPasswordSchema, resetRequestSchema, signInSchema } from "./schemas";

export async function signIn(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: "Email or password is incorrect." };
  redirect(safeNext(parsed.data.next));
}

export async function requestPasswordReset(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Couldn't update your password. Request a new reset link." };
  redirect(HOME_PATH);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
