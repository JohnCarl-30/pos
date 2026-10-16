import { describe, expect, it } from "vitest";
import { kitchenSince, toKitchenTickets } from "./tickets";

const row = (id: string, sentAt: string) => ({ id, number: 1, label: id, sent_at: sentAt, kitchen_ticket_items: [] });

describe("kitchen tickets", () => {
  it("shows the newest tickets it loaded, oldest first", () => {
    const newestFirst = [row("c", "2026-10-16T12:00:00Z"), row("b", "2026-10-16T11:00:00Z"), row("a", "2026-10-16T10:00:00Z")];
    expect(toKitchenTickets(newestFirst).map((ticket) => ticket.id)).toEqual(["a", "b", "c"]);
  });
  it("only looks back a day", () => {
    expect(kitchenSince(Date.parse("2026-10-16T12:00:00Z"))).toBe("2026-10-15T12:00:00.000Z");
  });
});
