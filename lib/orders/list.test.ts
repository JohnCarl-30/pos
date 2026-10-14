import { describe, expect, it } from "vitest";
import { likePattern, nextDay, parseOrderFilters, receiptNumberFrom, zonedDayStart } from "./list";

describe("parseOrderFilters", () => {
  it("keeps valid values", () => {
    expect(
      parseOrderFilters({
        q: " 42 ",
        from: "2026-10-01",
        to: "2026-10-14",
        status: "voided",
        register: "00000000-0000-0000-0000-000000000101",
        cashier: "00000000-0000-0000-0000-000000000203",
        page: "2",
      }),
    ).toEqual({
      q: "42",
      from: "2026-10-01",
      to: "2026-10-14",
      status: "voided",
      register: "00000000-0000-0000-0000-000000000101",
      cashier: "00000000-0000-0000-0000-000000000203",
      page: 2,
    });
  });
  it("drops anything it doesn't understand", () => {
    expect(parseOrderFilters({ from: "yesterday", to: "2026-13-45", status: "constructor", register: "x", cashier: ["y"], page: "-1" })).toEqual({
      q: "",
      from: "",
      to: "",
      status: "",
      register: "",
      cashier: "",
      page: 1,
    });
  });
});

describe("receiptNumberFrom", () => {
  it("reads a receipt number with or without #", () => {
    expect(receiptNumberFrom("42")).toBe(42);
    expect(receiptNumberFrom("#42")).toBe(42);
    expect(receiptNumberFrom("Ana")).toBeNull();
    expect(receiptNumberFrom("4.2")).toBeNull();
  });
});

describe("likePattern", () => {
  it("strips wildcards from what people type", () => {
    expect(likePattern("50%_off\\")).toBe("%50off%");
  });
});

describe("zonedDayStart", () => {
  it("finds midnight in the store's time zone", () => {
    expect(zonedDayStart("2026-10-14", "Asia/Manila").toISOString()).toBe("2026-10-13T16:00:00.000Z");
    expect(zonedDayStart("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(zonedDayStart("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(zonedDayStart("2026-10-14", "UTC").toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });
});

describe("nextDay", () => {
  it("rolls over months and years", () => {
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
  });
});
