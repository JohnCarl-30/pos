"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { openTabSchema } from "./schemas";
import { tabDbError } from "./errors";

export async function openTab(input: { tableId: string | null; name: string; guests: string }): Promise<{ ok: true; tabId: string } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = openTabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the tab's details." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_tab", {
    p_store_id: store.id,
    p_table_id: parsed.data.tableId ?? undefined,
    p_name: parsed.data.name.trim() || undefined,
    p_guests: parsed.data.guests ?? undefined,
  });
  if (error || !data) return { ok: false, error: tabDbError(error) };
  revalidatePath("/tables");
  return { ok: true, tabId: data };
}
