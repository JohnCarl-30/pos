# Orders & Customers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order history, partial refunds (cashiers with manager approval), voids while the till is open, refund slips, a Return flow on the register, a customer list with history, and a lockdown so recorded sales can't be edited or deleted directly.

**Architecture:**
- **Database:** two security-definer functions, `create_refund` and `void_order`, are the only way to change a sale. Direct `update`/`delete` on orders, items, payments and sessions is revoked for every role.
- **Refund amounts:** computed cumulatively per line (`share(c) = half_even(T·c/q)`), mirrored in `lib/refunds.ts` and `private.refund_line`, and pinned by shared vectors.
- **Screens:** one client `RefundPanel` serves both the sale's page and the register's Return dialog.

**Tech Stack:** Next.js 16.4 (async `params`/`searchParams`/`cookies`), React 19, Tailwind 4, zod 4, Supabase (Postgres RLS, pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-orders-customers-design.md`

## Global Constraints

- **Money:** integer minor units everywhere. Half-even rounding: `divRoundHalfEven` (TS) and `private.div_half_even` (SQL).
- **Database functions:** `security definer`, `set search_path = ''`. Execute is revoked from `public, anon` and granted to `authenticated`. `private.*` helpers are revoked from `authenticated` unless RLS needs them.
- **Errors:**
  - Database errors are lowercase: 22023 for bad input, P0001 for rule violations, P0002 for not found, 42501 for access.
  - The screen maps them to sentences ending in a full stop.
  - When a server action throws: "Couldn't reach the server. Check the connection and try again."
- **Touch:** every control on refund, void and return screens is at least 44px (`min-h-11` / `size-11`).
- **React 19:** dialogs remount their form per open (`prevOpen`/`openCount` render pattern); no `setState` in effects; controlled inputs.
- **Conventions:**
  - No code comments.
  - Tailwind only.
  - `Button` always gets an explicit `variant`.
  - Max widths in `em`.
  - Icons come from Figma assets, not icon libraries (text glyphs `−`/`+` are fine).
- **Cashier refunds:** need an approval that is single-use, valid for 10 minutes, and tied to the store, order, requester and a `max_amount` ≥ the refund total.
- **Copy (verbatim):**
  - "Only {n} left to refund on {name}."
  - "Card refunds can't be more than {amount}. Use cash for the rest."
  - "This refund needs a manager's approval."
  - "Open a till to give refunds."
  - "This sale can't be voided: its till has been closed. Refund it instead."
  - "This sale has refunds and can't be voided."
  - "You can only void your own sales."
  - "This customer has sales and can't be deleted."
  - "No sale with that receipt number in this store."

## Rulings made while planning (deviations from the spec)

- **`find_order_by_receipt` is a plain query in `findSaleByReceipt`, not a database function.** It does the same RLS-scoped lookup without another function to grant. Cost if wrong: one extra function later.
- **`refunds.total` is `>= 0`, not `> 0`.** An item that was given away free (100% discount) can still be returned to stock, with an empty payout. Cost if wrong: one check constraint.
- **Per-method payout limits apply to card and other only, and cash has no cap.** This is how the spec's "cash may take what's left over" works. The total is still capped by what's left to refund. Cost if wrong: one SQL condition and one TS condition.
- **The Orders list is scoped to the store picked in the sidebar,** like Products. Customers' "total spent" adds up across every store the viewer can see, shown in the current store's currency. Cost if wrong: a filter change.

## Review Focus

1. **Refunding a line in several steps, possibly by different people and from different tills:** the sum never exceeds what was paid for the line, and the last step returns exactly the remainder. *Pinned by the vectors in Task 1 and pgTAP in Task 2.*
2. **Two refunds of the same sale racing:** the second must see the first's quantities. *`create_refund` locks the order row (`for update`) before reading refunded quantities. Task 2 asserts the over-refund error after a prior refund.*
3. **A cashier changes quantities after getting approval:** a bigger total must need approval again. *Task 4's panel compares `approval.maxAmount < total`, and the database checks `max_amount >= total`, tested in Task 2.*
4. **The register cookie points at a register in another store, or at a closed till:** the sale's page must not offer a refund that will fail. *`loadDeviceSession` filters by store and open session; Task 3 unit-tests `refundAvailability`.*
5. **A date filter at the store's midnight, including across daylight-saving days:** a sale at 00:30 local belongs to that day. *`zonedDayStart` is tested for Asia/Manila, New York on a DST day, and UTC in Task 3.*

---

### Task 1: Refund maths and shared vectors

**Files:**
- Create: `lib/refunds.ts`, `lib/refunds.test.ts`, `lib/refund-vectors.json`, `lib/refund-vectors-sql.ts`, `lib/refund-vectors-sql.test.ts`
- Modify: `scripts/checkout-vectors.mts` (also writes refund vectors)
- Generated: `supabase/tests/refund_vectors.test.sql` (it passes only after Task 2 adds `private.refund_line`)

**Interfaces:**
- Produces:
  - Types: `RefundMethod = "cash" | "card" | "other"`; `RefundLineInput = { lineTotal: number; tax: number; quantity: number; refunded: number; units: number }`; `RefundLineAmount = { amount: number; tax: number }`; `RefundTotals = { subtotal: number; taxTotal: number; total: number; lines: RefundLineAmount[] }`; `RefundPayment = { method: RefundMethod; amount: number; reference?: string | null }`; `MethodRoom = { card: number; other: number }`; `RefundVector = { name: string; line: RefundLineInput; expected: RefundLineAmount }`.
  - Functions: `refundLine(input): RefundLineAmount`; `priceRefund(lines): RefundTotals`; `methodRoom(paid, refunded): MethodRoom`; `suggestPayout(total, room): RefundPayment[]`; `checkPayout(total, payments, room): string | null`; `refundVectorsToSql(vectors): string`.
  - Classes: `RefundError`.

- [ ] **Step 1: Write the vectors and the failing tests**

`lib/refund-vectors.json`:
```json
[
  { "name": "one of two splits evenly", "line": { "lineTotal": 650, "tax": 50, "quantity": 2, "refunded": 0, "units": 1 }, "expected": { "amount": 325, "tax": 25 } },
  { "name": "second of two returns the rest", "line": { "lineTotal": 650, "tax": 50, "quantity": 2, "refunded": 1, "units": 1 }, "expected": { "amount": 325, "tax": 25 } },
  { "name": "first of three rounds half-even", "line": { "lineTotal": 1001, "tax": 91, "quantity": 3, "refunded": 0, "units": 1 }, "expected": { "amount": 334, "tax": 30 } },
  { "name": "second of three", "line": { "lineTotal": 1001, "tax": 91, "quantity": 3, "refunded": 1, "units": 1 }, "expected": { "amount": 333, "tax": 31 } },
  { "name": "last of three returns exactly the remainder", "line": { "lineTotal": 1001, "tax": 91, "quantity": 3, "refunded": 2, "units": 1 }, "expected": { "amount": 334, "tax": 30 } },
  { "name": "an exact half rounds to even", "line": { "lineTotal": 5, "tax": 3, "quantity": 2, "refunded": 0, "units": 1 }, "expected": { "amount": 2, "tax": 2 } },
  { "name": "two of three at once", "line": { "lineTotal": 990, "tax": 90, "quantity": 3, "refunded": 1, "units": 2 }, "expected": { "amount": 660, "tax": 60 } },
  { "name": "a single item refunds in full", "line": { "lineTotal": 1624, "tax": 124, "quantity": 1, "refunded": 0, "units": 1 }, "expected": { "amount": 1624, "tax": 124 } }
]
```

`lib/refunds.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import vectors from "./refund-vectors.json";
import { RefundError, checkPayout, methodRoom, priceRefund, refundLine, suggestPayout, type RefundVector } from "./refunds";

describe("refundLine", () => {
  for (const vector of vectors as RefundVector[]) {
    it(vector.name, () => {
      expect(refundLine(vector.line)).toEqual(vector.expected);
    });
  }

  it("adds up exactly to the line when refunded one at a time", () => {
    let amount = 0;
    let tax = 0;
    for (let refunded = 0; refunded < 7; refunded += 1) {
      const part = refundLine({ lineTotal: 1003, tax: 77, quantity: 7, refunded, units: 1 });
      amount += part.amount;
      tax += part.tax;
    }
    expect({ amount, tax }).toEqual({ amount: 1003, tax: 77 });
  });

  it("refuses more than is left", () => {
    expect(() => refundLine({ lineTotal: 650, tax: 50, quantity: 2, refunded: 1, units: 2 })).toThrow(new RefundError("Only 1 left to refund"));
  });

  it("refuses zero units", () => {
    expect(() => refundLine({ lineTotal: 650, tax: 50, quantity: 2, refunded: 0, units: 0 })).toThrow(RefundError);
  });
});

describe("priceRefund", () => {
  it("totals the lines and splits out tax", () => {
    expect(
      priceRefund([
        { lineTotal: 650, tax: 50, quantity: 2, refunded: 0, units: 1 },
        { lineTotal: 1624, tax: 124, quantity: 1, refunded: 0, units: 1 },
      ]),
    ).toEqual({ subtotal: 1800, taxTotal: 149, total: 1949, lines: [{ amount: 325, tax: 25 }, { amount: 1624, tax: 124 }] });
  });
});

describe("methodRoom", () => {
  it("subtracts earlier refunds per method", () => {
    expect(
      methodRoom(
        [{ method: "card", amount: 500 }, { method: "cash", amount: 490 }, { method: "other", amount: 100 }],
        [{ method: "card", amount: 330 }],
      ),
    ).toEqual({ card: 170, other: 100 });
  });
});

describe("suggestPayout", () => {
  it("fills card first, then other, then cash", () => {
    expect(suggestPayout(660, { card: 170, other: 100 })).toEqual([
      { method: "card", amount: 170 },
      { method: "other", amount: 100 },
      { method: "cash", amount: 390 },
    ]);
  });
  it("uses cash when nothing was paid by card", () => {
    expect(suggestPayout(379, { card: 0, other: 0 })).toEqual([{ method: "cash", amount: 379 }]);
  });
  it("suggests nothing for a free item", () => {
    expect(suggestPayout(0, { card: 100, other: 0 })).toEqual([]);
  });
});

describe("checkPayout", () => {
  const room = { card: 170, other: 0 };
  it("accepts payments that add up within the limits", () => {
    expect(checkPayout(660, [{ method: "card", amount: 170 }, { method: "cash", amount: 490 }], room)).toBeNull();
  });
  it("rejects too much on card", () => {
    expect(checkPayout(660, [{ method: "card", amount: 660 }], room)).toBe("Card refunds can't be more than was paid by card");
  });
  it("rejects too much on other", () => {
    expect(checkPayout(10, [{ method: "other", amount: 10 }], room)).toBe("Other refunds can't be more than was paid by other methods");
  });
  it("rejects payments that don't add up", () => {
    expect(checkPayout(660, [{ method: "cash", amount: 100 }], room)).toBe("Refund payments must add up to the refund");
  });
  it("rejects a zero amount", () => {
    expect(checkPayout(0, [{ method: "cash", amount: 0 }], room)).toBe("Each refund payment needs an amount above 0");
  });
  it("rejects a reference on cash", () => {
    expect(checkPayout(10, [{ method: "cash", amount: 10, reference: "x" }], room)).toBe("Only card and other refunds can have a reference");
  });
  it("rejects a long reference", () => {
    expect(checkPayout(10, [{ method: "card", amount: 10, reference: "x".repeat(101) }], { card: 10, other: 0 })).toBe("Keep the reference under 100 characters");
  });
});
```

`lib/refund-vectors-sql.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/refunds.test.ts lib/refund-vectors-sql.test.ts`
Expected: FAIL. Neither module can be resolved (`Failed to resolve import "./refunds"`).

- [ ] **Step 3: Implement**

`lib/refunds.ts`:
```ts
import { divRoundHalfEven } from "./tax";

export type RefundMethod = "cash" | "card" | "other";
export type RefundLineInput = { lineTotal: number; tax: number; quantity: number; refunded: number; units: number };
export type RefundLineAmount = { amount: number; tax: number };
export type RefundTotals = { subtotal: number; taxTotal: number; total: number; lines: RefundLineAmount[] };
export type RefundPayment = { method: RefundMethod; amount: number; reference?: string | null };
export type MethodRoom = { card: number; other: number };
export type RefundVector = { name: string; line: RefundLineInput; expected: RefundLineAmount };

export class RefundError extends Error {}

function share(total: number, units: number, quantity: number): number {
  return Number(divRoundHalfEven(BigInt(total) * BigInt(units), BigInt(quantity)));
}

export function refundLine({ lineTotal, tax, quantity, refunded, units }: RefundLineInput): RefundLineAmount {
  if (!Number.isInteger(units) || units < 1) throw new RefundError("Refund at least 1 of each item");
  if (refunded + units > quantity) throw new RefundError(`Only ${quantity - refunded} left to refund`);
  return {
    amount: share(lineTotal, refunded + units, quantity) - share(lineTotal, refunded, quantity),
    tax: share(tax, refunded + units, quantity) - share(tax, refunded, quantity),
  };
}

export function priceRefund(lines: RefundLineInput[]): RefundTotals {
  const priced = lines.map(refundLine);
  const total = priced.reduce((sum, line) => sum + line.amount, 0);
  const taxTotal = priced.reduce((sum, line) => sum + line.tax, 0);
  return { subtotal: total - taxTotal, taxTotal, total, lines: priced };
}

function sumFor(rows: { method: RefundMethod; amount: number }[], method: RefundMethod): number {
  return rows.filter((row) => row.method === method).reduce((sum, row) => sum + row.amount, 0);
}

export function methodRoom(paid: { method: RefundMethod; amount: number }[], refunded: { method: RefundMethod; amount: number }[]): MethodRoom {
  return { card: sumFor(paid, "card") - sumFor(refunded, "card"), other: sumFor(paid, "other") - sumFor(refunded, "other") };
}

export function suggestPayout(total: number, room: MethodRoom): RefundPayment[] {
  const card = Math.min(total, Math.max(room.card, 0));
  const other = Math.min(total - card, Math.max(room.other, 0));
  const rows: RefundPayment[] = [
    { method: "card", amount: card },
    { method: "other", amount: other },
    { method: "cash", amount: total - card - other },
  ];
  return rows.filter((row) => row.amount > 0);
}

export function checkPayout(total: number, payments: RefundPayment[], room: MethodRoom): string | null {
  if (payments.some((payment) => !Number.isSafeInteger(payment.amount) || payment.amount <= 0)) return "Each refund payment needs an amount above 0";
  if (payments.some((payment) => payment.method === "cash" && payment.reference)) return "Only card and other refunds can have a reference";
  if (payments.some((payment) => (payment.reference ?? "").length > 100)) return "Keep the reference under 100 characters";
  if (sumFor(payments, "card") > room.card) return "Card refunds can't be more than was paid by card";
  if (sumFor(payments, "other") > room.other) return "Other refunds can't be more than was paid by other methods";
  if (payments.reduce((sum, payment) => sum + payment.amount, 0) !== total) return "Refund payments must add up to the refund";
  return null;
}
```

`lib/refund-vectors-sql.ts`:
```ts
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
```

`scripts/checkout-vectors.mts` (replace whole file):
```ts
import { readFileSync, writeFileSync } from "node:fs";
import { vectorsToSql } from "../lib/checkout-vectors-sql.ts";
import { refundVectorsToSql } from "../lib/refund-vectors-sql.ts";

const vectors = JSON.parse(readFileSync(new URL("../lib/checkout-vectors.json", import.meta.url), "utf8"));
writeFileSync(new URL("../supabase/tests/checkout_vectors.test.sql", import.meta.url), vectorsToSql(vectors));
console.log(`Wrote ${vectors.length} checkout vectors to supabase/tests/checkout_vectors.test.sql`);

const refunds = JSON.parse(readFileSync(new URL("../lib/refund-vectors.json", import.meta.url), "utf8"));
writeFileSync(new URL("../supabase/tests/refund_vectors.test.sql", import.meta.url), refundVectorsToSql(refunds));
console.log(`Wrote ${refunds.length} refund vectors to supabase/tests/refund_vectors.test.sql`);
```

- [ ] **Step 4: Run the tests and generate the SQL**

Run: `npx vitest run lib/refunds.test.ts lib/refund-vectors-sql.test.ts && npm run db:vectors`
Expected:
- The tests PASS: 8 vector cases plus the rest, all green.
- The script prints "Wrote 8 checkout vectors …" and "Wrote 8 refund vectors …".
- `supabase/tests/refund_vectors.test.sql` exists.

- [ ] **Step 5: Commit**

```bash
git add lib/refunds.ts lib/refunds.test.ts lib/refund-vectors.json lib/refund-vectors-sql.ts lib/refund-vectors-sql.test.ts scripts/checkout-vectors.mts supabase/tests/refund_vectors.test.sql
git commit -m "feat(refunds): cumulative refund maths with shared TS/SQL vectors"
```

### Task 2: Database — refunds, voids, lockdown, customers

**Files:**
- Create: `supabase/migrations/20261014000010_orders.sql`, `supabase/tests/orders.test.sql`
- Modify:
  - `supabase/tests/schema.test.sql`: the `tables_are` list gains the four new tables;
  - `supabase/tests/access.test.sql`: assertions that relied on the old update and delete policies;
  - `lib/supabase/database.types.ts`: regenerated.

**Interfaces:**
- Consumes: `private.div_half_even(numeric, numeric)`, `private.can_access_store(uuid)` and `private.staff_id()` / `private.staff_role()` from earlier migrations.
- Produces:
  - **Tables:** `refunds`, `refund_items`, `refund_payments`, `refund_approvals`.
  - **Columns:** `orders.voided_at`, `orders.voided_by`, `orders.void_reason`.
  - **Functions:**
    - `public.create_refund(p_order_id uuid, p_session_id uuid, p_lines jsonb, p_payments jsonb, p_approval_id uuid default null, p_reason text default 'changed_mind', p_note text default null) returns jsonb {refund_id, receipt_number, total}`;
    - `public.void_order(p_order_id uuid, p_reason text) returns void`;
    - `public.close_register(...)`, which now also returns `cash_refunds` and `voided_count`;
    - `private.refund_line(bigint, bigint, integer, integer, integer) returns jsonb {amount, tax}`.
  - **FK names used by later embeds:** `orders_staff_id_fkey`, `orders_discount_by_fkey`, `orders_voided_by_fkey`, `refunds_staff_id_fkey`, `refunds_approved_by_fkey`.

- [ ] **Step 1: Write the failing pgTAP tests**

`supabase/tests/orders.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'or-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'or-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'or-cashier@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'or-cashier-b@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'or-inactive@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a6', 'or-cashier-2@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency, prices_include_tax) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD', false),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD', false);
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'or-owner@test', 'owner', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'or-manager@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'or-cashier@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a4', 'Cashier B', 'or-cashier-b@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a5', 'Gone', 'or-inactive@test', 'cashier', false),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000a6', 'Cashier Two', 'or-cashier-2@test', 'cashier', true);
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000b1');
insert into public.registers (id, store_id, name, next_receipt_number) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Till A', 4),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', 'Till B', 2),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b1', 'Till A2', 2);
insert into public.tax_classes (id, name, is_default) values ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);
insert into public.products (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Tea'),
  ('00000000-0000-0000-0000-0000000000f2', 'Mug');
insert into public.product_variants (id, product_id, sku, price) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'TEA', 300),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 'MUG', 1250);
insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3', 6, 'received', '00000000-0000-0000-0000-0000000000c1');
update public.stock_levels set track = false where variant_id = '00000000-0000-0000-0000-0000000000f4';
insert into public.customers (id, name) values
  ('00000000-0000-0000-0000-0000000000e7', 'Ana'),
  ('00000000-0000-0000-0000-0000000000e8', 'Ben');
