import { describe, expect, it } from "vitest";
import { matchCustomers, pageOf, parseCustomerFilters, summariseCustomers } from "./list";

const customers = [
  { id: "b", name: "Ben Okafor", email: null, phone: "+1 555 0102" },
  { id: "a", name: "Ana Reyes", email: "ana@example.com", phone: null },
];
const sales = [
  { customer_id: "a", total: 1000, created_at: "2026-10-01T10:00:00Z", status: "completed" as const, refunds: [] },
  { customer_id: "a", total: 500, created_at: "2026-10-05T10:00:00Z", status: "partially_refunded" as const, refunds: [{ total: 200 }] },
  { customer_id: "a", total: 999, created_at: "2026-10-09T10:00:00Z", status: "voided" as const, refunds: [] },
];

describe("summariseCustomers", () => {
  it("adds up spending net of refunds, ignores voids, and sorts by name", () => {
    expect(summariseCustomers(customers, sales)).toEqual([
      { id: "a", name: "Ana Reyes", email: "ana@example.com", phone: null, totalSpent: 1300, lastVisit: "2026-10-05T10:00:00Z" },
      { id: "b", name: "Ben Okafor", email: null, phone: "+1 555 0102", totalSpent: 0, lastVisit: null },
    ]);
  });
});

describe("matchCustomers", () => {
  it("searches name, email and phone", () => {
    const rows = summariseCustomers(customers, []);
    expect(matchCustomers(rows, "ANA").map((row) => row.id)).toEqual(["a"]);
    expect(matchCustomers(rows, "0102").map((row) => row.id)).toEqual(["b"]);
    expect(matchCustomers(rows, "").length).toBe(2);
  });
});

describe("pageOf and parseCustomerFilters", () => {
  it("pages and clamps", () => {
    expect(pageOf([1, 2, 3], 5, 2)).toEqual({ rows: [3], page: 2, pages: 2, total: 3 });
    expect(pageOf([], 1, 2)).toEqual({ rows: [], page: 1, pages: 1, total: 0 });
    expect(parseCustomerFilters({ q: " ana ", page: "x" })).toEqual({ q: "ana", page: 1 });
  });
});
