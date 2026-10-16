export type KitchenTicket = {
  id: string;
  number: number;
  label: string;
  sentAt: string;
  items: { id: string; quantity: number; name: string; choices: string | null; note: string | null; voided: boolean }[];
};

export type TicketRow = {
  id: string;
  number: number;
  label: string;
  sent_at: string;
  kitchen_ticket_items: { id: string; quantity: number; name: string; choices: string | null; note: string | null; voided: boolean; sort_order?: number }[];
};

export function kitchenSince(now: number): string {
  return new Date(now - 24 * 60 * 60 * 1000).toISOString();
}

export function toKitchenTickets(newestFirst: TicketRow[]): KitchenTicket[] {
  return [...newestFirst].reverse().map((row) => ({
    id: row.id,
    number: row.number,
    label: row.label,
    sentAt: row.sent_at,
    items: row.kitchen_ticket_items.map((item) => ({ id: item.id, quantity: item.quantity, name: item.name, choices: item.choices, note: item.note, voided: item.voided })),
  }));
}