insert into public.register_sessions (id, register_id, opened_by, opening_cash, closed_by, closed_at, counted_cash) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3', 5000, null, null, null),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c4', 0, null, null, null),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c3', 0, '00000000-0000-0000-0000-0000000000c3', now(), 0);
insert into public.orders (id, store_id, register_id, session_id, staff_id, customer_id, receipt_number, subtotal, tax_total, total) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c3', null, 1, 900, 90, 990),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c3', null, 2, 300, 30, 330),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c3', null, 3, 1250, 125, 1375),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e7', 1, 300, 30, 330),
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000c4', null, 1, 300, 30, 330);
insert into public.order_items (id, order_id, line_number, variant_id, name, sku, unit_price, quantity, tax_rate_bps, tax, line_total) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 1, '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 3, 1000, 90, 990),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000022', 1, '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 1, 1000, 30, 330),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000023', 1, '00000000-0000-0000-0000-0000000000f4', 'Mug', 'MUG', 1250, 1, 1000, 125, 1375),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000024', 1, '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 1, 1000, 30, 330),
  ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000025', 1, '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 1, 1000, 30, 330);
insert into public.payments (order_id, method, amount) values
  ('00000000-0000-0000-0000-000000000021', 'card', 500),
  ('00000000-0000-0000-0000-000000000021', 'cash', 490),
  ('00000000-0000-0000-0000-000000000022', 'cash', 330),
  ('00000000-0000-0000-0000-000000000023', 'cash', 1375),
  ('00000000-0000-0000-0000-000000000024', 'card', 330),
  ('00000000-0000-0000-0000-000000000025', 'card', 330);
insert into public.refund_approvals (id, store_id, order_id, approved_by, requested_by, max_amount, expires_at) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', 330, now() + interval '10 minutes'),
  ('00000000-0000-0000-0000-00000000ab02', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', 100, now() + interval '10 minutes'),
  ('00000000-0000-0000-0000-00000000ab03', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 330, now() + interval '10 minutes'),
  ('00000000-0000-0000-0000-00000000ab04', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', 330, now() - interval '1 minute'),
  ('00000000-0000-0000-0000-00000000ab05', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', 330, now() + interval '10 minutes');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]', null)$$,
  'P0001', 'refund needs approval', 'a cashier needs approval to refund'
);
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]', '00000000-0000-0000-0000-00000000ab02')$$,
  'P0001', 'refund needs approval', 'an approval for a smaller amount does not count'
);
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]', '00000000-0000-0000-0000-00000000ab03')$$,
  'P0001', 'refund needs approval', 'an approval asked for by someone else does not count'
);
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]', '00000000-0000-0000-0000-00000000ab04')$$,
  'P0001', 'refund needs approval', 'an expired approval does not count'
);
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]', '00000000-0000-0000-0000-00000000ab05')$$,
  'P0001', 'refund needs approval', 'an approval for another sale does not count'
);
select is(
  public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]', '00000000-0000-0000-0000-00000000ab01') ->> 'receipt_number',
  '4',
  'an approved refund takes the next number in the till''s series'
);
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-000000000021'), 'partially_refunded', 'a partial refund marks the sale partially refunded');
select is((select quantity from public.stock_levels where store_id = '00000000-0000-0000-0000-0000000000b1' and variant_id = '00000000-0000-0000-0000-0000000000f3'), 7, 'a restocked item goes back into stock');
select is((select approved_by from public.refunds where approval_id = '00000000-0000-0000-0000-00000000ab01'), '00000000-0000-0000-0000-0000000000c2'::uuid, 'the approver is recorded');
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"card","amount":170}, {"method":"cash","amount":160}]', '00000000-0000-0000-0000-00000000ab01')$$,
  'P0001', 'refund needs approval', 'an approval works once'
);
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"cash","amount":330}]', null, 'other', '  ')$$,
  '22023', 'add a note for the refund', 'an "other" reason needs a note'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":3,"restock":true}]', '[{"method":"cash","amount":990}]')$$,
  '22023', 'only 2 left to refund on Tea', 'a line cannot be refunded past what was sold'
);
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":2,"restock":false}]', '[{"method":"card","amount":660}]')$$,
  '22023', 'card refunds can''t be more than 170', 'card refunds are capped at what is left on card'
);
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":2,"restock":false}]', '[{"method":"card","amount":100}, {"method":"cash","amount":100}]')$$,
  '22023', 'payments must add up to the refund', 'payments must match the refund'
);
select lives_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":2,"restock":false}]', '[{"method":"card","amount":170}, {"method":"cash","amount":490}]', null, 'damaged')$$,
  'a manager refunds without approval, cash taking what card cannot'
);
select is((select status::text from public.orders where id = '00000000-0000-0000-0000-000000000021'), 'refunded', 'refunding everything marks the sale refunded');
select is((select quantity from public.stock_levels where store_id = '00000000-0000-0000-0000-0000000000b1' and variant_id = '00000000-0000-0000-0000-0000000000f3'), 7, 'damaged items do not go back into stock');
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"cash","amount":330}]')$$,
  '22023', 'only 0 left to refund on Tea', 'a fully refunded line cannot be refunded again'
);
select lives_ok($$select public.void_order('00000000-0000-0000-0000-000000000022', 'customer left')$$, 'a manager voids a cashier''s sale');
select is((select quantity from public.stock_levels where store_id = '00000000-0000-0000-0000-0000000000b1' and variant_id = '00000000-0000-0000-0000-0000000000f3'), 8, 'a void puts tracked items back');
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000032","quantity":1,"restock":true}]', '[{"method":"cash","amount":330}]')$$,
  'P0001', 'sale is voided', 'a voided sale cannot be refunded'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';

select throws_ok($$select public.void_order('00000000-0000-0000-0000-000000000023', 'oops')$$, '42501', 'you can only void your own sales', 'a cashier cannot void someone else''s sale');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select throws_ok($$select public.void_order('00000000-0000-0000-0000-000000000021', 'oops')$$, 'P0001', 'sale has refunds', 'a sale with refunds cannot be voided');
select throws_ok($$select public.void_order('00000000-0000-0000-0000-000000000024', 'oops')$$, 'P0001', 'till is closed — refund it instead', 'a sale cannot be voided after its till closed');
select lives_ok($$select public.void_order('00000000-0000-0000-0000-000000000023', 'rang up the wrong item')$$, 'a cashier voids their own sale');
select is(
  (select row(status::text, void_reason, voided_by)::text from public.orders where id = '00000000-0000-0000-0000-000000000023'),
  row('voided', 'rang up the wrong item', '00000000-0000-0000-0000-0000000000c3'::uuid)::text,
  'the void records why and who'
);
select throws_ok($$select public.void_order('00000000-0000-0000-0000-000000000023', 'again')$$, 'P0001', 'sale is already voided', 'a sale cannot be voided twice');
select throws_ok($$select public.void_order('00000000-0000-0000-0000-000000000021', '   ')$$, '22023', 'add a reason for the void', 'a void needs a reason');
select is(
  public.close_register('00000000-0000-0000-0000-000000000011', 5000) - 'counted_cash',
  '{"opening_cash":5000,"cash_sales":490,"cash_refunds":490,"expected_cash":5000,"difference":0,"voided_count":2}'::jsonb,
  'expected cash leaves out voided sales and takes off cash refunds'
);
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000031","quantity":1,"restock":true}]', '[{"method":"cash","amount":330}]')$$,
  'P0001', 'till is closed', 'a refund needs an open till'
);
select throws_ok($$delete from public.customers where id = '00000000-0000-0000-0000-0000000000e7'$$, '23503', null, 'a customer with sales cannot be deleted');
select lives_ok($$delete from public.customers where id = '00000000-0000-0000-0000-0000000000e8'$$, 'a cashier deletes a customer without sales');
select is((select count(*) from public.refund_approvals where requested_by <> '00000000-0000-0000-0000-0000000000c3'), 0::bigint, 'a cashier only sees approvals they asked for');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';

select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000012',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000034","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]')$$,
  'P0002', 'sale not found', 'staff of another store cannot refund the sale'
);
select is((select count(*) from public.refunds), 0::bigint, 'staff of another store cannot see its refunds');
select is((select count(*) from public.refund_items), 0::bigint, 'staff of another store cannot see its refund items');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000012',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000034","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]')$$,
  '42501', 'not allowed', 'a refund cannot be paid from another store''s till'
);
select throws_ok(
  $$insert into public.refunds (order_id, store_id, register_id, session_id, receipt_number, staff_id, reason, subtotal, tax_total, total)
    values ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000011', 99, '00000000-0000-0000-0000-0000000000c1', 'changed_mind', 300, 30, 330)$$,
  '42501', null, 'refunds cannot be inserted directly'
);
select throws_ok($$update public.orders set status = 'voided'$$, '42501', null, 'even the owner cannot edit a sale directly');
select throws_ok($$delete from public.payments$$, '42501', null, 'even the owner cannot delete payments');
select throws_ok($$delete from public.order_items$$, '42501', null, 'even the owner cannot delete sale lines');
select throws_ok($$delete from public.orders$$, '42501', null, 'even the owner cannot delete sales');
select throws_ok($$update public.register_sessions set counted_cash = 0$$, '42501', null, 'even the owner cannot edit a till session directly');
select is((select count(*) from public.refunds), 2::bigint, 'the owner sees every refund');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';

select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000011',
    '[{"order_item_id":"00000000-0000-0000-0000-000000000034","quantity":1,"restock":true}]', '[{"method":"card","amount":330}]')$$,
  '42501', 'not allowed', 'inactive staff cannot refund'
);
select throws_ok($$select public.void_order('00000000-0000-0000-0000-000000000024', 'x')$$, '42501', 'not allowed', 'inactive staff cannot void');

reset role;
set local role anon;
select throws_ok($$select * from public.refunds$$, '42501', null, 'anonymous visitors cannot read refunds');
select throws_ok(
  $$select public.create_refund('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000011', '[]', '[]')$$,
  '42501', null, 'anonymous visitors cannot call create_refund'
);
select throws_ok($$select public.void_order('00000000-0000-0000-0000-000000000024', 'x')$$, '42501', null, 'anonymous visitors cannot call void_order');

reset role;
select is((select count(*) from public.stock_movements where reason = 'returned'), 2::bigint, 'one returned movement for the restock and one for the voided tracked sale');

