import type { CheckoutVector } from "./checkout";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function vectorsToSql(vectors: CheckoutVector[]): string {
  const lines = ["begin;", "create extension if not exists pgtap with schema extensions;", `select plan(${vectors.length});`, ""];
  for (const vector of vectors) {
    const input = JSON.stringify(
      vector.lines.map((line) => ({
        price: line.price,
        quantity: line.quantity,
        rate_bps: line.rateBps,
        discount_bps: line.discountBps ?? null,
        discount_amount: line.discountAmount ?? null,
      })),
    );
    const discount = vector.orderDiscount ? `'${JSON.stringify({ bps: vector.orderDiscount.bps ?? null, amount: vector.orderDiscount.amount ?? null })}'::jsonb` : "null";
    const expected = JSON.stringify({
      subtotal: vector.expected.subtotal,
      discount_total: vector.expected.discountTotal,
      tax_total: vector.expected.taxTotal,
      total: vector.expected.total,
      lines: vector.expected.lines.map((line) => ({ discount: line.discount, tax: line.tax, line_total: line.lineTotal })),
    });
    lines.push(`select is(private.price_cart(${vector.pricesIncludeTax}, '${input}'::jsonb, ${discount}), '${expected}'::jsonb, ${sqlString(vector.name)});`);
  }
  lines.push("", "select * from finish();", "rollback;", "");
  return lines.join("\n");
}
