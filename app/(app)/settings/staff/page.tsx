import type { Metadata } from "next";
import StaffTable from "@/components/settings/staff-table";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffSettingsPage() {
  await requireRole("owner");
  const supabase = await createClient();
  const [{ data: staff }, { data: stores }] = await Promise.all([
    supabase.from("staff").select("id, name, email, role, active, staff_stores(store_id)").order("name"),
    supabase.from("stores").select("id, name").order("name"),
  ]);

  const rows = (staff ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    active: member.active,
    storeIds: member.staff_stores.map((assignment) => assignment.store_id),
  }));

  return <StaffTable staff={rows} stores={stores ?? []} />;
}