select * from finish();
rollback;
```

The count is 50 assertions: 11 cashier, 10 manager, 1 second cashier, 11 cashier again, 3 store B, 8 owner, 2 inactive, 3 anon, and 1 final.

`supabase/tests/schema.test.sql`: in the `tables_are('public', array[ … ])` list, add `'refunds', 'refund_items', 'refund_payments', 'refund_approvals'` after `'discount_approvals'`.

`supabase/tests/access.test.sql` (same plan count of 37). Replace these lines:
- `with u as (update public.orders set status = 'voided' returning 1) select is(count(*), 0::bigint, 'cashier cannot void orders') from u;` → `select throws_ok($$update public.orders set status = 'voided'$$, '42501', null, 'cashier cannot edit orders directly');`
- `with d as (delete from public.customers returning 1) select is(count(*), 0::bigint, 'cashier cannot delete customers') from d;` → `with d as (delete from public.customers where name = 'Ben' returning 1) select is(count(*), 1::bigint, 'cashier can delete a customer without sales') from d;`
- `with u as (update public.orders set status = 'voided' where id = '00000000-0000-0000-0000-000000000021' returning 1) select is(count(*), 1::bigint, 'manager can void an order in their store') from u;` → `select throws_ok($$update public.orders set status = 'voided' where id = '00000000-0000-0000-0000-000000000021'$$, '42501', null, 'manager cannot edit orders directly');`
- `with u as (update public.orders set status = 'voided' where id = '00000000-0000-0000-0000-000000000022' returning 1) select is(count(*), 0::bigint, 'manager cannot void another store''s order') from u;` → `select throws_ok($$delete from public.payments where order_id = '00000000-0000-0000-0000-000000000021'$$, '42501', null, 'manager cannot delete payments');`

- [ ] **Step 2: Run the database tests to see them fail**

Run: `npx supabase db reset >/dev/null && npm run test:db`
Expected: FAIL:
- `orders.test.sql` errors with `relation "public.refund_approvals" does not exist`;
- `refund_vectors.test.sql` fails because `private.refund_line` doesn't exist;
- `access.test.sql` fails its new throws_ok lines;
- `schema.test.sql` fails `tables_are`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261014000010_orders.sql`:
```sql
alter table public.orders
  add column voided_at timestamptz,
  add column voided_by uuid references public.staff (id) on delete restrict,
  add column void_reason text check (length(trim(void_reason)) between 1 and 300),
  add constraint orders_void_fields check (
    (status = 'voided') = (voided_at is not null)
    and (voided_at is null) = (voided_by is null)
    and (voided_at is null) = (void_reason is null)
  );
create index orders_voided_by_idx on public.orders (voided_by);

alter table public.orders drop constraint orders_customer_id_fkey;
alter table public.orders add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customers (id) on delete restrict;

create table public.refund_approvals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete restrict,
  approved_by uuid not null references public.staff (id) on delete restrict,
  requested_by uuid not null references public.staff (id) on delete restrict,
  max_amount bigint not null check (max_amount >= 0),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index refund_approvals_store_id_idx on public.refund_approvals (store_id);
create index refund_approvals_order_id_idx on public.refund_approvals (order_id);
create index refund_approvals_approved_by_idx on public.refund_approvals (approved_by);
create index refund_approvals_requested_by_idx on public.refund_approvals (requested_by);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  register_id uuid not null references public.registers (id) on delete restrict,
  session_id uuid not null references public.register_sessions (id) on delete restrict,
  receipt_number integer not null check (receipt_number > 0),
  staff_id uuid not null references public.staff (id) on delete restrict,
  approval_id uuid references public.refund_approvals (id) on delete restrict,
  approved_by uuid references public.staff (id) on delete restrict,
  reason text not null check (reason in ('changed_mind', 'damaged', 'wrong_item', 'other')),
  note text check (length(note) <= 300),
  subtotal bigint not null check (subtotal >= 0),
  tax_total bigint not null check (tax_total >= 0),
  total bigint not null check (total >= 0),
  created_at timestamptz not null default now(),
  unique (register_id, receipt_number),
  check (reason <> 'other' or note is not null)
);
create index refunds_order_id_idx on public.refunds (order_id);
create index refunds_store_id_created_at_idx on public.refunds (store_id, created_at desc);
create index refunds_session_id_idx on public.refunds (session_id);
create index refunds_staff_id_idx on public.refunds (staff_id);
create index refunds_approval_id_idx on public.refunds (approval_id);
create index refunds_approved_by_idx on public.refunds (approved_by);

create table public.refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  restock boolean not null,
  amount bigint not null check (amount >= 0),
  tax bigint not null check (tax >= 0),
  created_at timestamptz not null default now()
);
create index refund_items_refund_id_idx on public.refund_items (refund_id);
create index refund_items_order_item_id_idx on public.refund_items (order_item_id);

create table public.refund_payments (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds (id) on delete cascade,
  method public.payment_method not null,
  amount bigint not null check (amount > 0),
  reference text check (length(reference) <= 100),
  created_at timestamptz not null default now(),
  check (method <> 'cash' or reference is null)
);
create index refund_payments_refund_id_idx on public.refund_payments (refund_id);

create function private.can_access_refund(p_refund_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.refunds r
    where r.id = p_refund_id and private.can_access_store(r.store_id)
  )
$$;
revoke execute on function private.can_access_refund(uuid) from public, anon;
grant execute on function private.can_access_refund(uuid) to authenticated;

alter table public.refund_approvals enable row level security;
alter table public.refunds enable row level security;
alter table public.refund_items enable row level security;
alter table public.refund_payments enable row level security;
revoke all on public.refund_approvals, public.refunds, public.refund_items, public.refund_payments from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.refund_approvals, public.refunds, public.refund_items, public.refund_payments from authenticated;

create policy "staff read refund approvals they asked for" on public.refund_approvals
  for select to authenticated using (
    private.can_access_store(store_id)
    and (requested_by = (select private.staff_id()) or (select private.staff_role()) in ('owner', 'manager'))
  );
create policy "staff read refunds in their stores" on public.refunds
  for select to authenticated using (private.can_access_store(store_id));
create policy "staff read refund items" on public.refund_items
  for select to authenticated using (private.can_access_refund(refund_id));
create policy "staff read refund payments" on public.refund_payments
  for select to authenticated using (private.can_access_refund(refund_id));

drop policy "managers edit sessions" on public.register_sessions;
drop policy "owner deletes sessions" on public.register_sessions;
drop policy "staff create orders in their stores" on public.orders;
drop policy "managers edit orders" on public.orders;
drop policy "owner deletes orders" on public.orders;
drop policy "staff add order items" on public.order_items;
drop policy "managers edit order items" on public.order_items;
drop policy "owner deletes order items" on public.order_items;
drop policy "staff add payments" on public.payments;
drop policy "managers edit payments" on public.payments;
drop policy "owner deletes payments" on public.payments;
revoke update, delete on public.orders, public.order_items, public.payments, public.register_sessions from authenticated;

drop policy "managers delete customers" on public.customers;
create policy "staff delete customers" on public.customers
  for delete to authenticated using ((select private.staff_id()) is not null);

create function private.refund_line(p_line_total bigint, p_tax bigint, p_quantity integer, p_refunded integer, p_units integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_units is null or p_units < 1 then
    raise exception 'refund quantity must be at least 1' using errcode = '22023';
  end if;
  if p_refunded + p_units > p_quantity then
    raise exception 'refund quantity is more than was sold' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'amount', private.div_half_even(p_line_total::numeric * (p_refunded + p_units), p_quantity)
      - private.div_half_even(p_line_total::numeric * p_refunded, p_quantity),
    'tax', private.div_half_even(p_tax::numeric * (p_refunded + p_units), p_quantity)
      - private.div_half_even(p_tax::numeric * p_refunded, p_quantity)
  );
end;
$$;
revoke execute on function private.refund_line(bigint, bigint, integer, integer, integer) from public, anon, authenticated;

create function public.create_refund(
  p_order_id uuid,
  p_session_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_approval_id uuid default null,
  p_reason text default 'changed_mind',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_role public.staff_role;
  v_note text := nullif(trim(p_note), '');
  v_order record;
  v_register_id uuid;
  v_session_store uuid;
  v_closed_at timestamptz;
  v_line jsonb;
  v_item record;
  v_units integer;
  v_priced jsonb;
  v_item_ids uuid[] := '{}';
  v_variant_ids uuid[] := '{}';
  v_units_list integer[] := '{}';
  v_restock boolean[] := '{}';
  v_tracks boolean[] := '{}';
  v_amounts bigint[] := '{}';
  v_taxes bigint[] := '{}';
  v_total bigint := 0;
  v_tax_total bigint := 0;
  v_payment jsonb;
  v_method public.payment_method;
  v_amount bigint;
  v_reference text;
  v_paid bigint := 0;
  v_card bigint := 0;
  v_other bigint := 0;
  v_room bigint;
  v_approval_id uuid;
  v_approved_by uuid;
  v_receipt integer;
  v_refund_id uuid;
  i integer;
begin
  select s.id, s.role into v_staff_id, v_role from public.staff s where s.user_id = (select auth.uid()) and s.active;
  if v_staff_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('changed_mind', 'damaged', 'wrong_item', 'other') then
    raise exception 'pick a reason for the refund' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'add a note for the refund' using errcode = '22023';
  end if;
  if length(v_note) > 300 then
    raise exception 'keep the note under 300 characters' using errcode = '22023';
  end if;

  select o.id, o.store_id, o.status, o.receipt_number into v_order
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found or not private.can_access_store(v_order.store_id) then
    raise exception 'sale not found' using errcode = 'P0002';
  end if;
  if v_order.status = 'voided' then
    raise exception 'sale is voided' using errcode = 'P0001';
  end if;

  select r.id, r.store_id, rs.closed_at into v_register_id, v_session_store, v_closed_at
  from public.register_sessions rs
  join public.registers r on r.id = rs.register_id
  where rs.id = p_session_id
  for update of rs;
  if not found or v_session_store <> v_order.store_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_closed_at is not null then
    raise exception 'till is closed' using errcode = 'P0001';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'pick at least one item to refund' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select oi.id, oi.name, oi.quantity, oi.line_total, oi.tax, oi.variant_id,
      coalesce(sl.track, false) as track,
      coalesce((select sum(ri.quantity) from public.refund_items ri where ri.order_item_id = oi.id), 0)::integer as refunded
    into v_item
    from public.order_items oi
    left join public.stock_levels sl on sl.store_id = v_order.store_id and sl.variant_id = oi.variant_id
    where oi.id = (v_line ->> 'order_item_id')::uuid and oi.order_id = p_order_id;
    if not found then
      raise exception 'that item is not on this sale' using errcode = '22023';
    end if;
    if v_item.id = any(v_item_ids) then
      raise exception 'list each item once' using errcode = '22023';
    end if;
    v_units := (v_line ->> 'quantity')::integer;
    if v_units is null or v_units < 1 then
      raise exception 'refund quantity must be at least 1' using errcode = '22023';
    end if;
    if v_units > v_item.quantity - v_item.refunded then
      raise exception '%', format('only %s left to refund on %s', v_item.quantity - v_item.refunded, v_item.name) using errcode = '22023';
    end if;

    v_priced := private.refund_line(v_item.line_total, v_item.tax, v_item.quantity, v_item.refunded, v_units);
    v_item_ids := v_item_ids || v_item.id;
    v_variant_ids := v_variant_ids || v_item.variant_id;
    v_units_list := v_units_list || v_units;
    v_restock := v_restock || coalesce((v_line ->> 'restock')::boolean, true);
    v_tracks := v_tracks || v_item.track;
    v_amounts := v_amounts || (v_priced ->> 'amount')::bigint;
    v_taxes := v_taxes || (v_priced ->> 'tax')::bigint;
    v_total := v_total + (v_priced ->> 'amount')::bigint;
    v_tax_total := v_tax_total + (v_priced ->> 'tax')::bigint;
  end loop;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 10 then
    raise exception 'add how the money goes back' using errcode = '22023';
  end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_method := (v_payment ->> 'method')::public.payment_method;
    v_amount := (v_payment ->> 'amount')::bigint;
    v_reference := nullif(trim(v_payment ->> 'reference'), '');
    if v_amount is null or v_amount <= 0 then
      raise exception 'each refund payment needs an amount above 0' using errcode = '22023';
    end if;
    if v_reference is not null and v_method = 'cash' then
      raise exception 'only card and other refunds can have a reference' using errcode = '22023';
    end if;
    if length(v_reference) > 100 then
      raise exception 'keep the reference under 100 characters' using errcode = '22023';
    end if;
    v_paid := v_paid + v_amount;
    if v_method = 'card' then v_card := v_card + v_amount; end if;
    if v_method = 'other' then v_other := v_other + v_amount; end if;
  end loop;
  if v_paid <> v_total then
    raise exception 'payments must add up to the refund' using errcode = '22023';
  end if;

  if v_card > 0 then
    select coalesce((select sum(p.amount) from public.payments p where p.order_id = p_order_id and p.method = 'card'), 0)
      - coalesce((select sum(rp.amount) from public.refund_payments rp join public.refunds r on r.id = rp.refund_id where r.order_id = p_order_id and rp.method = 'card'), 0)
    into v_room;
    if v_card > v_room then
      raise exception '%', format('card refunds can''t be more than %s', greatest(v_room, 0)) using errcode = '22023';
    end if;
  end if;
  if v_other > 0 then
    select coalesce((select sum(p.amount) from public.payments p where p.order_id = p_order_id and p.method = 'other'), 0)
      - coalesce((select sum(rp.amount) from public.refund_payments rp join public.refunds r on r.id = rp.refund_id where r.order_id = p_order_id and rp.method = 'other'), 0)
    into v_room;
    if v_other > v_room then
      raise exception '%', format('other refunds can''t be more than %s', greatest(v_room, 0)) using errcode = '22023';
    end if;
  end if;

  if v_role = 'cashier' then
    select a.id, a.approved_by into v_approval_id, v_approved_by
    from public.refund_approvals a
    where a.id = p_approval_id
      and a.store_id = v_order.store_id
      and a.order_id = p_order_id
      and a.requested_by = v_staff_id
      and a.used_at is null
      and a.expires_at > now()
      and a.max_amount >= v_total
    for update;
    if not found then
      raise exception 'refund needs approval' using errcode = 'P0001';
    end if;
    update public.refund_approvals set used_at = now() where id = v_approval_id;
  else
    v_approved_by := v_staff_id;
  end if;

  update public.registers set next_receipt_number = next_receipt_number + 1
  where id = v_register_id
  returning next_receipt_number - 1 into v_receipt;

  insert into public.refunds (
    order_id, store_id, register_id, session_id, receipt_number, staff_id, approval_id, approved_by,
    reason, note, subtotal, tax_total, total
  ) values (
    p_order_id, v_order.store_id, v_register_id, p_session_id, v_receipt, v_staff_id, v_approval_id, v_approved_by,
    p_reason, v_note, v_total - v_tax_total, v_tax_total, v_total
  )
  returning id into v_refund_id;

  for i in 1..array_length(v_item_ids, 1) loop
    insert into public.refund_items (refund_id, order_item_id, quantity, restock, amount, tax)
    values (v_refund_id, v_item_ids[i], v_units_list[i], v_restock[i], v_amounts[i], v_taxes[i]);
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    insert into public.refund_payments (refund_id, method, amount, reference)
    values (
      v_refund_id,
      (v_payment ->> 'method')::public.payment_method,
      (v_payment ->> 'amount')::bigint,
      nullif(trim(v_payment ->> 'reference'), '')
    );
  end loop;

  perform 1 from public.stock_levels
  where store_id = v_order.store_id and variant_id = any(v_variant_ids)
  order by variant_id
  for update;

  for i in 1..array_length(v_item_ids, 1) loop
    if v_restock[i] and v_tracks[i] then
      insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
      values (v_order.store_id, v_variant_ids[i], v_units_list[i], 'returned', v_staff_id,
        'Refund #' || v_receipt || ' for receipt #' || v_order.receipt_number);
    end if;
  end loop;

  update public.orders set status = case
    when exists (
      select 1 from public.order_items oi
      where oi.order_id = p_order_id
        and oi.quantity > coalesce((select sum(ri.quantity) from public.refund_items ri where ri.order_item_id = oi.id), 0)
    ) then 'partially_refunded'::public.order_status
    else 'refunded'::public.order_status
  end
  where id = p_order_id;

  return jsonb_build_object('refund_id', v_refund_id, 'receipt_number', v_receipt, 'total', v_total);
end;
$$;

revoke execute on function public.create_refund(uuid, uuid, jsonb, jsonb, uuid, text, text) from public, anon;
grant execute on function public.create_refund(uuid, uuid, jsonb, jsonb, uuid, text, text) to authenticated;

create function public.void_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_role public.staff_role;
  v_reason text := nullif(trim(p_reason), '');
  v_order record;
begin
  select s.id, s.role into v_staff_id, v_role from public.staff s where s.user_id = (select auth.uid()) and s.active;
  if v_staff_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'add a reason for the void' using errcode = '22023';
  end if;
  if length(v_reason) > 300 then
    raise exception 'keep the reason under 300 characters' using errcode = '22023';
  end if;

  select o.id, o.store_id, o.status, o.staff_id, o.receipt_number, rs.closed_at into v_order
  from public.orders o
  join public.register_sessions rs on rs.id = o.session_id
  where o.id = p_order_id
  for update of o;
  if not found or not private.can_access_store(v_order.store_id) then
    raise exception 'sale not found' using errcode = 'P0002';
  end if;
  if v_role = 'cashier' and v_order.staff_id <> v_staff_id then
    raise exception 'you can only void your own sales' using errcode = '42501';
  end if;
  if v_order.status = 'voided' then
    raise exception 'sale is already voided' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.refunds r where r.order_id = p_order_id) then
    raise exception 'sale has refunds' using errcode = 'P0001';
  end if;
  if v_order.closed_at is not null then
    raise exception 'till is closed — refund it instead' using errcode = 'P0001';
  end if;

  update public.orders set status = 'voided', voided_at = now(), voided_by = v_staff_id, void_reason = v_reason
  where id = p_order_id;

  perform 1 from public.stock_levels sl
  where sl.store_id = v_order.store_id
    and sl.variant_id in (select oi.variant_id from public.order_items oi where oi.order_id = p_order_id)
  order by sl.variant_id
  for update;

  insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
  select v_order.store_id, oi.variant_id, oi.quantity, 'returned', v_staff_id, 'Void of receipt #' || v_order.receipt_number
  from public.order_items oi
  join public.stock_levels sl on sl.store_id = v_order.store_id and sl.variant_id = oi.variant_id
  where oi.order_id = p_order_id and sl.track;
end;
$$;

revoke execute on function public.void_order(uuid, text) from public, anon;
grant execute on function public.void_order(uuid, text) to authenticated;

create or replace function public.close_register(p_session_id uuid, p_counted_cash bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_store_id uuid;
  v_opening bigint;
  v_closed_at timestamptz;
  v_cash bigint;
  v_refunds bigint;
  v_voided integer;
begin
  select s.id into v_staff_id from public.staff s where s.user_id = (select auth.uid()) and s.active;
  if v_staff_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'counted cash must be zero or more' using errcode = '22023';
  end if;
  if length(p_note) > 300 then
    raise exception 'keep the note under 300 characters' using errcode = '22023';
  end if;

  select r.store_id, rs.opening_cash, rs.closed_at into v_store_id, v_opening, v_closed_at
  from public.register_sessions rs
  join public.registers r on r.id = rs.register_id
  where rs.id = p_session_id
  for update of rs;
  if not found then
    raise exception 'till not found' using errcode = 'P0002';
  end if;
  if not private.can_access_store(v_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_closed_at is not null then
    raise exception 'till is closed' using errcode = 'P0001';
  end if;

  select coalesce(sum(p.amount), 0) into v_cash
  from public.payments p
  join public.orders o on o.id = p.order_id
  where o.session_id = p_session_id and o.status <> 'voided' and p.method = 'cash';

  select coalesce(sum(rp.amount), 0) into v_refunds
  from public.refund_payments rp
  join public.refunds r on r.id = rp.refund_id
  where r.session_id = p_session_id and rp.method = 'cash';

  select count(*) into v_voided from public.orders o where o.session_id = p_session_id and o.status = 'voided';

  update public.register_sessions set
    closed_by = v_staff_id,
    closed_at = now(),
    counted_cash = p_counted_cash,
    close_note = nullif(trim(p_note), '')
  where id = p_session_id;

  return jsonb_build_object(
    'opening_cash', v_opening,
    'cash_sales', v_cash,
    'cash_refunds', v_refunds,
    'expected_cash', v_opening + v_cash - v_refunds,
    'counted_cash', p_counted_cash,
    'difference', p_counted_cash - (v_opening + v_cash - v_refunds),
    'voided_count', v_voided
  );
end;
$$;
```

- [ ] **Step 4: Apply, regenerate the types, and run the database tests**

Run: `npx supabase db reset >/dev/null && npm run test:db && npm run db:types && npx prettier --write lib/supabase/database.types.ts`
Expected: `Result: PASS`, including `orders.test.sql` (50) and `refund_vectors.test.sql` (8). `database.types.ts` gains `refunds`, `create_refund` and `void_order`.

- [ ] **Step 5: Run the unit tests and the build's typecheck, then commit**

Run: `npm test && npx tsc --noEmit`
Expected: all pass. Nothing in TS reads the new columns yet.

```bash
git add supabase/migrations/20261014000010_orders.sql supabase/tests/orders.test.sql supabase/tests/schema.test.sql supabase/tests/access.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): refunds, voids, sale lockdown and customer delete rules"
```

### Task 3: Server layer — orders, refunds, approvals, customers

