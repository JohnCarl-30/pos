"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { moveInOrder } from "@/lib/catalog/category-order";
import { areaSchema, tableSchema } from "@/lib/tabs/schemas";
import { tabDbError } from "@/lib/tabs/errors";

const GONE = "That no longer exists. Reload the page and try again.";

async function context() {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  return { store, supabase: await createClient() };
}

function done(): ActionResult {
  revalidatePath("/tables", "layout");
  return { ok: true };
}

export async function saveArea(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { store, supabase } = await context();
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = areaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { id, name } = parsed.data;
  if (id) {
    const { data, error } = await supabase.from("dining_areas").update({ name }).eq("id", id).select("id");
    if (error) return { ok: false, error: tabDbError(error) };
    if (!data?.length) return { ok: false, error: GONE };
  } else {
    const { count } = await supabase.from("dining_areas").select("id", { count: "exact", head: true }).eq("store_id", store.id);
    const { error } = await supabase.from("dining_areas").insert({ store_id: store.id, name, sort_order: count ?? 0 });
    if (error) return { ok: false, error: tabDbError(error) };
  }
  return done();
}

export async function saveTable(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { store, supabase } = await context();
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = tableSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { id, areaId, name, seats } = parsed.data;
  if (id) {
    const { data, error } = await supabase.from("dining_tables").update({ name, seats }).eq("id", id).select("id");
    if (error) return { ok: false, error: tabDbError(error) };
    if (!data?.length) return { ok: false, error: GONE };
  } else {
    const { count } = await supabase.from("dining_tables").select("id", { count: "exact", head: true }).eq("area_id", areaId);
    const { error } = await supabase.from("dining_tables").insert({ store_id: store.id, area_id: areaId, name, seats, sort_order: count ?? 0 });
    if (error) return { ok: false, error: tabDbError(error) };
  }
  return done();
}

export async function setActive(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { supabase } = await context();
  const parsed = z.object({ kind: z.enum(["area", "table"]), id: z.guid(), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: GONE };
  const table = parsed.data.kind === "area" ? "dining_areas" : "dining_tables";
  const { data, error } = await supabase.from(table).update({ active: parsed.data.active === "true" }).eq("id", parsed.data.id).select("id");
  if (error) return { ok: false, error: tabDbError(error) };
  if (!data?.length) return { ok: false, error: GONE };
  return done();
}

export async function move(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { store, supabase } = await context();
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = z.object({ kind: z.enum(["area", "table"]), id: z.guid(), direction: z.enum(["-1", "1"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: GONE };
  const direction = Number(parsed.data.direction) as -1 | 1;
  if (parsed.data.kind === "area") {
    const { data } = await supabase.from("dining_areas").select("id").eq("store_id", store.id).order("sort_order").order("name");
    for (const [index, id] of moveInOrder((data ?? []).map((row) => row.id), parsed.data.id, direction).entries()) {
      const { error } = await supabase.from("dining_areas").update({ sort_order: index }).eq("id", id);
      if (error) return { ok: false, error: tabDbError(error) };
    }
  } else {
    const { data: row } = await supabase.from("dining_tables").select("area_id").eq("id", parsed.data.id).maybeSingle();
    if (!row) return { ok: false, error: GONE };
    const { data } = await supabase.from("dining_tables").select("id").eq("area_id", row.area_id).order("sort_order").order("name");
    for (const [index, id] of moveInOrder((data ?? []).map((entry) => entry.id), parsed.data.id, direction).entries()) {
      const { error } = await supabase.from("dining_tables").update({ sort_order: index }).eq("id", id);
      if (error) return { ok: false, error: tabDbError(error) };
    }
  }
  return done();
}
