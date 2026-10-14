import { describe, expect, it } from "vitest";
import { refundVectorsToSql } from "./refund-vectors-sql";

describe("refundVectorsToSql", () => {
  it("writes one pgTAP check per vector", () => {
    const sql = refundVectorsToSql([{ name: "it's one", line: { lineTotal: 650, tax: 50, quantity: 2, refunded: 0, units: 1 }, expected: { amount: 325, tax: 25 } }]);
    expect(sql).toContain("select plan(1);");
    expect(sql).toContain(`select is(private.refund_line(650, 50, 2, 0, 1), '{"amount":325,"tax":25}'::jsonb, 'it''s one');`);
    expect(sql.trim().endsWith("rollback;")).toBe(true);
  });
});