**Files:**
- Create:
  - `lib/orders/list.ts`, `lib/orders/list.test.ts`;
  - `lib/orders/detail.ts`, `lib/orders/detail.test.ts`;
  - `lib/orders/refund-schema.ts`, `lib/orders/refund-schema.test.ts`;
  - `lib/orders/errors.ts`, `lib/orders/errors.test.ts`;
  - `lib/orders/queries.ts`, `lib/orders/actions.ts`;
  - `lib/register/approver.ts`;
  - `lib/customers/schema.ts`, `lib/customers/schema.test.ts`;
  - `lib/customers/list.ts`, `lib/customers/list.test.ts`;
  - `lib/customers/queries.ts`, `lib/customers/actions.ts`.
- Modify: `lib/register/actions.ts`. `requestApproval` uses `verifyApprover`, and `CloseTillState` gains `cash_refunds` and `voided_count`.

**Interfaces:**
- Consumes: Task 1 (`methodRoom`, `MethodRoom`, `RefundMethod`), Task 2 (`create_refund`, `void_order`, `refund_approvals`, the FK names), and `REGISTER_COOKIE` from `lib/register/pick-register.ts`.
- Produces:
  - **`lib/orders/list.ts`:**
    - `OrderStatus`, `ORDER_STATUS_LABELS`, `ORDER_PAGE_SIZE = 50`, `OrderFilters`;
    - `parseOrderFilters(params)`, `receiptNumberFrom(q)`, `likePattern(q)`, `zonedDayStart(date, timeZone): Date`, `nextDay(date)`.
  - **`lib/orders/detail.ts`:**
    - `RefundReason`, `REFUND_REASONS`, `REFUND_REASON_LABELS`;
    - `OrderDetailRow`, `RefundableLine`, `RefundContext`, `DeviceSession = { sessionId: string; registerName: string }`;
    - `toRefundContext(order)`, `unitsLeft(context)`, `canVoid(order, staff)`, `refundAvailability(order, session): "ok" | "no-till" | "nothing"`.
  - **`lib/orders/refund-schema.ts`:** `refundSchema`, `RefundInput`.
  - **`lib/orders/errors.ts`:** `orderDbError(error, currency)`, `orderErrorKind(error)`, `OrderErrorKind = "approval" | "closed"`.
  - **`lib/orders/queries.ts`** (server-only):
    - `OrderListRow`, `loadOrders(supabase, storeId, filters, timeZone): Promise<{ rows; total }>`;
    - `loadOrder(supabase, id): Promise<OrderDetailRow | null>`;
    - `loadDeviceSession(supabase, storeId): Promise<DeviceSession | null>`.
  - **`lib/orders/actions.ts`:**
    - `refundSale(input: RefundInput)` returns `{ ok: true; refundId; receiptNumber; total } | { ok: false; error; kind? }`;
    - `voidSale({ orderId, reason })` returns `{ ok: true } | { ok: false; error }`;
    - `requestRefundApproval({ email, password, orderId, amount })` returns `{ ok: true; approvalId; maxAmount } | { ok: false; error }`;
    - `findSaleByReceipt({ receiptNumber })` returns `{ ok: true; context: RefundContext } | { ok: false; error }`.
  - **`lib/register/approver.ts`:** `verifyApprover(email, password, storeId)`.
  - **`lib/customers/schema.ts`:** `customerSchema`, `CustomerValues`.
  - **`lib/customers/list.ts`:** `CustomerRow`, `CustomerSale`, `summariseCustomers`, `matchCustomers`, `parseCustomerFilters`, `CUSTOMER_PAGE_SIZE`, `pageOf`.
  - **`lib/customers/queries.ts`:** `loadCustomerRows(supabase)`, `loadCustomer(supabase, id)`, `CustomerDetail`.
  - **`lib/customers/actions.ts`:** `saveCustomer(prev, formData): Promise<ActionResult>`, `deleteCustomer(id): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing unit tests**

`lib/orders/list.test.ts`:
```ts
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
```

`lib/orders/detail.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { canVoid, refundAvailability, toRefundContext, unitsLeft, type OrderDetailRow } from "./detail";

const order: OrderDetailRow = {
  id: "o1",
  store_id: "s1",
  staff_id: "c3",
  receipt_number: 7,
  created_at: "2026-10-14T10:00:00Z",
  status: "partially_refunded",
  subtotal: 1200,
  discount_total: 0,
  tax_total: 120,
  total: 1320,
  void_reason: null,
  voided_at: null,
  register: { name: "Counter 1" },
  session: { closed_at: null },
  staff: { name: "Casey" },
  discounter: null,
  voider: null,
  customer: null,
  order_items: [
    { id: "i2", line_number: 2, name: "Mug", sku: "MUG", unit_price: 300, quantity: 1, discount: 0, tax: 30, line_total: 330 },
    { id: "i1", line_number: 1, name: "Tea", sku: "TEA", unit_price: 300, quantity: 3, discount: 0, tax: 90, line_total: 990 },
  ],
  payments: [
    { id: "p1", method: "card", amount: 500, tendered: null, change: null, reference: null },
    { id: "p2", method: "cash", amount: 820, tendered: 1000, change: 180, reference: null },
  ],
  refunds: [
    {
      id: "r1",
      receipt_number: 8,
      created_at: "2026-10-14T11:00:00Z",
      reason: "changed_mind",
      note: null,
      total: 330,
      staff: null,
      approver: null,
      refund_items: [{ order_item_id: "i1", quantity: 1, restock: true, amount: 330 }],
      refund_payments: [{ method: "card", amount: 330, reference: null }],
    },
  ],
};
const fresh: OrderDetailRow = { ...order, status: "completed", refunds: [] };
const till = { sessionId: "s", registerName: "Counter 1" };

describe("toRefundContext", () => {
  it("lists lines in order with what's already refunded and what's left on card", () => {
    const context = toRefundContext(order);
    expect(context.lines.map((line) => [line.name, line.refunded, line.unitPaid])).toEqual([
      ["Tea", 1, 330],
      ["Mug", 0, 330],
    ]);
    expect(context.room).toEqual({ card: 170, other: 0 });
    expect(unitsLeft(context)).toBe(3);
  });
});

describe("canVoid", () => {
  it("allows a cashier's own fresh sale while the till is open", () => {
    expect(canVoid(fresh, { id: "c3", role: "cashier" })).toBe(true);
  });
  it("stops cashiers voiding other people's sales, but not managers", () => {
    expect(canVoid(fresh, { id: "c9", role: "cashier" })).toBe(false);
    expect(canVoid(fresh, { id: "c9", role: "manager" })).toBe(true);
  });
  it("stops voids after refunds, after close, and twice", () => {
    expect(canVoid(order, { id: "c3", role: "owner" })).toBe(false);
    expect(canVoid({ ...fresh, session: { closed_at: "2026-10-14T18:00:00Z" } }, { id: "c3", role: "owner" })).toBe(false);
    expect(canVoid({ ...fresh, status: "voided" }, { id: "c3", role: "owner" })).toBe(false);
  });
});

describe("refundAvailability", () => {
  it("needs a till on this device", () => {
    expect(refundAvailability(order, null)).toBe("no-till");
    expect(refundAvailability(order, till)).toBe("ok");
  });
  it("has nothing to refund on a voided or fully refunded sale", () => {
    expect(refundAvailability({ ...fresh, status: "voided" }, till)).toBe("nothing");
    const all = {
      ...order.refunds[0],
      refund_items: [
        { order_item_id: "i1", quantity: 3, restock: true, amount: 990 },
        { order_item_id: "i2", quantity: 1, restock: true, amount: 330 },
      ],
    };
    expect(refundAvailability({ ...order, status: "refunded", refunds: [all] }, till)).toBe("nothing");
  });
});
```

`lib/orders/refund-schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { refundSchema } from "./refund-schema";

const valid = {
  orderId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
  lines: [{ orderItemId: "00000000-0000-4000-8000-000000000003", quantity: 1, restock: true }],
  payments: [{ method: "card" as const, amount: 325, reference: null }],
  approvalId: null,
  reason: "changed_mind" as const,
  note: "",
};

describe("refundSchema", () => {
  it("accepts a normal refund", () => {
    expect(refundSchema.safeParse(valid).success).toBe(true);
  });
  it("needs a note when the reason is other", () => {
    const result = refundSchema.safeParse({ ...valid, reason: "other", note: "  " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["note"]);
  });
  it("rejects a zero payment and a zero quantity", () => {
    expect(refundSchema.safeParse({ ...valid, payments: [{ method: "cash", amount: 0 }] }).success).toBe(false);
    expect(refundSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], quantity: 0 }] }).success).toBe(false);
  });
});
```

`lib/orders/errors.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { orderDbError, orderErrorKind } from "./errors";

describe("orderDbError", () => {
  it("explains refund and void failures in plain words", () => {
    expect(orderDbError({ code: "22023", message: "only 2 left to refund on Tea" }, "USD")).toBe("Only 2 left to refund on Tea.");
    expect(orderDbError({ code: "22023", message: "card refunds can't be more than 170" }, "USD")).toBe("Card refunds can't be more than $1.70. Use cash for the rest.");
    expect(orderDbError({ code: "P0001", message: "refund needs approval" }, "USD")).toBe("This refund needs a manager's approval.");
    expect(orderDbError({ code: "P0001", message: "till is closed" }, "USD")).toBe("Open a till to give refunds.");
    expect(orderDbError({ code: "P0001", message: "till is closed — refund it instead" }, "USD")).toBe("This sale can't be voided: its till has been closed. Refund it instead.");
    expect(orderDbError({ code: "P0001", message: "sale has refunds" }, "USD")).toBe("This sale has refunds and can't be voided.");
    expect(orderDbError({ code: "42501", message: "you can only void your own sales" }, "USD")).toBe("You can only void your own sales.");
    expect(orderDbError({ code: "22023", message: "payments must add up to the refund" }, "USD")).toBe("Payments must add up to the refund.");
    expect(orderDbError(null, "USD")).toBe("Something went wrong. Try again.");
  });
});

describe("orderErrorKind", () => {
  it("spots an approval rejection and a closed till", () => {
    expect(orderErrorKind({ message: "refund needs approval" })).toBe("approval");
    expect(orderErrorKind({ message: "till is closed" })).toBe("closed");
    expect(orderErrorKind({ message: "till is closed — refund it instead" })).toBeNull();
    expect(orderErrorKind(null)).toBeNull();
  });
});
```

`lib/customers/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { customerSchema } from "./schema";

describe("customerSchema", () => {
  it("trims and turns blanks into nothing", () => {
    expect(customerSchema.parse({ name: "  Ana Reyes ", email: " ", phone: "", notes: "" })).toEqual({ name: "Ana Reyes", email: null, phone: null, notes: null });
  });
  it("checks the email and the lengths", () => {
    expect(customerSchema.safeParse({ name: "Ana", email: "not-an-email", phone: "", notes: "" }).error?.issues[0].message).toBe("Enter a valid email");
    expect(customerSchema.safeParse({ name: "", email: "", phone: "", notes: "" }).error?.issues[0].message).toBe("Enter a name");
    expect(customerSchema.safeParse({ name: "Ana", email: "", phone: "1".repeat(41), notes: "" }).success).toBe(false);
    expect(customerSchema.safeParse({ name: "Ana", email: "", phone: "", notes: "x".repeat(1001) }).success).toBe(false);
  });
});
```

`lib/customers/list.test.ts`:
```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/orders lib/customers`
Expected: FAIL. The imports `./list`, `./detail`, `./refund-schema`, `./errors` and `./schema` don't resolve.

- [ ] **Step 3: Implement the pure modules**

`lib/orders/list.ts`:
```ts
import type { Database } from "@/lib/supabase/database.types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  completed: "Completed",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  voided: "Voided",
};

export const ORDER_PAGE_SIZE = 50;

export type OrderFilters = { q: string; from: string; to: string; status: OrderStatus | ""; register: string; cashier: string; page: number };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function day(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}

export function parseOrderFilters(params: Record<string, string | string[] | undefined>): OrderFilters {
  const status = first(params.status);
  const register = first(params.register);
  const cashier = first(params.cashier);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).trim().slice(0, 60),
    from: day(first(params.from)),
    to: day(first(params.to)),
    status: Object.hasOwn(ORDER_STATUS_LABELS, status) ? (status as OrderStatus) : "",
    register: GUID.test(register) ? register : "",
    cashier: GUID.test(cashier) ? cashier : "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function receiptNumberFrom(q: string): number | null {
  const match = /^#?(\d{1,9})$/.exec(q.trim());
  return match ? Number(match[1]) : null;
}

export function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, "")}%`;
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function zonedDayStart(date: string, timeZone: string): Date {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, dayOfMonth);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

export function nextDay(date: string): string {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth + 1)).toISOString().slice(0, 10);
}
```

`lib/orders/detail.ts`:
```ts
import { methodRoom, type MethodRoom, type RefundMethod } from "@/lib/refunds";
import type { StaffRole } from "@/lib/auth/roles";
import type { OrderStatus } from "./list";

export type RefundReason = "changed_mind" | "damaged" | "wrong_item" | "other";

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  changed_mind: "Changed mind",
  damaged: "Damaged",
  wrong_item: "Wrong item",
  other: "Other",
};

export const REFUND_REASONS = (Object.keys(REFUND_REASON_LABELS) as RefundReason[]).map((value) => ({ value, label: REFUND_REASON_LABELS[value] }));

export type OrderDetailRow = {
  id: string;
  store_id: string;
  staff_id: string;
  receipt_number: number;
  created_at: string;
  status: OrderStatus;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  void_reason: string | null;
  voided_at: string | null;
  register: { name: string } | null;
  session: { closed_at: string | null } | null;
  staff: { name: string } | null;
  discounter: { name: string } | null;
  voider: { name: string } | null;
  customer: { id: string; name: string } | null;
  order_items: { id: string; line_number: number | null; name: string; sku: string; unit_price: number; quantity: number; discount: number; tax: number; line_total: number }[];
  payments: { id: string; method: RefundMethod; amount: number; tendered: number | null; change: number | null; reference: string | null }[];
  refunds: {
    id: string;
    receipt_number: number;
    created_at: string;
    reason: RefundReason;
    note: string | null;
    total: number;
    staff: { name: string } | null;
    approver: { name: string } | null;
    refund_items: { order_item_id: string; quantity: number; restock: boolean; amount: number }[];
    refund_payments: { method: RefundMethod; amount: number; reference: string | null }[];
  }[];
};

export type RefundableLine = { orderItemId: string; name: string; quantity: number; refunded: number; lineTotal: number; tax: number; unitPaid: number };

export type RefundContext = { orderId: string; receiptNumber: number; registerName: string; createdAt: string; lines: RefundableLine[]; room: MethodRoom };

export type DeviceSession = { sessionId: string; registerName: string };

export function refundedByItem(order: OrderDetailRow): Map<string, number> {
  const refunded = new Map<string, number>();
  for (const refund of order.refunds) {
    for (const item of refund.refund_items) refunded.set(item.order_item_id, (refunded.get(item.order_item_id) ?? 0) + item.quantity);
  }
  return refunded;
}

export function toRefundContext(order: OrderDetailRow): RefundContext {
  const refunded = refundedByItem(order);
  const lines = [...order.order_items]
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))
    .map((item) => ({
      orderItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      refunded: refunded.get(item.id) ?? 0,
      lineTotal: item.line_total,
      tax: item.tax,
      unitPaid: Math.round(item.line_total / item.quantity),
    }));
  return {
    orderId: order.id,
    receiptNumber: order.receipt_number,
    registerName: order.register?.name ?? "",
    createdAt: order.created_at,
    lines,
    room: methodRoom(order.payments, order.refunds.flatMap((refund) => refund.refund_payments)),
  };
}

export function unitsLeft(context: RefundContext): number {
  return context.lines.reduce((sum, line) => sum + line.quantity - line.refunded, 0);
}

export function canVoid(order: OrderDetailRow, staff: { id: string; role: StaffRole }): boolean {
  if (order.status !== "completed" || order.refunds.length > 0) return false;
  if (!order.session || order.session.closed_at !== null) return false;
  return staff.role !== "cashier" || order.staff_id === staff.id;
}

export function refundAvailability(order: OrderDetailRow, session: DeviceSession | null): "ok" | "no-till" | "nothing" {
  if (order.status === "voided" || unitsLeft(toRefundContext(order)) === 0) return "nothing";
  return session ? "ok" : "no-till";
}
```

`lib/orders/refund-schema.ts`:
```ts
import { z } from "zod";

const money = z.number().int().max(Number.MAX_SAFE_INTEGER);

export const refundSchema = z
  .object({
    orderId: z.guid(),
    sessionId: z.guid(),
    lines: z
      .array(z.object({ orderItemId: z.guid(), quantity: z.number().int().min(1).max(9_999), restock: z.boolean() }))
      .min(1)
      .max(200),
    payments: z
      .array(z.object({ method: z.enum(["cash", "card", "other"]), amount: money.min(1), reference: z.string().trim().max(100).nullable().optional() }))
      .max(10),
    approvalId: z.guid().nullable(),
    reason: z.enum(["changed_mind", "damaged", "wrong_item", "other"]),
    note: z.string().trim().max(300),
  })
  .refine((value) => value.reason !== "other" || value.note.length > 0, { message: "Add a note for the refund", path: ["note"] });

export type RefundInput = z.input<typeof refundSchema>;
```

