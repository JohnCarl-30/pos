import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { kitchenSince, toKitchenTickets, type KitchenTicket, type TicketRow } from "./tickets";

export type { KitchenTicket } from "./tickets";

export async function loadTickets(supabase: SupabaseClient<Database>, storeId: string): Promise<KitchenTicket[]> {
  const { data } = await supabase
    .from("kitchen_tickets")
    .select("id, number, label, sent_at, kitchen_ticket_items(id, quantity, name, choices, note, voided, sort_order)")
    .eq("store_id", storeId)
    .is("done_at", null)
    .gte("sent_at", kitchenSince(Date.now()))
    .order("sent_at", { ascending: false })
    .order("sort_order", { referencedTable: "kitchen_ticket_items" })
    .limit(100);
  return toKitchenTickets((data ?? []) as unknown as TicketRow[]);
}
