"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { catalogDbError } from "./db-errors";
import { parseModifierGroupForm, type ModifierGroupFormInput } from "./modifier-form";

const shape = z.object({
  id: z.guid().optional(),
  name: z.string().max(200),
  min: z.string().max(10),
  max: z.string().max(10),
  active: z.boolean(),
  options: z.array(z.object({ id: z.guid().optional(), name: z.string().max(200), price: z.string().max(30), active: z.boolean() })).max(50),
});

type Result = { ok: true } | { ok: false; error?: string; errors?: Record<string, string> };

function dbMessage(error: { code?: string; message?: string }): string {
  if (error.code === "22023" && error.message) return `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.`;
  return catalogDbError(error);
}

export async function saveModifierGroup(input: ModifierGroupFormInput): Promise<Result> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const parsedShape = shape.safeParse(input);
  if (!parsedShape.success) return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const parsed = parseModifierGroupForm(parsedShape.data, store?.currency ?? "USD");
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_modifier_group", { p_group: parsed.payload });
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath("/products", "layout");
  revalidatePath("/register");
  return { ok: true };
}

export async function setModifierGroupActive(id: string, active: boolean): Promise<Result> {
  await requireRole("manager");
  if (!z.guid().safeParse(id).success) return { ok: false, error: "That group no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("modifier_groups").update({ active }).eq("id", id).select("id");
  if (error) return { ok: false, error: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: "That group no longer exists." };
  revalidatePath("/products", "layout");
  revalidatePath("/register");
  return { ok: true };
}