`lib/orders/errors.ts`:
```ts
import { friendlyDbError } from "@/lib/db-error";
import { formatMoney } from "@/lib/money";

export type OrderErrorKind = "approval" | "closed";

const MESSAGES: [string, string][] = [
  ["till is closed — refund it instead", "This sale can't be voided: its till has been closed. Refund it instead."],
  ["till is closed", "Open a till to give refunds."],
  ["refund needs approval", "This refund needs a manager's approval."],
  ["sale has refunds", "This sale has refunds and can't be voided."],
  ["you can only void your own sales", "You can only void your own sales."],
  ["sale is already voided", "This sale is already voided."],
  ["sale is voided", "This sale was voided, so it can't be refunded."],
  ["sale not found", "That sale no longer exists."],
];

export function orderDbError(error: { code?: string; message?: string } | null, currency: string): string {
  if (!error) return "Something went wrong. Try again.";
  const message = error.message ?? "";
  const left = /^only (\d+) left to refund on (.+)$/.exec(message);
  if (left) return `Only ${left[1]} left to refund on ${left[2]}.`;
  const cap = /^(card|other) refunds can't be more than (\d+)$/.exec(message);
  if (cap) return `${cap[1] === "card" ? "Card" : "Other"} refunds can't be more than ${formatMoney(Number(cap[2]), currency, "en-US")}. Use cash for the rest.`;
  const known = MESSAGES.find(([key]) => message.includes(key));
  if (known) return known[1];
  if (error.code === "22023" && message) return `${message.charAt(0).toUpperCase()}${message.slice(1)}.`;
  return friendlyDbError(error);
}

export function orderErrorKind(error: { message?: string } | null): OrderErrorKind | null {
  const message = error?.message ?? "";
  if (message.includes("refund needs approval")) return "approval";
  if (message === "till is closed") return "closed";
  return null;
}
```

`lib/customers/schema.ts`:
```ts
import { z } from "zod";

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null);

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120, "Keep the name under 120 characters"),
  email: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.email("Enter a valid email")]))
    .transform((value) => value || null),
  phone: optional(40, "Keep the phone under 40 characters"),
  notes: optional(1000, "Keep the notes under 1,000 characters"),
});

export type CustomerValues = z.output<typeof customerSchema>;
```

`lib/customers/list.ts`:
```ts
import type { OrderStatus } from "@/lib/orders/list";

export type CustomerRow = { id: string; name: string; email: string | null; phone: string | null; totalSpent: number; lastVisit: string | null };
export type CustomerSale = { customer_id: string; total: number; created_at: string; status: OrderStatus; refunds: { total: number }[] };
export type CustomerFilters = { q: string; page: number };

export const CUSTOMER_PAGE_SIZE = 50;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseCustomerFilters(params: Record<string, string | string[] | undefined>): CustomerFilters {
  const page = Number.parseInt(first(params.page), 10);
  return { q: first(params.q).trim().slice(0, 60), page: Number.isFinite(page) && page > 0 ? page : 1 };
}

