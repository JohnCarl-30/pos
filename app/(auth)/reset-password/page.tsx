import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthCard from "@/components/auth/auth-card";
import ResetPasswordForm from "@/components/auth/reset-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?error=link-expired");
  return (
    <AuthCard title="Choose a new password" description="You'll stay signed in after saving.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
