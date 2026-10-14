import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AuthCard from "@/components/auth/auth-card";
import SetupWizard from "@/components/setup/setup-wizard";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set up your shop" };

export default async function SetupPage() {
  const supabase = await createClient();
  const { data: done } = await supabase.rpc("setup_status");
  if (done) notFound();
  return (
    <AuthCard title="Set up your shop" description="Three quick steps. You can change all of this later in Settings.">
      <SetupWizard />
    </AuthCard>
  );
}
