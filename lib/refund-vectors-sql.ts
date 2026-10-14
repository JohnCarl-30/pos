import type { RefundVector } from "./refunds";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function refundVectorsToSql(vectors: RefundVector[]): string {
  const lines = ["begin;", "create extension if not exists pgtap with schema extensions;", `select plan(${vectors.length});`, ""];
  for (const { name, line, expected } of vectors) {
    const args = [line.lineTotal, line.tax, line.quantity, line.refunded, line.units].join(", ");
    lines.push(`select is(private.refund_line(${args}), '${JSON.stringify({ amount: expected.amount, tax: expected.tax })}'::jsonb, ${sqlString(name)});`);
  }
  lines.push("", "select * from finish();", "rollback;", "");
  return lines.join("\n");
}
