import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleAtLeast, type StaffRole } from "./roles";
import { pickStore, type StaffStore } from "./pick-store";

export const STORE_COOKIE = "pos-store";

export type CurrentStaff = {
  id: string;
  name: string;
  role: StaffRole;
  stores: StaffStore[];
};

export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id, name, role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return null;

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, currency, prices_include_tax")
    .order("name");

  return {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    stores: (stores ?? []).map((store) => ({
      id: store.id,
      name: store.name,
      currency: store.currency,
      pricesIncludeTax: store.prices_include_tax,
    })),
  };
});

export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/auth/signout?error=no-access");
  return staff;
}

export async function requireRole(min: StaffRole): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!roleAtLeast(staff.role, min)) notFound();
  return staff;
}

export async function getCurrentStore(staff: CurrentStaff): Promise<StaffStore | null> {
  const cookieStore = await cookies();
  return pickStore(staff.stores, cookieStore.get(STORE_COOKIE)?.value);
}
