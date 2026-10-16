import { describe, expect, it } from "vitest";
import { ticketMinutes, ticketTone } from "./tone";

describe("kitchen timer", () => {
  it("counts whole minutes since sent", () => {
    const sent = "2026-10-16T10:00:00Z";
    expect(ticketMinutes(sent, Date.parse("2026-10-16T10:09:59Z"))).toBe(9);
    expect(ticketMinutes(sent, Date.parse("2026-10-16T09:59:00Z"))).toBe(0);
  });
  it("turns amber at 10 and red at 20", () => {
    expect(ticketTone(9)).toBe("normal");
    expect(ticketTone(10)).toBe("late");
    expect(ticketTone(19)).toBe("late");
    expect(ticketTone(20)).toBe("overdue");
  });
});
