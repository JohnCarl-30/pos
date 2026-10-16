"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { tabDbError } from "@/lib/tabs/errors";

type Result = { ok: true } | { ok: false; error: string };

export async function finishTicket(ticketId: string): Promise<Result> {
  await requireStaff();
  if (!z.guid().safeParse(ticketId).success) return { ok: false, error: "That ticket no longer exists." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("finish_ticket", { p_ticket_id: ticketId });
  if (error) return { ok: false, error: tabDbError(error) };
  revalidatePath("/kitchen");
  return { ok: true };
}

export async function recallTicket(): Promise<Result> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recall_ticket", { p_store_id: store.id });
  if (error) return { ok: false, error: tabDbError(error) };
  if (!data) return { ok: false, error: "No ticket was finished in the last 12 hours." };
  revalidatePath("/kitchen");
  return { ok: true };
}
