import type { Metadata } from "next";
import StoresTable from "@/components/settings/stores-table";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stores" };

export default async function StoresSettingsPage() {
  await requireRole("owner");
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, address, currency, timezone, prices_include_tax, registers(id, name)")
    .order("name");
  return <StoresTable stores={stores ?? []} />;
}