export function summariseCustomers(customers: { id: string; name: string; email: string | null; phone: string | null }[], sales: CustomerSale[]): CustomerRow[] {
  const spent = new Map<string, number>();
  const last = new Map<string, string>();
  for (const sale of sales) {
    if (sale.status === "voided") continue;
    const net = sale.total - sale.refunds.reduce((sum, refund) => sum + refund.total, 0);
    spent.set(sale.customer_id, (spent.get(sale.customer_id) ?? 0) + net);
    const seen = last.get(sale.customer_id);
    if (!seen || sale.created_at > seen) last.set(sale.customer_id, sale.created_at);
  }
  return customers
    .map((customer) => ({ ...customer, totalSpent: spent.get(customer.id) ?? 0, lastVisit: last.get(customer.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchCustomers(rows: CustomerRow[], q: string): CustomerRow[] {
  const query = q.toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => [row.name, row.email ?? "", row.phone ?? ""].some((value) => value.toLowerCase().includes(query)));
}

export function pageOf<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages, total: rows.length };
}
```

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run lib/orders lib/customers`
Expected: PASS (list, detail, refund-schema, errors, customers schema, customers list).

- [ ] **Step 5: Implement the server modules**

`lib/register/approver.ts`:
```ts
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

export async function verifyApprover(email: string, password: string, storeId: string): Promise<{ ok: true; approverId: string } | { ok: false; error: string }> {
  const verifier = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signedIn, error: signInError } = await verifier.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.user) return { ok: false, error: "Email or password is incorrect." };
  try {
    const admin = createAdminClient();
    const { data: approver } = await admin.from("staff").select("id, role, active, staff_stores(store_id)").eq("user_id", signedIn.user.id).maybeSingle();
    if (!approver || !approver.active || (approver.role !== "manager" && approver.role !== "owner")) {
      return { ok: false, error: "Only an active manager or owner can approve this." };
    }
    if (approver.role === "manager" && !approver.staff_stores.some((entry) => entry.store_id === storeId)) {
      return { ok: false, error: "That manager doesn't work in this store." };
    }
    return { ok: true, approverId: approver.id };
  } finally {
    await verifier.auth.signOut({ scope: "local" });
  }
}
```

`lib/register/actions.ts` changes:
- Remove the imports `createClient as createSupabaseClient` and `SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL`. Add `import { verifyApprover } from "./approver";`.
- In `requestApproval`, replace everything from `const verifier = …` through the second role check (`if (approver.role === "manager" && …) { … }`) with:
```ts
  const approver = await verifyApprover(parsed.data.email, parsed.data.password, store.id);
  if (!approver.ok) return approver;

  const admin = createAdminClient();
```
  and change the insert's `approved_by: approver.id` to `approved_by: approver.approverId`.
- `CloseTillState["summary"]` becomes `{ opening_cash: number; cash_sales: number; cash_refunds: number; expected_cash: number; counted_cash: number; difference: number; voided_count: number } | null`.

`lib/orders/queries.ts`:
```ts
import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { REGISTER_COOKIE } from "@/lib/register/pick-register";
import { ORDER_PAGE_SIZE, likePattern, nextDay, receiptNumberFrom, zonedDayStart, type OrderFilters, type OrderStatus } from "./list";
import type { DeviceSession, OrderDetailRow } from "./detail";

type Client = SupabaseClient<Database>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OrderListRow = {
  id: string;
  receipt_number: number;
  created_at: string;
  status: OrderStatus;
  total: number;
  register: { name: string } | null;
  staff: { name: string } | null;
  customer: { name: string } | null;
};

const LIST_FIELDS = "id, receipt_number, created_at, status, total, register:registers(name), staff:staff!orders_staff_id_fkey(name)";

export async function loadOrders(supabase: Client, storeId: string, filters: OrderFilters, timeZone: string): Promise<{ rows: OrderListRow[]; total: number }> {
  const receipt = receiptNumberFrom(filters.q);
  const customerSearch = filters.q && receipt === null ? filters.q : "";
  const select: string = `${LIST_FIELDS}, customer:customers${customerSearch ? "!inner" : ""}(name)`;
  let query = supabase.from("orders").select(select, { count: "exact" }).eq("store_id", storeId);
  if (receipt !== null) query = query.eq("receipt_number", receipt);
  if (customerSearch) query = query.ilike("customer.name", likePattern(customerSearch));
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.register) query = query.eq("register_id", filters.register);
  if (filters.cashier) query = query.eq("staff_id", filters.cashier);
  if (filters.from) query = query.gte("created_at", zonedDayStart(filters.from, timeZone).toISOString());
  if (filters.to) query = query.lt("created_at", zonedDayStart(nextDay(filters.to), timeZone).toISOString());
  const start = (filters.page - 1) * ORDER_PAGE_SIZE;
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(start, start + ORDER_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as OrderListRow[], total: count ?? 0 };
}

const DETAIL_FIELDS = [
  "id, store_id, staff_id, receipt_number, created_at, status, subtotal, discount_total, tax_total, total, void_reason, voided_at",
  "register:registers(name)",
  "session:register_sessions(closed_at)",
  "staff:staff!orders_staff_id_fkey(name)",
  "discounter:staff!orders_discount_by_fkey(name)",
  "voider:staff!orders_voided_by_fkey(name)",
  "customer:customers(id, name)",
  "order_items(id, line_number, name, sku, unit_price, quantity, discount, tax, line_total)",
  "payments(id, method, amount, tendered, change, reference)",
  "refunds(id, receipt_number, created_at, reason, note, total, staff:staff!refunds_staff_id_fkey(name), approver:staff!refunds_approved_by_fkey(name), refund_items(order_item_id, quantity, restock, amount), refund_payments(method, amount, reference))",
].join(", ");

export async function loadOrder(supabase: Client, id: string): Promise<OrderDetailRow | null> {
  if (!GUID.test(id)) return null;
  const { data, error } = await supabase.from("orders").select(DETAIL_FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const order = data as unknown as OrderDetailRow;
  order.refunds.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return order;
}

export async function loadDeviceSession(supabase: Client, storeId: string): Promise<DeviceSession | null> {
  const cookieStore = await cookies();
  const registerId = cookieStore.get(REGISTER_COOKIE)?.value;
  if (!registerId || !GUID.test(registerId)) return null;
  const { data } = await supabase
    .from("register_sessions")
    .select("id, register:registers!inner(name, store_id)")
    .eq("register_id", registerId)
    .eq("register.store_id", storeId)
    .is("closed_at", null)
    .maybeSingle();
  if (!data) return null;
  return { sessionId: data.id, registerName: (data.register as unknown as { name: string }).name };
}
```

`lib/orders/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyApprover } from "@/lib/register/approver";
import { refundSchema, type RefundInput } from "./refund-schema";
import { orderDbError, orderErrorKind, type OrderErrorKind } from "./errors";
import { loadOrder } from "./queries";
import { toRefundContext, unitsLeft, type RefundContext } from "./detail";

async function currencyOf(orderId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("store:stores(currency)").eq("id", orderId).maybeSingle();
  return (data?.store as unknown as { currency: string } | null)?.currency ?? "USD";
}

export async function refundSale(
  input: RefundInput,
): Promise<{ ok: true; refundId: string; receiptNumber: number; total: number } | { ok: false; error: string; kind?: OrderErrorKind | null }> {
  await requireStaff();
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) {
    const noteMissing = parsed.error.issues.some((issue) => issue.path[0] === "note");
    return { ok: false, error: noteMissing ? "Add a note for the refund." : "Something in the refund isn't valid. Check it and try again." };
  }
  const refund = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_refund", {
    p_order_id: refund.orderId,
    p_session_id: refund.sessionId,
    p_lines: refund.lines.map((line) => ({ order_item_id: line.orderItemId, quantity: line.quantity, restock: line.restock })),
    p_payments: refund.payments.map((payment) => ({ method: payment.method, amount: payment.amount, reference: payment.reference || null })),
    p_approval_id: refund.approvalId ?? undefined,
    p_reason: refund.reason,
    p_note: refund.note || undefined,
  });
  if (error || !data) return { ok: false, error: orderDbError(error, await currencyOf(refund.orderId)), kind: orderErrorKind(error) };
  const result = data as { refund_id: string; receipt_number: number; total: number };
  revalidatePath("/orders");
  revalidatePath(`/orders/${refund.orderId}`);
  return { ok: true, refundId: result.refund_id, receiptNumber: result.receipt_number, total: result.total };
}

const voidSchema = z.object({ orderId: z.guid(), reason: z.string().trim().min(1).max(300) });

export async function voidSale(input: { orderId: string; reason: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Add a reason for the void, up to 300 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_order", { p_order_id: parsed.data.orderId, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: orderDbError(error, "USD") };
  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/register");
  return { ok: true };
}

const approvalSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
  orderId: z.guid(),
  amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export async function requestRefundApproval(input: {
  email: string;
  password: string;
  orderId: string;
  amount: number;
}): Promise<{ ok: true; approvalId: string; maxAmount: number } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const parsed = approvalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the manager's email and password." };
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("id, store_id").eq("id", parsed.data.orderId).maybeSingle();
  if (!order) return { ok: false, error: "That sale no longer exists." };

  const approver = await verifyApprover(parsed.data.email, parsed.data.password, order.store_id);
  if (!approver.ok) return approver;

  const admin = createAdminClient();
  const { data: approval, error } = await admin
    .from("refund_approvals")
    .insert({ store_id: order.store_id, order_id: order.id, approved_by: approver.approverId, requested_by: staff.id, max_amount: parsed.data.amount })
    .select("id, max_amount")
    .single();
  if (error || !approval) return { ok: false, error: "Couldn't record the approval. Try again." };
  return { ok: true, approvalId: approval.id, maxAmount: approval.max_amount };
}

export async function findSaleByReceipt(input: { receiptNumber: number }): Promise<{ ok: true; context: RefundContext } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  if (!Number.isInteger(input.receiptNumber) || input.receiptNumber < 1 || input.receiptNumber > 999_999_999) {
    return { ok: false, error: "Enter a receipt number, like 42." };
  }
  const supabase = await createClient();
  const { data: found } = await supabase
    .from("orders")
    .select("id")
    .eq("store_id", store.id)
    .eq("receipt_number", input.receiptNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const order = found ? await loadOrder(supabase, found.id) : null;
  if (!order) return { ok: false, error: "No sale with that receipt number in this store." };
  if (order.status === "voided") return { ok: false, error: "That sale was voided, so there's nothing to refund." };
  const context = toRefundContext(order);
  if (unitsLeft(context) === 0) return { ok: false, error: "Everything on that sale has already been refunded." };
  return { ok: true, context };
}
```

`lib/customers/queries.ts`:
```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { OrderStatus } from "@/lib/orders/list";
import { summariseCustomers, type CustomerRow, type CustomerSale } from "./list";

type Client = SupabaseClient<Database>;

export type CustomerDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  orders: {
    id: string;
    receipt_number: number;
    created_at: string;
    status: OrderStatus;
    total: number;
    store: { name: string; currency: string; timezone: string } | null;
    refunds: { id: string; receipt_number: number; created_at: string; total: number }[];
  }[];
};

export async function loadCustomerRows(supabase: Client): Promise<CustomerRow[]> {
  const [customers, sales] = await Promise.all([
    fetchAll((from, to) => supabase.from("customers").select("id, name, email, phone").order("name").order("id").range(from, to)),
    fetchAll((from, to) =>
      supabase.from("orders").select("customer_id, total, created_at, status, refunds(total)").not("customer_id", "is", null).order("id").range(from, to),
    ),
  ]);
  return summariseCustomers(customers, sales as unknown as CustomerSale[]);
}

export async function loadCustomer(supabase: Client, id: string): Promise<CustomerDetail | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, notes, orders(id, receipt_number, created_at, status, total, store:stores(name, currency, timezone), refunds(id, receipt_number, created_at, total))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const customer = data as unknown as CustomerDetail;
  customer.orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return customer;
}
```

`lib/customers/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-error";
import { customerSchema } from "./schema";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveCustomer(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const parsed = customerSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  if (id) {
    if (!GUID.test(id)) return { ok: false, error: "That customer no longer exists." };
    const { data, error } = await supabase.from("customers").update(parsed.data).eq("id", id).select("id");
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || data.length === 0) return { ok: false, error: "That customer no longer exists." };
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { ok: true, message: "Customer saved." };
  }
  const { data: created, error } = await supabase.from("customers").insert(parsed.data).select("id").single();
  if (error || !created) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export async function deleteCustomer(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  if (!GUID.test(id)) return { ok: false, error: "That customer no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error?.code === "23503") return { ok: false, error: "This customer has sales and can't be deleted." };
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data || data.length === 0) return { ok: false, error: "That customer no longer exists." };
  revalidatePath("/customers");
  return { ok: true };
}
```

- [ ] **Step 6: Typecheck, lint, and test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors; lint clean; all unit tests pass, including the register tests that still use `requestApproval`.

- [ ] **Step 7: Commit**

```bash
git add lib/orders lib/customers lib/register/approver.ts lib/register/actions.ts
git commit -m "feat(orders): refund, void, approval and customer server actions"
```

### Task 4: Orders screens, refund panel, void dialog, refund slip

**Files:**
- Create:
  - `components/orders/status-tag.tsx`, `components/orders/orders-toolbar.tsx`, `components/orders/orders-table.tsx`, `components/orders/order-actions.tsx`;
  - `components/refunds/refund-panel.tsx`, `components/refunds/refund-dialog.tsx`, `components/refunds/refund-approval-dialog.tsx`, `components/refunds/void-dialog.tsx`;
  - `app/(app)/orders/[id]/page.tsx`, `app/receipts/refunds/[refundId]/page.tsx`.
- Modify: `app/(app)/orders/page.tsx` (replace the placeholder).

**Interfaces:**
- Consumes:
  - from Task 3: `loadOrders`, `loadOrder`, `loadDeviceSession`, `parseOrderFilters`, `ORDER_STATUS_LABELS`, `ORDER_PAGE_SIZE`, `toRefundContext`, `refundedByItem`, `refundAvailability`, `canVoid`, `REFUND_REASONS`, `REFUND_REASON_LABELS`, `refundSale`, `voidSale`, `requestRefundApproval`;
  - from Task 1: `priceRefund`, `suggestPayout`, `checkPayout`;
  - from earlier sub-projects: `Pagination` (`components/products/pagination.tsx`), `PrintOnLoad`, `PrintButton` (`components/register/`), `currencyDigits`, `formatMoney`, `parseMoney`.
- Produces:
  - `RefundPanel` props `{ context: RefundContext; sessionId: string; role: StaffRole; currency: string; onDone: () => void }`;
  - `RefundDialog` props `{ open; onOpenChange; context: RefundContext | null; sessionId: string; role; currency; onDone }`;
  - `VoidDialog` props `{ open; onOpenChange; orderId: string; receiptNumber: number; total: number; money: (minor: number) => string; onVoided: () => void }`;
  - `StatusTag` props `{ status: OrderStatus }`.
- **Accessible names the e2e tests rely on:**
  - buttons "Refund" (exact), "Void", "Fewer {name}", "More {name}", "Back to stock", "Damaged", "Get approval", "Refund {money}", "Add payment method", "Done";
  - fields "Refund method {n}", "Refund amount {n}", "Reference {n}", "Reason", "Note", "Reason for the void", "Manager email", "Manager password";
  - text "Refund #{n} recorded", "Open a till to give refunds";
  - links "#{receipt}" in the list, "Print refund slip".

- [ ] **Step 1: Shared pieces**

`components/orders/status-tag.tsx`:
```tsx
import Tag from "@/components/_ui/tag";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders/list";

const TONES = { completed: "green", partially_refunded: "amber", refunded: "orange", voided: "red" } as const;

export default function StatusTag({ status }: { status: OrderStatus }) {
  return (
    <Tag tone={TONES[status]} size="sm">
      {ORDER_STATUS_LABELS[status]}
    </Tag>
  );
}
```

`components/refunds/refund-approval-dialog.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { requestRefundApproval } from "@/lib/orders/actions";

type RefundApprovalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amount: number;
  money: (minor: number) => string;
  onApproved: (approval: { id: string; maxAmount: number }) => void;
};

function ApprovalForm({ orderId, amount, money, onApproved }: Omit<RefundApprovalDialogProps, "open" | "onOpenChange">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await requestRefundApproval({ email: email.trim(), password, orderId, amount });
      if (result.ok) onApproved({ id: result.approvalId, maxAmount: result.maxAmount });
      else setError(result.error);
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Manager approval</DialogTitle>
        <DialogDescription>A refund of {money(amount)} needs a manager or owner to approve it here. You stay signed in.</DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Manager email" htmlFor="refund-approval-email">
        <Input id="refund-approval-email" type="email" autoComplete="off" className="min-h-11" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </Field>
      <Field label="Manager password" htmlFor="refund-approval-password">
        <Input id="refund-approval-password" type="password" autoComplete="off" className="min-h-11" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>
          {pending ? "Checking…" : "Approve"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function RefundApprovalDialog({ open, onOpenChange, ...props }: RefundApprovalDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ApprovalForm key={openCount} {...props} />
      </DialogContent>
    </Dialog>
  );
}
```

`components/refunds/void-dialog.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { voidSale } from "@/lib/orders/actions";

type VoidDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  receiptNumber: number;
  total: number;
  money: (minor: number) => string;
  onVoided: () => void;
};

function VoidForm({ orderId, receiptNumber, total, money, onVoided }: Omit<VoidDialogProps, "open" | "onOpenChange">) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await voidSale({ orderId, reason });
      if (result.ok) onVoided();
      else setError(result.error);
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Void receipt #{receiptNumber}</DialogTitle>
        <DialogDescription>The {money(total)} sale is cancelled and its items go back to stock. This can&apos;t be undone.</DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Reason for the void" htmlFor="void-reason">
        <Input id="void-reason" className="min-h-11" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} required autoFocus />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending || !reason.trim()}>
          {pending ? "Voiding…" : "Void sale"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function VoidDialog({ open, onOpenChange, ...props }: VoidDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VoidForm key={openCount} {...props} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: The refund panel and its dialog**

`components/refunds/refund-panel.tsx`:
```tsx
"use client";

import { useState } from "react";
import Button, { buttonVariants } from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import RefundApprovalDialog from "./refund-approval-dialog";
import { checkPayout, priceRefund, suggestPayout, type RefundMethod, type RefundPayment } from "@/lib/refunds";
import { currencyDigits, formatMoney, parseMoney } from "@/lib/money";
import { refundSale } from "@/lib/orders/actions";
import { REFUND_REASONS, type RefundContext, type RefundReason } from "@/lib/orders/detail";
import type { StaffRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type RefundPanelProps = { context: RefundContext; sessionId: string; role: StaffRole; currency: string; onDone: () => void };
type PayoutRow = { method: RefundMethod; amount: string; reference: string };
type Done = { refundId: string; receiptNumber: number; total: number };

const METHOD_LABELS: Record<RefundMethod, string> = { card: "Card", cash: "Cash", other: "Other" };
const METHODS: RefundMethod[] = ["card", "cash", "other"];

function toMajor(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

export default function RefundPanel({ context, sessionId, role, currency, onDone }: RefundPanelProps) {
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const [units, setUnits] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<RefundReason>("changed_mind");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [approval, setApproval] = useState<{ id: string; maxAmount: number } | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const open = context.lines.filter((line) => line.quantity - line.refunded > 0);
  const chosen = open.filter((line) => (units[line.orderItemId] ?? 0) > 0);
  const totals = priceRefund(
    chosen.map((line) => ({ lineTotal: line.lineTotal, tax: line.tax, quantity: line.quantity, refunded: line.refunded, units: units[line.orderItemId] })),
  );
  const [prevTotal, setPrevTotal] = useState(totals.total);
  if (totals.total !== prevTotal) {
    setPrevTotal(totals.total);
    setRows(null);
  }

  const shown: PayoutRow[] = rows ?? suggestPayout(totals.total, context.room).map((payment) => ({ method: payment.method, amount: toMajor(payment.amount, currency), reference: "" }));
  const parsed = shown.map((row) => ({ row, amount: parseMoney(row.amount, currency) }));
  const payments: RefundPayment[] | null = parsed.some((entry) => entry.amount === null)
    ? null
    : parsed.map(({ row, amount }) => ({ method: row.method, amount: amount ?? 0, reference: row.method === "cash" ? null : row.reference.trim() || null }));
  const payoutError = chosen.length === 0 ? null : payments === null ? "Enter each amount, like 3.25" : checkPayout(totals.total, payments, context.room);
  const needsApproval = role === "cashier" && (approval === null || approval.maxAmount < totals.total);
  const ready = chosen.length > 0 && payoutError === null && (reason !== "other" || note.trim().length > 0) && !pending;

  function step(orderItemId: string, left: number, delta: number) {
    setUnits((current) => ({ ...current, [orderItemId]: Math.min(left, Math.max(0, (current[orderItemId] ?? 0) + delta)) }));
  }

  function editRow(index: number, change: Partial<PayoutRow>) {
    setRows(shown.map((row, position) => (position === index ? { ...row, ...change } : row)));
  }

  async function submit() {
    if (!payments) return;
    setPending(true);
    setError(null);
    try {
      const result = await refundSale({
        orderId: context.orderId,
        sessionId,
        lines: chosen.map((line) => ({ orderItemId: line.orderItemId, quantity: units[line.orderItemId], restock: restock[line.orderItemId] ?? true })),
        payments,
        approvalId: approval?.id ?? null,
        reason,
        note: note.trim(),
      });
      if (result.ok) {
        setDone({ refundId: result.refundId, receiptNumber: result.receiptNumber, total: result.total });
      } else {
        if (result.kind === "approval") setApproval(null);
        setError(result.error);
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <DialogHeader>
          <DialogTitle>Refund #{done.receiptNumber} recorded</DialogTitle>
          <DialogDescription>{money(done.total)} back to the customer.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-center gap-2">
          <a href={`/receipts/refunds/${done.refundId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11")}>
            Print refund slip
          </a>
          <Button variant="primary" size="md" className="min-h-11" onClick={onDone} autoFocus>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Refund receipt #{context.receiptNumber}</DialogTitle>
        <DialogDescription>
          {context.registerName ? `From ${context.registerName}. ` : ""}Pick what&apos;s coming back and how the money goes back.
        </DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <ul className="flex flex-col gap-3">
        {open.map((line) => {
          const left = line.quantity - line.refunded;
          const count = units[line.orderItemId] ?? 0;
          const stocked = restock[line.orderItemId] ?? true;
          return (
            <li key={line.orderItemId} className="border-line-strong flex flex-col gap-2 border-b pb-3">
              <div className="flex items-baseline justify-between gap-2">
                <span>{line.name}</span>
                <span className="caption-style text-subtle">
                  {money(line.unitPaid)} each · {left} of {line.quantity} left
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="icon" className="size-11" aria-label={`Fewer ${line.name}`} disabled={count === 0} onClick={() => step(line.orderItemId, left, -1)}>
                  −
                </Button>
                <output aria-label={`Refund quantity of ${line.name}`} className="min-w-8 text-center">
                  {count}
                </output>
                <Button variant="secondary" size="icon" className="size-11" aria-label={`More ${line.name}`} disabled={count >= left} onClick={() => step(line.orderItemId, left, 1)}>
                  +
                </Button>
                <div role="group" aria-label={`Stock for ${line.name}`} className="ml-auto flex gap-1">
                  <Button variant="ghost" size="md" aria-pressed={stocked} className="aria-pressed:text-foreground min-h-11 aria-pressed:bg-white/6" onClick={() => setRestock((current) => ({ ...current, [line.orderItemId]: true }))}>
                    Back to stock
                  </Button>
                  <Button variant="ghost" size="md" aria-pressed={!stocked} className="aria-pressed:text-foreground min-h-11 aria-pressed:bg-white/6" onClick={() => setRestock((current) => ({ ...current, [line.orderItemId]: false }))}>
                    Damaged
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Field label="Reason" htmlFor="refund-reason">
        <Select value={reason} onValueChange={(value) => setReason(value as RefundReason)}>
          <SelectTrigger id="refund-reason" className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFUND_REASONS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {reason === "other" && (
        <Field label="Note" htmlFor="refund-note">
          <Input id="refund-note" className="min-h-11" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} required />
        </Field>
      )}
      <div className="flex justify-between font-medium">
        <span>Refund total</span>
        <span>{money(totals.total)}</span>
      </div>
      {chosen.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="caption-style text-subtle mb-1">Money back</legend>
          {shown.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Select value={row.method} onValueChange={(value) => editRow(index, { method: value as RefundMethod, reference: value === "cash" ? "" : row.reference })}>
                <SelectTrigger aria-label={`Refund method ${index + 1}`} className="min-h-11 w-auto min-w-[7em]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input aria-label={`Refund amount ${index + 1}`} inputMode="decimal" className="min-h-11 w-[7em]" value={row.amount} onChange={(event) => editRow(index, { amount: event.target.value })} />
              {row.method !== "cash" && (
                <Input
                  aria-label={`Reference ${index + 1}`}
                  placeholder="Reference (optional)"
                  maxLength={100}
                  className="min-h-11 min-w-[8em] flex-1"
                  value={row.reference}
                  onChange={(event) => editRow(index, { reference: event.target.value })}
                />
              )}
              <Button variant="ghost" size="md" className="min-h-11" aria-label={`Remove refund payment ${index + 1}`} onClick={() => setRows(shown.filter((_, position) => position !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="md" className="min-h-11 self-start" onClick={() => setRows([...shown, { method: "cash", amount: "", reference: "" }])}>
            Add payment method
          </Button>
          {payoutError && <span role="status" className="caption-style text-warning">{payoutError}</span>}
        </fieldset>
      )}
      <DialogFooter>
        {needsApproval ? (
          <Button variant="primary" size="md" className="min-h-11" disabled={!ready} onClick={() => setApprovalOpen(true)}>
            Get approval
          </Button>
        ) : (
          <Button variant="primary" size="md" className="min-h-11" disabled={!ready} onClick={submit}>
            {pending ? "Refunding…" : `Refund ${money(totals.total)}`}
          </Button>
        )}
      </DialogFooter>
      <RefundApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        orderId={context.orderId}
        amount={totals.total}
        money={money}
        onApproved={(granted) => {
          setApproval(granted);
          setApprovalOpen(false);
        }}
      />
    </div>
  );
}
```

`components/refunds/refund-dialog.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/_ui/dialog";
import RefundPanel from "./refund-panel";
import type { RefundContext } from "@/lib/orders/detail";
import type { StaffRole } from "@/lib/auth/roles";

type RefundDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: RefundContext | null;
  sessionId: string;
  role: StaffRole;
  currency: string;
  onDone: () => void;
};

export default function RefundDialog({ open, onOpenChange, context, ...props }: RefundDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[40em]">{context && <RefundPanel key={openCount} context={context} {...props} />}</DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Orders list**

`components/orders/orders-toolbar.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import { ORDER_STATUS_LABELS, type OrderFilters, type OrderStatus } from "@/lib/orders/list";

type OrdersToolbarProps = { filters: OrderFilters; registers: { id: string; name: string }[]; cashiers: { id: string; name: string }[] };

export default function OrdersToolbar({ filters, registers, cashiers }: OrdersToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(filters.q);
  const [prevQuery, setPrevQuery] = useState(filters.q);
  if (filters.q !== prevQuery) {
    setPrevQuery(filters.q);
    setQuery(filters.q);
  }

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({ q: query.trim() });
  }

  return (
    <div className="border-line-strong flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <form role="search" onSubmit={submit} className="flex min-w-[16em] flex-1 items-center gap-2">
        <Input aria-label="Search receipt number or customer" placeholder="Receipt number or customer" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary" size="md">Search</Button>
      </form>
      <Select value={filters.status || "all"} onValueChange={(value) => update({ status: value === "all" ? "" : value })}>
        <SelectTrigger aria-label="Status" className="w-auto min-w-[10em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
            <SelectItem key={status} value={status}>{ORDER_STATUS_LABELS[status]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.register || "all"} onValueChange={(value) => update({ register: value === "all" ? "" : value })}>
        <SelectTrigger aria-label="Register" className="w-auto min-w-[9em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All registers</SelectItem>
          {registers.map((register) => (
            <SelectItem key={register.id} value={register.id}>{register.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.cashier || "all"} onValueChange={(value) => update({ cashier: value === "all" ? "" : value })}>
        <SelectTrigger aria-label="Cashier" className="w-auto min-w-[9em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All staff</SelectItem>
          {cashiers.map((cashier) => (
            <SelectItem key={cashier.id} value={cashier.id}>{cashier.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input type="date" aria-label="From" className="w-auto" value={filters.from} onChange={(event) => update({ from: event.target.value })} />
      <Input type="date" aria-label="To" className="w-auto" value={filters.to} onChange={(event) => update({ to: event.target.value })} />
    </div>
  );
}
```

`components/orders/orders-table.tsx`:
```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StatusTag from "./status-tag";
import { formatMoney } from "@/lib/money";
import type { OrderListRow } from "@/lib/orders/queries";

type OrdersTableProps = { rows: OrderListRow[]; currency: string; timeZone: string };

export default function OrdersTable({ rows, currency, timeZone }: OrdersTableProps) {
  const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Register</TableHead>
          <TableHead>Cashier</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/orders/${row.id}`} className="hover:underline">#{row.receipt_number}</Link>
            </TableCell>
            <TableCell>{when.format(new Date(row.created_at))}</TableCell>
            <TableCell>{row.register?.name ?? "—"}</TableCell>
            <TableCell>{row.staff?.name ?? "—"}</TableCell>
            <TableCell>{row.customer?.name ?? "—"}</TableCell>
            <TableCell>{formatMoney(row.total, currency, "en-US")}</TableCell>
            <TableCell><StatusTag status={row.status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Note: `OrderListRow` is a type-only import from a `server-only` module. Type imports are erased, so this is safe in a server component.

`app/(app)/orders/page.tsx` (replace the whole file):
```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { ScrollArea } from "@/components/_ui/scroll-area";
import OrdersToolbar from "@/components/orders/orders-toolbar";
import OrdersTable from "@/components/orders/orders-table";
import Pagination from "@/components/products/pagination";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { ORDER_PAGE_SIZE, parseOrderFilters } from "@/lib/orders/list";
import { loadOrders } from "@/lib/orders/queries";

export const metadata: Metadata = { title: "Orders" };

type OrdersPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const staff = await requireRole("cashier");
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="orders" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Orders" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }

  const params = await searchParams;
  const filters = parseOrderFilters(params);
  const supabase = await createClient();
  const [{ data: storeRow }, { data: registers }, { data: cashiers }] = await Promise.all([
    supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle(),
    supabase.from("registers").select("id, name").eq("store_id", store.id).order("name"),
    supabase.from("staff").select("id, name").order("name"),
  ]);
  const timeZone = storeRow?.timezone ?? "UTC";
  const { rows, total } = await loadOrders(supabase, store.id, filters, timeZone);
  const pages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));

  const hrefFor = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value) next.set(key, value);
    next.set("page", String(page));
    return `/orders?${next.toString()}`;
  };

  return (
    <section id="orders" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Orders" />
      <OrdersToolbar filters={filters} registers={registers ?? []} cashiers={cashiers ?? []} />
      <ScrollArea className="min-h-0 flex-1">
        {total === 0 ? (
          <EmptyState title="No sales match" description="Try another receipt number, date or filter." />
        ) : (
          <OrdersTable rows={rows} currency={store.currency} timeZone={timeZone} />
        )}
      </ScrollArea>
      <Pagination page={Math.min(filters.page, pages)} pages={pages} total={total} hrefFor={hrefFor} />
    </section>
  );
}
```

- [ ] **Step 4: The sale's page**

`components/orders/order-actions.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button, { buttonVariants } from "@/components/_ui/button";
import RefundDialog from "@/components/refunds/refund-dialog";
import VoidDialog from "@/components/refunds/void-dialog";
import { formatMoney } from "@/lib/money";
import type { RefundContext } from "@/lib/orders/detail";
import type { StaffRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type OrderActionsProps = {
  orderId: string;
  receiptNumber: number;
  total: number;
  context: RefundContext;
  availability: "ok" | "no-till" | "nothing";
  sessionId: string | null;
  voidable: boolean;
  role: StaffRole;
  currency: string;
};

export default function OrderActions({ orderId, receiptNumber, total, context, availability, sessionId, voidable, role, currency }: OrderActionsProps) {
  const router = useRouter();
  const [refundOpen, setRefundOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const money = (minor: number) => formatMoney(minor, currency, "en-US");

  function changeRefund(next: boolean) {
    setRefundOpen(next);
    if (!next) router.refresh();
  }

  return (
    <>
      {availability === "no-till" && <span className="caption-style text-subtle hidden sm:inline">Open a till to give refunds</span>}
      <a href={`/receipts/${orderId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "md" }), "min-h-11")}>
        Reprint receipt
      </a>
      {voidable && (
        <Button variant="secondary" size="md" className="min-h-11" onClick={() => setVoidOpen(true)}>
          Void
        </Button>
      )}
      {availability !== "nothing" && (
        <Button variant="primary" size="md" className="min-h-11" disabled={availability === "no-till"} onClick={() => setRefundOpen(true)}>
          Refund
        </Button>
      )}
      {sessionId && (
        <RefundDialog open={refundOpen} onOpenChange={changeRefund} context={context} sessionId={sessionId} role={role} currency={currency} onDone={() => changeRefund(false)} />
      )}
      <VoidDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        orderId={orderId}
        receiptNumber={receiptNumber}
        total={total}
        money={money}
        onVoided={() => {
          setVoidOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
```

`app/(app)/orders/[id]/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StatusTag from "@/components/orders/status-tag";
import OrderActions from "@/components/orders/order-actions";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { loadDeviceSession, loadOrder } from "@/lib/orders/queries";
import { REFUND_REASON_LABELS, canVoid, refundAvailability, refundedByItem, toRefundContext } from "@/lib/orders/detail";

export const metadata: Metadata = { title: "Sale" };

const METHOD_LABELS = { cash: "Cash", card: "Card", other: "Other" } as const;

type OrderPageProps = { params: Promise<{ id: string }> };

export default async function OrderPage({ params }: OrderPageProps) {
  const staff = await requireRole("cashier");
  const { id } = await params;
  const supabase = await createClient();
  const order = await loadOrder(supabase, id);
  if (!order) notFound();

  const [{ data: store }, session] = await Promise.all([
    supabase.from("stores").select("currency, timezone").eq("id", order.store_id).maybeSingle(),
    loadDeviceSession(supabase, order.store_id),
  ]);
  const currency = store?.currency ?? "USD";
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const formatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: store?.timezone ?? "UTC" });
  const when = (iso: string) => formatter.format(new Date(iso));
  const refunded = refundedByItem(order);
  const items = [...order.order_items].sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));
  const names = new Map(items.map((item) => [item.id, item.name]));

  return (
    <section id="order" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={`Receipt #${order.receipt_number}`}
        actions={
          <OrderActions
            orderId={order.id}
            receiptNumber={order.receipt_number}
            total={order.total}
            context={toRefundContext(order)}
            availability={refundAvailability(order, session)}
            sessionId={session?.sessionId ?? null}
            voidable={canVoid(order, staff)}
            role={staff.role}
            currency={currency}
          />
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-[56em] flex-col gap-6 p-4">
          <dl className="flex flex-wrap items-start gap-x-8 gap-y-3">
            <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Status</dt><dd><StatusTag status={order.status} /></dd></div>
            <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Date</dt><dd>{when(order.created_at)}</dd></div>
            <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Register</dt><dd>{order.register?.name ?? "—"}</dd></div>
            <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Cashier</dt><dd>{order.staff?.name ?? "—"}</dd></div>
            <div className="flex flex-col gap-1">
              <dt className="caption-style text-subtle">Customer</dt>
              <dd>{order.customer ? <Link href={`/customers/${order.customer.id}`} className="hover:underline">{order.customer.name}</Link> : "—"}</dd>
            </div>
            {order.discount_total > 0 && <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Discount by</dt><dd>{order.discounter?.name ?? "—"}</dd></div>}
          </dl>

          {order.status === "voided" && (
            <p role="status" className="bg-danger/10 text-danger rounded-lg px-3 py-2">
              Voided{order.voided_at ? ` ${when(order.voided_at)}` : ""}{order.voider ? ` by ${order.voider.name}` : ""}: {order.void_reason}
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Refunded</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}<span className="caption-style text-subtle block">{item.sku}</span></TableCell>
                  <TableCell>{item.quantity} × {money(item.unit_price)}</TableCell>
                  <TableCell>{refunded.get(item.id) ?? 0}</TableCell>
                  <TableCell>{item.discount > 0 ? `−${money(item.discount)}` : "—"}</TableCell>
                  <TableCell>{money(item.tax)}</TableCell>
                  <TableCell>{money(item.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <dl className="flex w-full max-w-[22em] flex-col gap-1 self-end">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
            {order.discount_total > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd>−{money(order.discount_total)}</dd></div>}
            <div className="flex justify-between"><dt>Tax</dt><dd>{money(order.tax_total)}</dd></div>
            <div className="flex justify-between font-medium"><dt>Total</dt><dd>{money(order.total)}</dd></div>
          </dl>

          <section aria-labelledby="payments-heading" className="flex flex-col gap-2">
            <h2 id="payments-heading">Payments</h2>
            <ul className="flex flex-col gap-1">
              {order.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-4">
                  <span>
                    {METHOD_LABELS[payment.method]}
                    {payment.reference ? ` (${payment.reference})` : ""}
                    {payment.change !== null && payment.change > 0 ? ` · change ${money(payment.change)}` : ""}
                  </span>
                  <span>{money(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </section>

          {order.refunds.length > 0 && (
            <section aria-labelledby="refunds-heading" className="flex flex-col gap-2">
              <h2 id="refunds-heading">Refunds</h2>
              <ul className="flex flex-col gap-4">
                {order.refunds.map((refund) => (
                  <li key={refund.id} className="border-line-strong flex flex-col gap-1 border-t pt-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">Refund #{refund.receipt_number} · {money(refund.total)}</span>
                      <a href={`/receipts/refunds/${refund.id}?print=1`} target="_blank" rel="noreferrer" className="caption-style hover:underline">Print slip</a>
                    </div>
                    <span className="caption-style text-subtle">
                      {when(refund.created_at)} · by {refund.staff?.name ?? "—"}
                      {refund.approver && refund.approver.name !== refund.staff?.name ? ` · approved by ${refund.approver.name}` : ""}
                    </span>
                    <span>{REFUND_REASON_LABELS[refund.reason]}{refund.note ? `: ${refund.note}` : ""}</span>
                    <ul className="caption-style flex flex-col">
                      {refund.refund_items.map((item) => (
                        <li key={item.order_item_id}>
                          {item.quantity} × {names.get(item.order_item_id) ?? "Item"} · {money(item.amount)} · {item.restock ? "back to stock" : "damaged"}
                        </li>
                      ))}
                    </ul>
                    <span className="caption-style text-subtle">
                      {refund.refund_payments.map((payment) => `${METHOD_LABELS[payment.method]} ${money(payment.amount)}`).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
```

- [ ] **Step 5: Refund slip**

`app/receipts/refunds/[refundId]/page.tsx`:
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/register/print-on-load";
import PrintButton from "@/components/register/print-button";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { REFUND_REASON_LABELS, type RefundReason } from "@/lib/orders/detail";

export const metadata: Metadata = { title: "Refund slip" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHOD_LABELS = { cash: "Cash", card: "Card", other: "Other" } as const;

type RefundSlip = {
  id: string;
  receipt_number: number;
  created_at: string;
  reason: RefundReason;
  note: string | null;
  tax_total: number;
  total: number;
  store: { name: string; address: string | null; currency: string; timezone: string; receipt_footer: string | null } | null;
  register: { name: string } | null;
  staff: { name: string } | null;
  approver: { name: string } | null;
  order: { receipt_number: number; customer: { name: string } | null } | null;
  refund_items: { id: string; quantity: number; restock: boolean; amount: number; order_item: { name: string; line_number: number | null } | null }[];
  refund_payments: { id: string; method: keyof typeof METHOD_LABELS; amount: number; reference: string | null }[];
};

type RefundSlipPageProps = { params: Promise<{ refundId: string }>; searchParams: Promise<{ print?: string }> };

export default async function RefundSlipPage({ params, searchParams }: RefundSlipPageProps) {
  await requireStaff();
  const { refundId } = await params;
  const { print } = await searchParams;
  if (!GUID.test(refundId)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: business }] = await Promise.all([
    supabase
      .from("refunds")
      .select(
        "id, receipt_number, created_at, reason, note, tax_total, total, store:stores(name, address, currency, timezone, receipt_footer), register:registers(name), staff:staff!refunds_staff_id_fkey(name), approver:staff!refunds_approved_by_fkey(name), order:orders(receipt_number, customer:customers(name)), refund_items(id, quantity, restock, amount, order_item:order_items(name, line_number)), refund_payments(id, method, amount, reference)",
      )
      .eq("id", refundId)
      .maybeSingle(),
    supabase.from("business").select("name").maybeSingle(),
  ]);
  const slip = data as unknown as RefundSlip | null;
  if (!slip || !slip.store) notFound();

  const store = slip.store;
  const money = (minor: number) => formatMoney(minor, store.currency, "en-US");
  const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: store.timezone }).format(new Date(slip.created_at));
  const items = [...slip.refund_items].sort((a, b) => (a.order_item?.line_number ?? 0) - (b.order_item?.line_number ?? 0));

  return (
    <main className="bg-background flex min-h-dvh justify-center p-4 print:bg-white print:p-0 print:text-black">
      {print === "1" && <PrintOnLoad />}
      <article className="flex w-full max-w-[80mm] flex-col gap-3 font-mono text-[12px] leading-snug">
        <header className="flex flex-col items-center gap-1 text-center">
          <h1>{business?.name ?? slip.store.name}</h1>
          <span>{slip.store.name}</span>
          {slip.store.address && <span>{slip.store.address}</span>}
        </header>
        <div className="flex flex-col gap-0.5 border-y border-dashed border-current py-2">
          <span className="font-bold">REFUND #{slip.receipt_number}</span>
          {slip.order && <span>For receipt #{slip.order.receipt_number}</span>}
          <span>{when}</span>
          {slip.register && <span>Register: {slip.register.name}</span>}
          {slip.staff && <span>Refunded by: {slip.staff.name}</span>}
          {slip.approver && slip.approver.name !== slip.staff?.name && <span>Approved by: {slip.approver.name}</span>}
          {slip.order?.customer && <span>Customer: {slip.order.customer.name}</span>}
          <span>Reason: {REFUND_REASON_LABELS[slip.reason]}{slip.note ? ` (${slip.note})` : ""}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col">
              <span>{item.order_item?.name ?? "Item"}</span>
              <span className="flex justify-between">
                <span>{item.quantity} · {item.restock ? "returned to stock" : "damaged"}</span>
                <span>{money(item.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-0.5 border-t border-dashed border-current pt-2">
          <div className="flex justify-between"><dt>Tax refunded</dt><dd>{money(slip.tax_total)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total refunded</dt><dd>{money(slip.total)}</dd></div>
        </dl>
        <dl className="flex flex-col gap-0.5 border-t border-dashed border-current pt-2">
          {slip.refund_payments.map((payment) => (
            <div key={payment.id} className="flex justify-between">
              <dt>{METHOD_LABELS[payment.method]}{payment.reference ? ` (${payment.reference})` : ""}</dt>
              <dd>{money(payment.amount)}</dd>
            </div>
          ))}
        </dl>
        {slip.store.receipt_footer && <span className="border-t border-dashed border-current pt-2 text-center">{slip.store.receipt_footer}</span>}
        <PrintButton />
      </article>
    </main>
  );
}
```

- [ ] **Step 6: Typecheck, lint, build, and a manual smoke check**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. The build lists `/orders`, `/orders/[id]` and `/receipts/refunds/[refundId]`.

Smoke check:
1. Start `npm run dev`.
2. As `cashier@demo.test`, make a sale on Counter 1, then open `/orders`.
3. The sale is listed. Its page shows **Refund**; the panel opens, and **More {item}** raises the refund total.

The full behaviour is pinned by the e2e tests in Task 6.

- [ ] **Step 7: Commit**

```bash
git add components/orders components/refunds "app/(app)/orders" app/receipts/refunds
git commit -m "feat(orders): order list, sale page, refund panel, voids and refund slips"
```

### Task 5: Register Return, void after a sale, close-till lines, Customers screens

**Files:**
- Create:
  - `components/register/return-dialog.tsx`;
  - `components/customers/customers-toolbar.tsx`, `components/customers/customers-table.tsx`, `components/customers/customer-form.tsx`, `components/customers/delete-customer-button.tsx`;
  - `app/(app)/customers/new/page.tsx`, `app/(app)/customers/[id]/page.tsx`.
- Modify:
  - `components/register/register-screen.tsx`, `components/register/sale-done.tsx`, `components/register/close-till-dialog.tsx`;
  - `app/(app)/customers/page.tsx` (replace the placeholder).

**Interfaces:**
- Consumes: `RefundPanel`, `VoidDialog` (Task 4); `findSaleByReceipt`, `saveCustomer`, `deleteCustomer`, `loadCustomerRows`, `loadCustomer`, `matchCustomers`, `pageOf`, `parseCustomerFilters`, `CUSTOMER_PAGE_SIZE`, `CloseTillState` with `cash_refunds`/`voided_count` (Task 3).
- Produces:
  - **Accessible names:**
    - on the register: buttons "Return", "Find sale", "Void sale"; field "Receipt number"; text "Receipt #{n} voided.", "Cash refunds", "Voided sales";
    - on customers: link "New customer"; fields "Name", "Email", "Phone", "Notes", "Search customers"; buttons "Save", "Delete customer", "Delete"; texts "Customer saved." and "This customer has sales and can't be deleted."
  - **Props:** `SaleDone` gains `onVoid: () => void`.

- [ ] **Step 1: Register — Return dialog**

`components/register/return-dialog.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import RefundPanel from "@/components/refunds/refund-panel";
import { findSaleByReceipt } from "@/lib/orders/actions";
import type { RefundContext } from "@/lib/orders/detail";
import type { StaffRole } from "@/lib/auth/roles";

type ReturnDialogProps = { sessionId: string; role: StaffRole; currency: string };

function ReturnForm({ sessionId, role, currency, onDone }: ReturnDialogProps & { onDone: () => void }) {
  const [receipt, setReceipt] = useState("");
  const [context, setContext] = useState<RefundContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await findSaleByReceipt({ receiptNumber: Number(receipt.trim().replace(/^#/, "")) });
      if (result.ok) setContext(result.context);
      else setError(result.error);
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (context) return <RefundPanel context={context} sessionId={sessionId} role={role} currency={currency} onDone={onDone} />;

  return (
    <form onSubmit={find} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Return</DialogTitle>
        <DialogDescription>Scan or type the receipt number from the sale.</DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Receipt number" htmlFor="return-receipt">
        <Input id="return-receipt" inputMode="numeric" className="min-h-11" value={receipt} onChange={(event) => setReceipt(event.target.value)} required autoFocus />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>
          {pending ? "Finding…" : "Find sale"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function ReturnDialog(props: ReturnDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  function change(next: boolean) {
    setOpen(next);
    if (!next) router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="md" className="min-h-11">Return</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[40em]">
        <ReturnForm key={openCount} {...props} onDone={() => change(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Register — void after a sale, and close-till lines**

`components/register/sale-done.tsx`:
- The props type becomes `{ orderId: string; receiptNumber: number; change: number; money: (minor: number) => string; onNewSale: () => void; onVoid: () => void }`.
- Destructure `onVoid` as well.
- Before the "New sale" button, add:
```tsx
        <Button variant="ghost" size="md" className="min-h-11" onClick={onVoid}>
          Void sale
        </Button>
```

`components/register/register-screen.tsx`:
- Add imports `import ReturnDialog from "./return-dialog";` and `import VoidDialog from "@/components/refunds/void-dialog";`.
- `type Done = { orderId: string; receiptNumber: number; change: number; total: number };`
- Add state `const [voidOpen, setVoidOpen] = useState(false);`.
- In `complete`, change `setDone({ … })` to `setDone({ orderId: result.orderId, receiptNumber: result.receiptNumber, change: result.change, total: result.total });`.
- In the header actions, put `<ReturnDialog sessionId={props.sessionId} role={props.role} currency={props.currency} />` immediately before `<CloseTillDialog … />`.
- Replace the `<SaleDone … />` element with:
```tsx
        <SaleDone orderId={done.orderId} receiptNumber={done.receiptNumber} change={done.change} money={money} onNewSale={() => setDone(null)} onVoid={() => setVoidOpen(true)} />
```
- After `<CustomerDialog … />`, add:
```tsx
      {done && (
        <VoidDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          orderId={done.orderId}
          receiptNumber={done.receiptNumber}
          total={done.total}
          money={money}
          onVoided={() => {
            setVoidOpen(false);
            setNotice(`Receipt #${done.receiptNumber} voided.`);
            setDone(null);
          }}
        />
      )}
```

`components/register/close-till-dialog.tsx`, in the summary branch:
- Destructure `cash_refunds` and `voided_count` alongside the others.
- Before the "Expected" row, add:
```tsx
          {cash_refunds > 0 && <div className="flex justify-between"><dt>Cash refunds</dt><dd>−{money(cash_refunds)}</dd></div>}
          {voided_count > 0 && <div className="flex justify-between"><dt>Voided sales</dt><dd>{voided_count}</dd></div>}
```

- [ ] **Step 3: Customers screens**

`components/customers/customers-toolbar.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";

export default function CustomersToolbar({ q }: { q: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setQuery(q);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/customers?q=${encodeURIComponent(value)}` : "/customers");
  }

  return (
    <div className="border-line-strong flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <form role="search" onSubmit={submit} className="flex min-w-[16em] flex-1 items-center gap-2">
        <Input aria-label="Search customers" placeholder="Name, email or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary" size="md">Search</Button>
      </form>
    </div>
  );
}
```

`components/customers/customers-table.tsx`:
```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { formatMoney } from "@/lib/money";
import type { CustomerRow } from "@/lib/customers/list";

type CustomersTableProps = { rows: CustomerRow[]; currency: string; timeZone: string };

export default function CustomersTable({ rows, currency, timeZone }: CustomersTableProps) {
  const day = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Total spent</TableHead>
          <TableHead>Last visit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/customers/${row.id}`} className="hover:underline">{row.name}</Link>
            </TableCell>
            <TableCell>{row.email ?? "—"}</TableCell>
            <TableCell>{row.phone ?? "—"}</TableCell>
            <TableCell>{formatMoney(row.totalSpent, currency, "en-US")}</TableCell>
            <TableCell>{row.lastVisit ? day.format(new Date(row.lastVisit)) : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

`components/customers/customer-form.tsx`:
```tsx
"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { saveCustomer } from "@/lib/customers/actions";
import type { ActionResult } from "@/lib/action-result";

type CustomerFormProps = { customer?: { id: string; name: string; email: string | null; phone: string | null; notes: string | null } };

export default function CustomerForm({ customer }: CustomerFormProps) {
  const [values, setValues] = useState({ name: customer?.name ?? "", email: customer?.email ?? "", phone: customer?.phone ?? "", notes: customer?.notes ?? "" });
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveCustomer, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex w-full max-w-[32em] flex-col gap-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <FormMessage result={state} />
      <Field label="Name" htmlFor="customer-name" error={errors?.name}>
        <Input id="customer-name" name="name" maxLength={120} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required />
      </Field>
      <Field label="Email" htmlFor="customer-email" error={errors?.email}>
        <Input id="customer-email" name="email" type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} />
      </Field>
      <Field label="Phone" htmlFor="customer-phone" error={errors?.phone}>
        <Input id="customer-phone" name="phone" maxLength={40} value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} />
      </Field>
      <Field label="Notes" htmlFor="customer-notes" error={errors?.notes}>
        <textarea
          id="customer-notes"
          name="notes"
          maxLength={1000}
          rows={4}
          className="border-line-strong focus-visible:ring-ring/60 rounded-lg border bg-transparent px-3 py-2 outline-none focus-visible:ring-2"
          value={values.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />
      </Field>
      <Button type="submit" variant="primary" size="md" className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
```

`components/customers/delete-customer-button.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { deleteCustomer } from "@/lib/customers/actions";

export default function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteCustomer(id);
      if (result.ok) {
        setOpen(false);
        router.push("/customers");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="md">Delete customer</Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. Customers with sales can&apos;t be deleted.</DialogDescription>
          </DialogHeader>
          {error && <span role="alert" className="caption-style text-danger">{error}</span>}
          <DialogFooter>
            <Button variant="primary" size="md" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

`app/(app)/customers/page.tsx` (replace the whole file):
```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import CustomersToolbar from "@/components/customers/customers-toolbar";
import CustomersTable from "@/components/customers/customers-table";
import Pagination from "@/components/products/pagination";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_PAGE_SIZE, matchCustomers, pageOf, parseCustomerFilters } from "@/lib/customers/list";
import { loadCustomerRows } from "@/lib/customers/queries";

export const metadata: Metadata = { title: "Customers" };

type CustomersPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const staff = await requireRole("cashier");
  const store = await getCurrentStore(staff);
  const filters = parseCustomerFilters(await searchParams);
  const supabase = await createClient();
  const [rows, { data: storeRow }] = await Promise.all([
    loadCustomerRows(supabase),
    store ? supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const result = pageOf(matchCustomers(rows, filters.q), filters.page, CUSTOMER_PAGE_SIZE);
  const hrefFor = (page: number) => `/customers?${new URLSearchParams({ ...(filters.q ? { q: filters.q } : {}), page: String(page) }).toString()}`;

  return (
    <section id="customers" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Customers" actions={<Button href="/customers/new" variant="primary" size="md">New customer</Button>} />
      <CustomersToolbar q={filters.q} />
      <ScrollArea className="min-h-0 flex-1">
        {result.total === 0 ? (
          <EmptyState title="No customers match" description="Try another name, email or phone, or add a new customer." />
        ) : (
          <CustomersTable rows={result.rows} currency={store?.currency ?? "USD"} timeZone={storeRow?.timezone ?? "UTC"} />
        )}
      </ScrollArea>
      <Pagination page={result.page} pages={result.pages} total={result.total} hrefFor={hrefFor} />
    </section>
  );
}
```

`app/(app)/customers/new/page.tsx`:
```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import CustomerForm from "@/components/customers/customer-form";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireRole("cashier");
  return (
    <section id="new-customer" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="New customer" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <CustomerForm />
        </div>
      </ScrollArea>
    </section>
  );
}
```

`app/(app)/customers/[id]/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import CustomerForm from "@/components/customers/customer-form";
import DeleteCustomerButton from "@/components/customers/delete-customer-button";
import StatusTag from "@/components/orders/status-tag";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { loadCustomer } from "@/lib/customers/queries";

export const metadata: Metadata = { title: "Customer" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CustomerPageProps = { params: Promise<{ id: string }> };

export default async function CustomerPage({ params }: CustomerPageProps) {
  await requireRole("cashier");
  const { id } = await params;
  if (!GUID.test(id)) notFound();
  const supabase = await createClient();
  const customer = await loadCustomer(supabase, id);
  if (!customer) notFound();

  const date = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
  const refunds = customer.orders
    .flatMap((order) => order.refunds.map((refund) => ({ ...refund, orderId: order.id, orderReceipt: order.receipt_number, store: order.store })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section id="customer" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={customer.name} actions={<DeleteCustomerButton id={customer.id} name={customer.name} />} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-[56em] flex-col gap-8 p-4">
          <CustomerForm key={`${customer.name}|${customer.email}|${customer.phone}|${customer.notes}`} customer={customer} />
          <section aria-labelledby="sales-heading" className="flex flex-col gap-2">
            <h2 id="sales-heading">Sales</h2>
            {customer.orders.length === 0 ? (
              <p className="text-subtle">No sales yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell><Link href={`/orders/${order.id}`} className="hover:underline">#{order.receipt_number}</Link></TableCell>
                      <TableCell>{date(order.created_at, order.store?.timezone ?? "UTC")}</TableCell>
                      <TableCell>{order.store?.name ?? "—"}</TableCell>
                      <TableCell>{formatMoney(order.total, order.store?.currency ?? "USD", "en-US")}</TableCell>
                      <TableCell><StatusTag status={order.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
          {refunds.length > 0 && (
            <section aria-labelledby="customer-refunds-heading" className="flex flex-col gap-2">
              <h2 id="customer-refunds-heading">Refunds</h2>
              <ul className="flex flex-col gap-1">
                {refunds.map((refund) => (
                  <li key={refund.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      Refund #{refund.receipt_number} for <Link href={`/orders/${refund.orderId}`} className="hover:underline">receipt #{refund.orderReceipt}</Link> · {date(refund.created_at, refund.store?.timezone ?? "UTC")}
                    </span>
                    <span>{formatMoney(refund.total, refund.store?.currency ?? "USD", "en-US")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
```

- [ ] **Step 4: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: no errors. The build lists `/customers`, `/customers/new` and `/customers/[id]`.

- [ ] **Step 5: Commit**

```bash
git add components/register components/customers "app/(app)/customers"
git commit -m "feat(register,customers): returns and voids on the till, customer list and history"
```

### Task 6: End-to-end tests and README

**Files:**
- Modify: `e2e/helpers.ts` (gains `openRegister`), `e2e/register.spec.ts` (imports it), `README.md`.
- Create: `e2e/sales-history.spec.ts`.

The file name sorts after `register.spec.ts` and `roles.spec.ts`, and the suite runs one file at a time in name order. So `register.spec.ts` has already closed Counter 1's till (its expected-cash check stays at $112.90). This file then opens a fresh till with $100.

**Interfaces:**
- Consumes the accessible names listed in Tasks 4 and 5.
- **Demo data:**
  - Espresso is $3.00, Croissant $3.50 and Mug $15.00, with 8.25% tax added.
  - Two Espresso cost $6.50, one Croissant $3.79, one Mug $16.24.
  - Customer "Ana Reyes".
  - The cashier works only in Main Street.

- [ ] **Step 1: Move `openRegister` into the helpers**

`e2e/helpers.ts`: add the `openRegister` function from `e2e/register.spec.ts`, unchanged, as an export (with `test` not needed):
```ts
export async function openRegister(page: Page) {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  const picker = page.getByRole("button", { name: "Counter 1" });
  const openTill = page.getByRole("button", { name: "Open till" });
  const search = page.getByLabel("Search or scan a barcode");
  await expect(picker.or(openTill).or(search)).toBeVisible();
  if (await picker.isVisible()) await picker.click();
  await expect(openTill.or(search)).toBeVisible();
  if (await openTill.isVisible()) {
    await page.getByLabel(/Starting cash/).fill("100");
    await openTill.click();
  }
  await expect(search).toBeVisible();
}
```
In `e2e/register.spec.ts`:
- delete the local `openRegister`;
- change the imports to `import { expect, test } from "@playwright/test";` and `import { openRegister, signIn } from "./helpers";`.

- [ ] **Step 2: Write the e2e spec**

`e2e/sales-history.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { openRegister, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

let refundedReceipt = "";
let voidedReceipt = "";

async function approve(page: Page) {
  await page.getByRole("button", { name: "Get approval" }).click();
  await page.getByLabel("Manager email").fill("manager@demo.test");
  await page.getByLabel("Manager password").fill("password");
  await page.getByRole("button", { name: "Approve" }).click();
}

async function receiptNumber(page: Page): Promise<string> {
  const text = await page.getByText(/^Receipt #\d+$/).textContent();
  return text!.replace("Receipt #", "");
}

test("a cashier refunds one of two items with a manager's approval", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Espresso" }).click();
  await page.getByRole("button", { name: "Add Espresso" }).click();
  await page.getByRole("button", { name: "+ Customer" }).click();
  await page.getByLabel("Search customers").fill("Ana");
  await page.getByRole("button", { name: /Ana Reyes/ }).click();
  await page.getByRole("button", { name: "Pay $6.50" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Card", exact: true }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  refundedReceipt = await receiptNumber(page);

  await page.goto(`/orders?q=${refundedReceipt}`);
  await page.getByRole("link", { name: `#${refundedReceipt}` }).click();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await page.getByRole("button", { name: "More Espresso" }).click();
  await expect(page.getByLabel("Refund amount 1")).toHaveValue("3.25");
  await approve(page);
  await page.getByRole("button", { name: "Refund $3.25" }).click();
  await expect(page.getByText(/Refund #\d+ recorded/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Partially refunded")).toBeVisible();
  await expect(page.getByText("Changed mind")).toBeVisible();
  await expect(page.getByText(/1 × Espresso · \$3\.25 · back to stock/)).toBeVisible();
});

test("a return at the register is paid back in cash", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.getByRole("button", { name: "Pay $3.79" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByLabel("Cash received").fill("5");
  await page.getByRole("button", { name: "Complete sale" }).click();
  const receipt = await receiptNumber(page);
  await page.getByRole("button", { name: "New sale" }).click();

  await page.getByRole("button", { name: "Return", exact: true }).click();
  await page.getByLabel("Receipt number").fill(receipt);
  await page.getByRole("button", { name: "Find sale" }).click();
  await page.getByRole("button", { name: "More Croissant" }).click();
  await expect(page.getByRole("combobox", { name: "Refund method 1" })).toHaveText("Cash");
  await approve(page);
  await page.getByRole("button", { name: "Refund $3.79" }).click();
  await expect(page.getByText(/Refund #\d+ recorded/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Search or scan a barcode")).toBeVisible();
});

test("a cashier voids their own sale and the till still balances", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Mug" }).click();
  await page.getByRole("button", { name: "Pay $16.24" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByLabel("Cash received").fill("20");
  await page.getByRole("button", { name: "Complete sale" }).click();
  voidedReceipt = await receiptNumber(page);

  await page.getByRole("button", { name: "Void sale" }).click();
  await page.getByLabel("Reason for the void").fill("Rang up the wrong item");
  await page.getByRole("dialog").getByRole("button", { name: "Void sale" }).click();
  await expect(page.getByText(`Receipt #${voidedReceipt} voided.`)).toBeVisible();

  await page.getByRole("button", { name: "Close till" }).click();
  await page.getByLabel(/Counted cash/).fill("100");
  await page.getByRole("dialog").getByRole("button", { name: "Close till" }).click();
  await expect(page.getByText("Cash refunds")).toBeVisible();
  await expect(page.getByText("Voided sales")).toBeVisible();
  await expect(page.getByText("None")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Open till" })).toBeVisible();
});

test("orders can be filtered and a sale shows its refunds", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/orders?status=voided");
  await expect(page.getByRole("link", { name: `#${voidedReceipt}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `#${refundedReceipt}` })).toHaveCount(0);
  await page.goto(`/orders?q=${refundedReceipt}`);
  await page.getByRole("link", { name: `#${refundedReceipt}` }).click();
  await expect(page.getByRole("heading", { name: "Refunds" })).toBeVisible();
  await expect(page.getByText("Open a till to give refunds")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toBeDisabled();
});

test("customers can be added, edited, and deleted only without sales", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/customers");
  await page.getByRole("link", { name: "New customer" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Zoe Quinn");
  await page.getByLabel("Email", { exact: true }).fill("zoe@example.com");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Zoe Quinn" })).toBeVisible();
  await page.getByLabel("Phone", { exact: true }).fill("+1 555 0199");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Customer saved.")).toBeVisible();
  await page.getByRole("button", { name: "Delete customer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("link", { name: "Zoe Quinn" })).toHaveCount(0);

  await page.getByLabel("Search customers").fill("Ana");
  await page.getByLabel("Search customers").press("Enter");
  await page.getByRole("link", { name: "Ana Reyes" }).click();
  await expect(page.getByRole("link", { name: `#${refundedReceipt}` })).toBeVisible();
  await page.getByRole("button", { name: "Delete customer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("This customer has sales and can't be deleted.")).toBeVisible();
});

test("a refund slip that doesn't exist returns 404", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/receipts/refunds/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
```

- [ ] **Step 3: Run the new spec against the current code to confirm it's wired**

Run: `npx supabase db reset >/dev/null && npx playwright test e2e/register.spec.ts e2e/sales-history.spec.ts`
Expected: PASS for all 6 register tests and all 6 sales-history tests. If a sales-history test fails, fix the code it points to (never the expected amounts above, which come from the demo prices), then re-run.

- [ ] **Step 4: README**

In `README.md`, after the `## Register` section, add:
```markdown
## Orders, refunds & customers

- **Orders:** every sale in the store, searchable by receipt number or customer and filterable by date, status, register and cashier. Each sale shows its lines, payments, discounts and refunds, and can reprint its receipt.
- **Refunds:** give back some or all of a sale, item by item. Items can go back into stock or be marked damaged. Money goes back by the original method (card first, then cash), and cash refunds come out of the open till's expected cash. Cashiers need a manager or owner to approve each refund on the till. Start a refund from the sale's page or with **Return** on the register.
- **Voids:** cancel a sale while its till is still open, for mistakes caught straight away. Cashiers can void their own sales. After the till closes, use a refund instead.
- **Sales can't be edited:** nobody, not even the owner, can change or delete a recorded sale directly. Every correction is a refund or a void, with who did it and who approved it.
- **Customers:** a list with total spent and last visit, and a page per customer with their sales and refunds. Customers with sales can't be deleted.
```

- [ ] **Step 5: Full verification**

Run each and read its output:
- `npm run lint`: expected clean.
- `npm test`: expected all pass.
- `npx supabase db reset >/dev/null && npm run test:db`: expected `Result: PASS`.
- `npm run test:e2e`: expected all pass, both the `@fresh` setup run and the main run.
- `npm run build`: expected success.

- [ ] **Step 6: Commit**

```bash
git add e2e/helpers.ts e2e/register.spec.ts e2e/sales-history.spec.ts README.md
git commit -m "test(e2e): refunds, returns, voids, order filters and customers; README"
```
