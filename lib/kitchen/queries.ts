import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type KitchenTicket = {
  id: string;
  number: number;
  label: string;
  sentAt: string;
  items: { id: string; quantity: number; name: string; choices: string | null; note: string | null; voided: boolean }[];
};

type TicketRow = {
  id: string;
  number: number;
  label: string;
  sent_at: string;
  kitchen_ticket_items: { id: string; quantity: number; name: string; choices: string | null; note: string | null; voided: boolean; sort_order: number }[];
};

export async function loadTickets(supabase: SupabaseClient<Database>, storeId: string): Promise<KitchenTicket[]> {
  const { data } = await supabase
    .from("kitchen_tickets")
    .select("id, number, label, sent_at, kitchen_ticket_items(id, quantity, name, choices, note, voided, sort_order)")
    .eq("store_id", storeId)
    .is("done_at", null)
    .order("sent_at")
    .order("sort_order", { referencedTable: "kitchen_ticket_items" })
    .limit(100);
  return ((data ?? []) as unknown as TicketRow[]).map((row) => ({
    id: row.id,
    number: row.number,
    label: row.label,
    sentAt: row.sent_at,
    items: row.kitchen_ticket_items.map((item) => ({ id: item.id, quantity: item.quantity, name: item.name, choices: item.choices, note: item.note, voided: item.voided })),
  }));
}
