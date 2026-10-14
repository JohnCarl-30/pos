# Catalog & Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers and owners build the catalog by hand or by CSV, and keep exact per-store stock with a full history of every change.

**Architecture:**
- **Stock history.** Stock changes are append-only rows in `stock_movements`. A security-definer trigger keeps `stock_levels.quantity` equal to their sum. Column grants stop anyone writing quantities directly.
- **Database functions.** Multi-row writes go through Postgres functions so each one is all-or-nothing: `save_product`, `import_catalog`, `record_stock_count` and `transfer_stock`.
- **Pure logic.** CSV parsing, import validation, form parsing and list filtering are pure TypeScript in `lib/catalog` and `lib/csv.ts`, tested with Vitest.
- **Pages.** These are Server Components that read through RLS, with client forms that follow the foundation's dialog and form patterns.

**Tech Stack:** Next.js 16.4, React 19, Supabase (Postgres 17, RLS, pgTAP), zod 4, Vitest, Playwright, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-14-catalog-inventory-design.md`

## Global Constraints

- Repo: `/Users/dyeyyyc/Documents/pos`, branch `catalog-f2f3`. Never `git push` without asking the user.
- Next 16: async `params`/`searchParams`/`cookies()`. Read `node_modules/next/dist/docs/` when unsure. Route handlers must redirect with `relativeRedirect` from `lib/http/relative-redirect.ts`, never with `request.url`.
- **Money:**
  - Store it as integer minor units.
  - Parse it with `parseMoney(input, currency)` and display it with `formatMoney(minor, currency)`.
  - The currency is always the current store's (`getCurrentStore(staff).currency`).
  - Prices are business-wide; the README says all stores should share one currency for now.
- **Roles:**
  - Catalog and stock writes need `requireRole("manager")` in the action, and RLS enforces the same rule.
  - Cashiers get a 404 on every `/products` route.
- **Stock rules:**
  - Nothing writes `stock_levels.quantity` directly; every change is a `stock_movements` insert or a function call.
  - `sold`/`returned`/`transfer_*` rows are never inserted from app code in this sub-project.
- **Security-definer functions:**
  - They live in `private`, or in `public` with explicit `auth.uid()` checks.
  - Execute is revoked from `public, anon` on every new function.
  - `set search_path = ''` everywhere.
- **pgTAP:** never nest a data-modifying statement inside a non-top-level WITH. Use `with u as (update … returning 1) select is(count(*), N::bigint, '…') from u;`.
- **Forms (React 19):**
  - Fields are controlled.
  - Dialog forms remount on each open (`key={openCount}`, using the render-time `prevOpen` pattern from `components/settings/staff-dialog.tsx`).
  - Close on success inside the action wrapper.
  - No `setState` inside `useEffect` (lint enforces this).
  - Compare props by value, not by object identity.
- **Every update** checks that a row was actually changed. An update that changes nothing returns "That … no longer exists. Reload the page and try again."
- **Code style (CONVENTIONS.md):**
  - No code comments; Tailwind only.
  - Every button is `Button` with explicit `variant` and `size`.
  - No font classes on `p` or `h1`–`h3`; use `span`/`div` for caption text.
  - Icons are SVG files.
- **Before SQL tasks** load the `supabase` and `supabase-postgres-best-practices` skills.
- **macOS has no `timeout` binary.** Bound Playwright runs through its config timeouts.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Shared machine:** leave the unrelated `next dev -p 3300` process alone, and kill only processes you started.

## Review Focus

1. **History and count drift apart.** Any path that changes stock without a movement must break `quantity = sum(quantity_change)`. Pinned by the invariant pgTAP test in Task 1, re-checked after functions in Tasks 2–3.
2. **A CSV import half-applies or mis-scales prices.** A failure mid-file must leave nothing changed, and `12,50` in EUR must be 1250. Pinned by `import_catalog` all-or-nothing pgTAP (Task 3) and `validateImport` money tests (Task 5).
3. **A manager moves stock in a store they don't manage.** This includes a transfer whose source or destination is outside their stores. Pinned by RLS and `transfer_stock` pgTAP (Tasks 1–2).
4. **Duplicate SKU or barcode reported vaguely or on the wrong row.** The editor must name the row. Pinned by `parseProductForm` duplicate tests (Task 6) and the action pre-check (Task 9).
5. **CSV formula injection on export.** A cell starting with `=`, `+`, `-` or `@` must not run as a formula in Excel. Pinned by `toCsv` tests (Task 4).

---

### Task 1: Inventory schema, stock history and access rules

Load the `supabase` and `supabase-postgres-best-practices` skills first.

**Files:**
- Create: `supabase/migrations/20261014000006_inventory.sql`, `supabase/tests/inventory.test.sql`
- Modify: `supabase/seed.sql:114-116`, `supabase/tests/access.test.sql:45-47,103-104`, `supabase/tests/schema.test.sql` (table list), `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces: enum `public.stock_reason`; table `public.stock_movements`; columns `product_variants.active`, `product_variants.sort_order`, `stock_levels.low_stock_at`; triggers that create stock rows for new variants and new stores and apply movements to `stock_levels`.

- [ ] **Step 1: Write the failing test** — `supabase/tests/inventory.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'inv-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'inv-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'inv-cashier@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD'),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD');
insert into public.staff (id, user_id, name, email, role) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'inv-owner@test', 'owner'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'inv-manager@test', 'manager'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'inv-cashier@test', 'cashier');
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1');
insert into public.tax_classes (id, name, is_default) values ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);
insert into public.products (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Tea');
insert into public.product_variants (id, product_id, sku, price) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'TEA', 300);

select is((select count(*) from public.stock_levels where variant_id = '00000000-0000-0000-0000-0000000000f2'), 2::bigint, 'a new variant gets a stock row in every store');

insert into public.stores (id, name, currency) values ('00000000-0000-0000-0000-0000000000b3', 'Store C', 'USD');
select is((select count(*) from public.stock_levels where store_id = '00000000-0000-0000-0000-0000000000b3'), 1::bigint, 'a new store gets a stock row for every variant');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 10, 'received', '00000000-0000-0000-0000-0000000000c2')$$,
  'a manager records received stock in their store'
);
select lives_ok(
  $$insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', -3, 'damaged', '00000000-0000-0000-0000-0000000000c2', 'Dropped')$$,
  'a manager records damaged stock'
);
select is((select quantity from public.stock_levels where store_id = '00000000-0000-0000-0000-0000000000b1' and variant_id = '00000000-0000-0000-0000-0000000000f2'), 7, 'the count follows the history');
select throws_ok(
  $$insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f2', 5, 'received', '00000000-0000-0000-0000-0000000000c2')$$,
  '42501', null, 'a manager cannot record stock in another store'
);
select throws_ok(
  $$insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 5, 'received', '00000000-0000-0000-0000-0000000000c1')$$,
  '42501', null, 'a manager cannot record stock as someone else'
);
select throws_ok(
  $$insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', -1, 'sold', '00000000-0000-0000-0000-0000000000c2')$$,
  '42501', null, 'sold movements cannot be inserted directly'
);
select throws_ok(
  $$update public.stock_levels set quantity = 100 where store_id = '00000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'stock counts cannot be edited directly'
);
with u as (update public.stock_levels set low_stock_at = 2, track = false where store_id = '00000000-0000-0000-0000-0000000000b1' returning 1)
select is(count(*), 1::bigint, 'a manager can change tracking and the low-stock level') from u;
select throws_ok($$update public.stock_movements set quantity_change = 1$$, '42501', null, 'history cannot be edited');
select throws_ok($$delete from public.stock_movements$$, '42501', null, 'history cannot be deleted');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is((select count(*) from public.stock_movements), 2::bigint, 'a cashier can read history for their store');
select throws_ok(
  $$insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 1, 'received', '00000000-0000-0000-0000-0000000000c3')$$,
  '42501', null, 'a cashier cannot record stock'
);

reset role;
select throws_ok(
  $$insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 0, 'received', '00000000-0000-0000-0000-0000000000c2')$$,
  '23514', null, 'a zero change is rejected'
);
select is(
  (select count(*) from public.stock_levels sl
   where sl.quantity <> coalesce((select sum(m.quantity_change) from public.stock_movements m where m.store_id = sl.store_id and m.variant_id = sl.variant_id), 0)),
  0::bigint,
  'every count equals the sum of its history'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:db`
Expected: `inventory.test.sql` fails (the `stock_movements` relation does not exist).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261014000006_inventory.sql`

```sql
create type public.stock_reason as enum (
  'received', 'counted', 'damaged', 'transfer_in', 'transfer_out', 'sold', 'returned', 'correction'
);

alter table public.product_variants
  add column active boolean not null default true,
  add column sort_order integer not null default 0;

alter table public.stock_levels
  add column low_stock_at integer check (low_stock_at >= 0);

insert into public.stock_levels (variant_id, store_id)
select v.id, s.id from public.product_variants v cross join public.stores s
on conflict (variant_id, store_id) do nothing;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity_change integer not null check (quantity_change <> 0),
  reason public.stock_reason not null,
  staff_id uuid not null references public.staff (id) on delete restrict,
  note text check (length(note) <= 300),
  transfer_id uuid,
  created_at timestamptz not null default now()
);
create index stock_movements_store_created_idx on public.stock_movements (store_id, created_at desc);
create index stock_movements_variant_store_created_idx on public.stock_movements (variant_id, store_id, created_at desc);
create index stock_movements_staff_id_idx on public.stock_movements (staff_id);
create index stock_movements_transfer_id_idx on public.stock_movements (transfer_id) where transfer_id is not null;

insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
select sl.store_id, sl.variant_id, sl.quantity, 'counted', o.id, 'Opening stock'
from public.stock_levels sl
cross join lateral (
  select s.id from public.staff s where s.role = 'owner' order by s.created_at limit 1
) o
where sl.quantity <> 0;

create function private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (variant_id, store_id, quantity)
  values (new.variant_id, new.store_id, new.quantity_change)
  on conflict (variant_id, store_id)
  do update set quantity = public.stock_levels.quantity + excluded.quantity;
  return null;
end;
$$;

create trigger stock_movements_apply
after insert on public.stock_movements
for each row execute function private.apply_stock_movement();

create function private.create_variant_stock_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (variant_id, store_id)
  select new.id, s.id from public.stores s
  on conflict (variant_id, store_id) do nothing;
  return null;
end;
$$;

create trigger product_variants_stock_rows
after insert on public.product_variants
for each row execute function private.create_variant_stock_rows();

create function private.create_store_stock_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (variant_id, store_id)
  select v.id, new.id from public.product_variants v
  on conflict (variant_id, store_id) do nothing;
  return null;
end;
$$;

create trigger stores_stock_rows
after insert on public.stores
for each row execute function private.create_store_stock_rows();

revoke execute on function private.apply_stock_movement() from public, anon, authenticated;
revoke execute on function private.create_variant_stock_rows() from public, anon, authenticated;
revoke execute on function private.create_store_stock_rows() from public, anon, authenticated;

alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon;
revoke update, delete, truncate, references, trigger on public.stock_movements from authenticated;

create policy "staff read their stock movements" on public.stock_movements
  for select to authenticated using (private.can_access_store(store_id));
create policy "managers record stock movements" on public.stock_movements
  for insert to authenticated with check (
    (select private.staff_role()) in ('owner', 'manager')
    and private.can_access_store(store_id)
    and staff_id = (select private.staff_id())
    and reason in ('received', 'counted', 'damaged', 'correction')
  );

revoke insert, update, delete on public.stock_levels from authenticated;
grant update (track, low_stock_at) on public.stock_levels to authenticated;
```

- [ ] **Step 4: Update the access test for the new stock rules** — `supabase/tests/access.test.sql`

Replace the fixture insert at lines 45–47 (stock rows now come from the variant trigger):

```sql
update public.stock_levels set quantity = 10
where variant_id = '00000000-0000-0000-0000-0000000000f3' and store_id = '00000000-0000-0000-0000-0000000000b1';
update public.stock_levels set quantity = 5
where variant_id = '00000000-0000-0000-0000-0000000000f3' and store_id = '00000000-0000-0000-0000-0000000000b2';
```

Replace the two stock assertions at lines 103–104 (the count column is no longer writable, so test the columns that are):

```sql
with u as (update public.stock_levels set low_stock_at = 9 where store_id = '00000000-0000-0000-0000-0000000000b1' returning 1) select is(count(*), 1::bigint, 'manager can adjust stock settings in their store') from u;
with u as (update public.stock_levels set low_stock_at = 9 where store_id = '00000000-0000-0000-0000-0000000000b2' returning 1) select is(count(*), 0::bigint, 'manager cannot adjust stock settings in another store') from u;
```

- [ ] **Step 4b: Add the new table to the schema test** — `supabase/tests/schema.test.sql`

In the `tables_are('public', array[...])` call, add `'stock_movements'` after `'stock_levels'`. The test asserts the exact set of tables, so it fails without this.

- [ ] **Step 5: Seed stock through history** — `supabase/seed.sql`

Replace the `insert into public.stock_levels …` statement at lines 114–116 with:

```sql
insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
select s.id, v.id, (abs(hashtext(v.sku || s.name)) % 40) + 3, 'received',
  (select id from public.staff where role = 'owner' order by created_at limit 1), 'Opening stock'
from public.product_variants v cross join public.stores s;
```

- [ ] **Step 6: Apply and run**

```bash
npx supabase db reset && npm run test:db
docker exec supabase_db_pos psql -U postgres -tAc "select (select count(*) from public.stock_levels), (select count(*) from public.stock_movements), (select count(*) from public.stock_levels sl where sl.quantity <> (select coalesce(sum(quantity_change),0) from public.stock_movements m where m.store_id = sl.store_id and m.variant_id = sl.variant_id))"
npm run db:types && npx prettier --write lib/supabase/database.types.ts
```

Expected: all test files `ok` (inventory 16/16), then `72|72|0`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add stock history with exact per-store counts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Stock count and transfer functions

Load the `supabase` and `supabase-postgres-best-practices` skills first.

**Files:**
- Create: `supabase/migrations/20261014000007_stock_functions.sql`, `supabase/tests/stock_functions.test.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces:
  - `public.record_stock_count(p_store_id uuid, p_variant_id uuid, p_counted integer, p_note text default null) returns integer`. Errors: P0002 when the stock row isn't found or isn't writable; 22023 for a negative count.
  - `public.transfer_stock(p_from uuid, p_to uuid, p_variant_id uuid, p_quantity integer, p_note text default null) returns uuid` (the transfer id). Errors: 42501 for not allowed; 22023 for invalid input; P0002 for an unknown variant.

- [ ] **Step 1: Write the failing test** — `supabase/tests/stock_functions.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'sf-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'sf-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'sf-cashier@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD'),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD');
insert into public.staff (id, user_id, name, email, role) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'sf-owner@test', 'owner'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'sf-manager@test', 'manager'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'sf-cashier@test', 'cashier');
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1');
insert into public.tax_classes (name, is_default) values ('Standard', true);
insert into public.products (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Tea');
insert into public.product_variants (id, product_id, sku, price) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'TEA', 300);
insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 10, 'received', '00000000-0000-0000-0000-0000000000c1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(public.record_stock_count('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 7, 'Shelf count'), 7, 'a count returns the new quantity');
select is((select quantity_change from public.stock_movements where reason = 'counted'), -3, 'a count records the difference');
select lives_ok($$select public.record_stock_count('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 7)$$, 'an unchanged count is accepted');
select is((select count(*) from public.stock_movements where reason = 'counted'), 1::bigint, 'an unchanged count writes nothing');
select throws_ok($$select public.record_stock_count('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', -1)$$, '22023', null, 'a negative count is rejected');
select throws_ok($$select public.record_stock_count('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f2', 4)$$, 'P0002', null, 'a manager cannot count another store');
select throws_ok(
  $$select public.transfer_stock('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f2', 2)$$,
  '42501', null, 'a manager cannot transfer to a store they do not manage'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.record_stock_count('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 1)$$, 'P0002', null, 'a cashier cannot count stock');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$select public.transfer_stock('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f2', 4, 'Restock kiosk')$$,
  'an owner transfers between stores'
);
select is(
  (select array_agg(quantity order by store_id) from public.stock_levels where variant_id = '00000000-0000-0000-0000-0000000000f2' and store_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')),
  array[3, 4],
  'the transfer moves stock between the two stores'
);
select is((select count(distinct transfer_id) from public.stock_movements where transfer_id is not null), 1::bigint, 'both halves share one transfer id');
select throws_ok(
  $$select public.transfer_stock('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 1)$$,
  '22023', null, 'a transfer needs two different stores'
);
select throws_ok(
  $$select public.transfer_stock('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f2', 0)$$,
  '22023', null, 'a transfer needs a positive quantity'
);

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:db`
Expected: `stock_functions.test.sql` fails (the `record_stock_count` function does not exist).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261014000007_stock_functions.sql`

```sql
create function public.record_stock_count(
  p_store_id uuid,
  p_variant_id uuid,
  p_counted integer,
  p_note text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current integer;
begin
  if p_counted is null or p_counted < 0 then
    raise exception 'count must be zero or more' using errcode = '22023';
  end if;

  select quantity into v_current
  from public.stock_levels
  where store_id = p_store_id and variant_id = p_variant_id
  for update;

  if not found then
    raise exception 'stock row not found' using errcode = 'P0002';
  end if;

  if p_counted <> v_current then
    insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
    values (p_store_id, p_variant_id, p_counted - v_current, 'counted', (select private.staff_id()), p_note);
  end if;

  return p_counted;
end;
$$;

revoke execute on function public.record_stock_count(uuid, uuid, integer, text) from public, anon;
grant execute on function public.record_stock_count(uuid, uuid, integer, text) to authenticated;

create function public.transfer_stock(
  p_from uuid,
  p_to uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_role public.staff_role;
  v_transfer_id uuid := gen_random_uuid();
begin
  select s.id, s.role into v_staff_id, v_role
  from public.staff s
  where s.user_id = (select auth.uid()) and s.active;

  if v_staff_id is null or v_role not in ('owner', 'manager') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'choose two different stores' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be more than zero' using errcode = '22023';
  end if;
  if not private.can_access_store(p_from) or not private.can_access_store(p_to) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.product_variants where id = p_variant_id) then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;

  perform 1 from public.stock_levels
  where variant_id = p_variant_id and store_id in (p_from, p_to)
  order by store_id
  for update;

  insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note, transfer_id)
  values
    (p_from, p_variant_id, -p_quantity, 'transfer_out', v_staff_id, p_note, v_transfer_id),
    (p_to, p_variant_id, p_quantity, 'transfer_in', v_staff_id, p_note, v_transfer_id);

  return v_transfer_id;
end;
$$;

revoke execute on function public.transfer_stock(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.transfer_stock(uuid, uuid, uuid, integer, text) to authenticated;
```

- [ ] **Step 4: Apply, run and regenerate types**

```bash
npx supabase db reset && npm run test:db && npm run db:types && npx prettier --write lib/supabase/database.types.ts
```

Expected: all files `ok`, with stock_functions 13/13.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add stock count and transfer functions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Save-product and catalog-import functions

Load the `supabase` and `supabase-postgres-best-practices` skills first.

**Files:**
- Create: `supabase/migrations/20261014000008_catalog_functions.sql`, `supabase/tests/catalog_functions.test.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `public.record_stock_count` (Task 2).
- Produces:
  - `public.save_product(p_store_id uuid, p_product jsonb, p_variants jsonb) returns uuid`. `p_product` is `{ id?: uuid, name, category_id?: uuid|null, tax_class_id: uuid, description?: string|null, active: boolean }`. `p_variants` is an array of `{ id?: uuid, name, sku, barcode?: string|null, price: int, cost?: int|null, track: boolean, active: boolean, sort_order: int }`. Errors: P0002 for a missing product or variant id.
  - `public.import_catalog(p_store_id uuid, p_rows jsonb) returns integer` (rows applied). Each row is `{ product, category?: string|null, variant, sku, barcode?: string|null, price: int, cost?: int|null, tax_class_id: uuid, track?: boolean|null, stock?: int|null }`.

- [ ] **Step 1: Write the failing test** — `supabase/tests/catalog_functions.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'cf-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'cf-cashier@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency) values ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD');
insert into public.staff (id, user_id, name, email, role) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'cf-manager@test', 'manager'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'cf-cashier@test', 'cashier');
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1');
insert into public.tax_classes (id, name, is_default) values ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$select public.save_product(
    '00000000-0000-0000-0000-0000000000b1',
    '{"name":"Latte","tax_class_id":"00000000-0000-0000-0000-0000000000e1","active":true}',
    '[{"name":"Small","sku":"LAT-S","price":420,"track":false,"active":true,"sort_order":0},{"name":"Large","sku":"LAT-L","barcode":"111","price":520,"cost":140,"track":true,"active":true,"sort_order":1}]'
  )$$,
  'a manager saves a new product with two variants'
);
select is((select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.name = 'Latte'), 2::bigint, 'both variants exist');
select is((select track from public.stock_levels sl join public.product_variants v on v.id = sl.variant_id where v.sku = 'LAT-S'), false, 'tracking is set for the store');
select throws_ok(
  $$select public.save_product(
    '00000000-0000-0000-0000-0000000000b1',
    '{"name":"Mocha","tax_class_id":"00000000-0000-0000-0000-0000000000e1","active":true}',
    '[{"name":"Default","sku":"MOC","price":450,"track":true,"active":true,"sort_order":0},{"name":"Dup","sku":"LAT-S","price":1,"track":true,"active":true,"sort_order":1}]'
  )$$,
  '23505', null, 'a duplicate SKU fails the whole save'
);
select is((select count(*) from public.products where name = 'Mocha'), 0::bigint, 'nothing from the failed save remains');
select throws_ok(
  $$select public.save_product(
    '00000000-0000-0000-0000-0000000000b1',
    '{"id":"00000000-0000-0000-0000-00000000dead","name":"Ghost","tax_class_id":"00000000-0000-0000-0000-0000000000e1","active":true}',
    '[]'
  )$$,
  'P0002', null, 'saving a product that no longer exists fails'
);

select is(
  public.import_catalog('00000000-0000-0000-0000-0000000000b1', '[
    {"product":"Latte","category":"Coffee","variant":"Small","sku":"LAT-S","price":450,"tax_class_id":"00000000-0000-0000-0000-0000000000e1"},
    {"product":"Croissant","category":"Bakery","variant":"Default","sku":"CRO","price":350,"tax_class_id":"00000000-0000-0000-0000-0000000000e1","stock":12},
    {"product":"Croissant","category":"Bakery","variant":"Almond","sku":"CRO-A","price":400,"tax_class_id":"00000000-0000-0000-0000-0000000000e1","track":false}
  ]'::jsonb),
  3,
  'an import applies every row'
);
select is((select price from public.product_variants where sku = 'LAT-S'), 450::bigint, 'an existing SKU is updated');
select is((select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.name = 'Croissant'), 2::bigint, 'rows with one product name become one product');
select is((select count(*) from public.categories where name in ('Coffee', 'Bakery')), 2::bigint, 'missing categories are created');
select is((select quantity from public.stock_levels sl join public.product_variants v on v.id = sl.variant_id where v.sku = 'CRO'), 12, 'a stock value becomes a count');
select throws_ok(
  $$select public.import_catalog('00000000-0000-0000-0000-0000000000b1', '[
    {"product":"Bagel","variant":"Default","sku":"BAG","price":300,"tax_class_id":"00000000-0000-0000-0000-0000000000e1"},
    {"product":"Bagel","variant":"Seeded","sku":"BAG","price":320,"tax_class_id":"00000000-0000-0000-0000-0000000000e1"}
  ]'::jsonb)$$,
  '23505', null, 'a failing row fails the whole import'
);
select is((select count(*) from public.products where name = 'Bagel'), 0::bigint, 'nothing from the failed import remains');

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:db`
Expected: `catalog_functions.test.sql` fails (the `save_product` function does not exist).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261014000008_catalog_functions.sql`

```sql
create function public.save_product(p_store_id uuid, p_product jsonb, p_variants jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid := nullif(p_product->>'id', '')::uuid;
  v_variant jsonb;
  v_variant_id uuid;
begin
  if v_product_id is null then
    insert into public.products (name, category_id, tax_class_id, description, active)
    values (
      p_product->>'name',
      nullif(p_product->>'category_id', '')::uuid,
      (p_product->>'tax_class_id')::uuid,
      nullif(p_product->>'description', ''),
      coalesce((p_product->>'active')::boolean, true)
    )
    returning id into v_product_id;
  else
    update public.products set
      name = p_product->>'name',
      category_id = nullif(p_product->>'category_id', '')::uuid,
      tax_class_id = (p_product->>'tax_class_id')::uuid,
      description = nullif(p_product->>'description', ''),
      active = coalesce((p_product->>'active')::boolean, true)
    where id = v_product_id;
    if not found then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
  end if;

  for v_variant in select * from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) loop
    v_variant_id := nullif(v_variant->>'id', '')::uuid;
    if v_variant_id is null then
      insert into public.product_variants (product_id, name, sku, barcode, price, cost, active, sort_order)
      values (
        v_product_id,
        v_variant->>'name',
        v_variant->>'sku',
        nullif(v_variant->>'barcode', ''),
        (v_variant->>'price')::bigint,
        nullif(v_variant->>'cost', '')::bigint,
        coalesce((v_variant->>'active')::boolean, true),
        coalesce((v_variant->>'sort_order')::integer, 0)
      )
      returning id into v_variant_id;
    else
      update public.product_variants set
        name = v_variant->>'name',
        sku = v_variant->>'sku',
        barcode = nullif(v_variant->>'barcode', ''),
        price = (v_variant->>'price')::bigint,
        cost = nullif(v_variant->>'cost', '')::bigint,
        active = coalesce((v_variant->>'active')::boolean, true),
        sort_order = coalesce((v_variant->>'sort_order')::integer, 0)
      where id = v_variant_id and product_id = v_product_id;
      if not found then
        raise exception 'variant not found' using errcode = 'P0002';
      end if;
    end if;

    if v_variant ? 'track' then
      update public.stock_levels set track = (v_variant->>'track')::boolean
      where variant_id = v_variant_id and store_id = p_store_id;
    end if;
  end loop;

  return v_product_id;
end;
$$;

revoke execute on function public.save_product(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_product(uuid, jsonb, jsonb) to authenticated;

create function public.import_catalog(p_store_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_category_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_count integer := 0;
begin
  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_category_id := null;
    if coalesce(trim(v_row->>'category'), '') <> '' then
      select id into v_category_id from public.categories where lower(name) = lower(trim(v_row->>'category'));
      if v_category_id is null then
        insert into public.categories (name) values (trim(v_row->>'category')) returning id into v_category_id;
      end if;
    end if;

    select v.id, v.product_id into v_variant_id, v_product_id
    from public.product_variants v where v.sku = v_row->>'sku';

    if v_variant_id is not null then
      update public.products set
        name = v_row->>'product',
        category_id = v_category_id,
        tax_class_id = (v_row->>'tax_class_id')::uuid
      where id = v_product_id;
      update public.product_variants set
        name = v_row->>'variant',
        barcode = nullif(v_row->>'barcode', ''),
        price = (v_row->>'price')::bigint,
        cost = nullif(v_row->>'cost', '')::bigint
      where id = v_variant_id;
    else
      select id into v_product_id from public.products
      where lower(name) = lower(v_row->>'product') and active
      order by created_at limit 1;
      if v_product_id is null then
        insert into public.products (name, category_id, tax_class_id)
        values (v_row->>'product', v_category_id, (v_row->>'tax_class_id')::uuid)
        returning id into v_product_id;
      end if;
      insert into public.product_variants (product_id, name, sku, barcode, price, cost, sort_order)
      values (
        v_product_id,
        v_row->>'variant',
        v_row->>'sku',
        nullif(v_row->>'barcode', ''),
        (v_row->>'price')::bigint,
        nullif(v_row->>'cost', '')::bigint,
        (select coalesce(max(sort_order) + 1, 0) from public.product_variants where product_id = v_product_id)
      )
      returning id into v_variant_id;
    end if;

    if v_row->>'track' is not null then
      update public.stock_levels set track = (v_row->>'track')::boolean
      where variant_id = v_variant_id and store_id = p_store_id;
    end if;
    if v_row->>'stock' is not null then
      perform public.record_stock_count(p_store_id, v_variant_id, (v_row->>'stock')::integer, 'CSV import');
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.import_catalog(uuid, jsonb) from public, anon;
grant execute on function public.import_catalog(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Apply, run and regenerate types**

```bash
npx supabase db reset && npm run test:db && npm run db:types && npx prettier --write lib/supabase/database.types.ts
```

Expected: all files `ok`, with catalog_functions 13/13.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add atomic product save and catalog import functions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: CSV parsing and writing

**Files:**
- Create: `lib/csv.ts`, `lib/csv.test.ts`

**Interfaces:**
- Produces:
  - `type CsvCell = string | number | boolean | null`
  - `toCsv(rows: CsvCell[][]): string`. Uses CRLF line endings and is safe against formula injection.
  - `class CsvError extends Error`
  - `parseCsv(text: string): { header: string[]; rows: string[][] }`
    - Strips the BOM.
    - Auto-detects `,` or `;` from the header line, outside quotes.
    - Follows RFC 4180 quoting.
    - Skips blank lines.
    - Trims header cells.
    - Throws `CsvError` on an unterminated quote or an empty file.

- [ ] **Step 1: Write the failing test** — `lib/csv.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { CsvError, parseCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes cells that need it", () => {
    expect(toCsv([["a", "b,c", 'say "hi"', "two\nlines"]])).toBe('a,"b,c","say ""hi""","two\nlines"');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-2", "@x"]])).toBe("'=SUM(A1),'+1,'-2,'@x");
  });
  it("writes numbers, booleans and empty cells", () => {
    expect(toCsv([[1250, true, null], ["x", false, ""]])).toBe("1250,true,\r\nx,false,");
  });
});

describe("parseCsv", () => {
  it("parses a simple file", () => {
    expect(parseCsv("sku,price\nA,1.50\nB,2")).toEqual({ header: ["sku", "price"], rows: [["A", "1.50"], ["B", "2"]] });
  });
  it("handles quotes, embedded commas, quotes and newlines", () => {
    expect(parseCsv('name,note\r\n"Tea, green","He said ""hi""\nthen left"\r\n').rows).toEqual([
      ["Tea, green", 'He said "hi"\nthen left'],
    ]);
  });
  it("detects semicolon files and keeps comma decimals intact", () => {
    expect(parseCsv("sku;price\nA;12,50")).toEqual({ header: ["sku", "price"], rows: [["A", "12,50"]] });
  });
  it("strips a BOM, trims headers and skips blank lines", () => {
    expect(parseCsv("﻿ sku , price \n\nA,1\n\n")).toEqual({ header: ["sku", "price"], rows: [["A", "1"]] });
  });
  it("keeps empty trailing cells", () => {
    expect(parseCsv("a,b,c\n1,,\n").rows).toEqual([["1", "", ""]]);
  });
  it("round-trips what toCsv writes", () => {
    const rows = [["product", "note"], ["Tea, green", 'a "b"'], ["=x", "line\nbreak"]];
    expect(parseCsv(toCsv(rows)).rows).toEqual([["Tea, green", 'a "b"'], ["'=x", "line\nbreak"]]);
  });
  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,b\n"oops,1')).toThrow(CsvError);
  });
  it("rejects an empty file", () => {
    expect(() => parseCsv("\n\n")).toThrow(CsvError);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/csv.test.ts`
Expected: FAIL (cannot resolve `./csv`).

- [ ] **Step 3: Implement** — `lib/csv.ts`

```ts
export type CsvCell = string | number | boolean | null;

export class CsvError extends Error {}

function escapeCell(cell: CsvCell): string {
  if (cell === null) return "";
  let value = String(cell);
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  if (/[",\r\n]/.test(value)) value = `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

function detectDelimiter(text: string): string {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char === ",") commas += 1;
    else if (!quoted && char === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

export function parseCsv(input: string): { header: string[]; rows: string[][] } {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 2;
        continue;
      }
      if (char === '"') {
        quoted = false;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      record.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      cell += char;
    }
    index += 1;
  }

  if (quoted) throw new CsvError("A quoted cell is never closed.");
  if (cell !== "" || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  const nonEmpty = records.filter((row) => row.some((value) => value.trim() !== ""));
  if (nonEmpty.length === 0) throw new CsvError("The file is empty.");
  const [header, ...rows] = nonEmpty;
  return { header: header.map((value) => value.trim()), rows };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/csv.test.ts && npm run lint`
Expected: PASS (11 tests), and lint is clean.

- [ ] **Step 5: Commit**

```bash
git add lib/csv.ts lib/csv.test.ts
git commit -m "Add CSV parsing and formula-safe writing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Import validation

**Files:**
- Create: `lib/catalog/import.ts`, `lib/catalog/import.test.ts`

**Interfaces:**
- Consumes: `parseMoney` (`lib/money.ts`).
- Produces:
  - `IMPORT_COLUMNS = ["product","category","variant","sku","barcode","price","cost","tax_class","track","stock"] as const`
  - `MAX_IMPORT_ROWS = 5000`
  - `type ImportContext`:
    ```ts
    {
      currency: string;
      defaultTaxClassId: string;
      taxClasses: { id: string; name: string }[];
      categories: { name: string }[];
      products: { name: string; active: boolean }[];
      variants: {
        sku: string;
        name: string;
        barcode: string | null;
        price: number;
        cost: number | null;
        track: boolean;
        productName: string;
        categoryName: string | null;
        taxClassId: string;
      }[];
    }
    ```
  - `type ImportRowStatus = "new" | "update" | "unchanged" | "error"`
  - `type ResolvedRow` (matches `import_catalog`'s row shape):
    ```ts
    {
      product: string;
      category: string | null;
      variant: string;
      sku: string;
      barcode: string | null;
      price: number;
      cost: number | null;
      tax_class_id: string;
      track: boolean | null;
      stock: number | null;
    }
    ```
  - `type ImportPreview`:
    ```ts
    {
      fileError: string | null;
      rows: { line: number; sku: string; product: string; status: ImportRowStatus; errors: string[] }[];
      summary: Record<ImportRowStatus, number>;
      newCategories: string[];
      apply: ResolvedRow[];
    }
    ```
  - `validateImport(header: string[], rows: string[][], ctx: ImportContext): ImportPreview`

- [ ] **Step 1: Write the failing test** — `lib/catalog/import.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { validateImport, type ImportContext } from "./import";

const ctx: ImportContext = {
  currency: "EUR",
  defaultTaxClassId: "t-std",
  taxClasses: [
    { id: "t-std", name: "Standard" },
    { id: "t-ex", name: "Exempt" },
  ],
  categories: [{ name: "Coffee" }],
  products: [
    { name: "Latte", active: true },
    { name: "Old Muffin", active: false },
  ],
  variants: [
    { sku: "LAT-S", name: "Small", barcode: "111", price: 420, cost: 110, track: true, productName: "Latte", categoryName: "Coffee", taxClassId: "t-std" },
  ],
};

const header = ["product", "category", "variant", "sku", "barcode", "price", "cost", "tax_class", "track", "stock"];

describe("validateImport", () => {
  it("classifies new, updated and unchanged rows", () => {
    const preview = validateImport(header, [
      ["Latte", "Coffee", "Small", "LAT-S", "111", "4,20", "1,10", "Standard", "yes", ""],
      ["Latte", "Coffee", "Large", "LAT-L", "", "5,20", "", "", "", "8"],
      ["Croissant", "Bakery", "", "CRO", "", "3,50", "", "", "", ""],
    ], ctx);
    expect(preview.fileError).toBeNull();
    expect(preview.rows.map((row) => row.status)).toEqual(["unchanged", "new", "new"]);
    expect(preview.summary).toEqual({ new: 2, update: 0, unchanged: 1, error: 0 });
    expect(preview.newCategories).toEqual(["Bakery"]);
    expect(preview.apply).toHaveLength(2);
    expect(preview.apply[0]).toMatchObject({ sku: "LAT-L", price: 520, stock: 8, tax_class_id: "t-std" });
    expect(preview.apply[1]).toMatchObject({ sku: "CRO", variant: "Default", price: 350 });
  });

  it("marks a changed price as an update", () => {
    const preview = validateImport(header, [["Latte", "Coffee", "Small", "LAT-S", "111", "4,50", "1,10", "Standard", "yes", ""]], ctx);
    expect(preview.rows[0].status).toBe("update");
    expect(preview.apply[0].price).toBe(450);
  });

  it("reports each kind of row error", () => {
    const preview = validateImport(header, [
      ["", "", "", "NOPROD", "", "1", "", "", "", ""],
      ["Tea", "", "", "", "", "1", "", "", "", ""],
      ["Tea", "", "", "T1", "", "abc", "", "", "", ""],
      ["Tea", "", "", "T2", "", "1", "", "Luxury", "", ""],
      ["Tea", "", "", "T3", "111", "1", "", "", "", ""],
      ["Tea", "", "", "T4", "", "1", "", "", "maybe", "-2"],
      ["Old Muffin", "", "", "OM1", "", "1", "", "", "", ""],
    ], ctx);
    expect(preview.rows.map((row) => row.errors)).toEqual([
      ["Product name is required"],
      ["SKU is required"],
      ["Price must be an amount like 4.50"],
      ["Unknown tax class \"Luxury\""],
      ["Barcode 111 is already used by LAT-S"],
      ["Track must be yes or no", "Stock must be a whole number of 0 or more"],
      ["Product \"Old Muffin\" is archived — restore it first"],
    ]);
    expect(preview.summary.error).toBe(7);
    expect(preview.apply).toEqual([]);
  });

  it("flags duplicate SKUs and barcodes within the file", () => {
    const preview = validateImport(header, [
      ["Bagel", "", "", "BAG", "900", "3", "", "", "", ""],
      ["Bagel", "", "Seeded", "BAG", "900", "3", "", "", "", ""],
    ], ctx);
    expect(preview.rows[1].errors).toEqual(["SKU BAG appears more than once in the file", "Barcode 900 appears more than once in the file"]);
  });

  it("flags rows of one product that disagree on category", () => {
    const preview = validateImport(header, [
      ["Bagel", "Bakery", "", "B1", "", "3", "", "", "", ""],
      ["bagel", "Snacks", "Seeded", "B2", "", "3", "", "", "", ""],
    ], ctx);
    expect(preview.rows.map((row) => row.errors)).toEqual([
      ["Rows for \"Bagel\" disagree on category"],
      ["Rows for \"Bagel\" disagree on category"],
    ]);
  });

  it("rejects a file without the required columns", () => {
    expect(validateImport(["name", "cost"], [["x", "1"]], ctx).fileError).toBe("Missing columns: product, sku, price");
  });

  it("rejects a file that is too long", () => {
    const rows = Array.from({ length: 5001 }, (_, index) => ["P", "", "", `S${index}`, "", "1", "", "", "", ""]);
    expect(validateImport(header, rows, ctx).fileError).toBe("The file has 5001 rows. Import at most 5000 at a time.");
  });

  it("matches headers case-insensitively and accepts missing optional columns", () => {
    const preview = validateImport(["Product", "SKU", "Price"], [["Scone", "SC", "2"]], ctx);
    expect(preview.apply[0]).toMatchObject({ product: "Scone", variant: "Default", sku: "SC", price: 200, track: null, stock: null, category: null });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/catalog/import.test.ts`
Expected: FAIL (cannot resolve `./import`).

- [ ] **Step 3: Implement** — `lib/catalog/import.ts`

```ts
import { parseMoney } from "@/lib/money";

export const IMPORT_COLUMNS = ["product", "category", "variant", "sku", "barcode", "price", "cost", "tax_class", "track", "stock"] as const;
export const MAX_IMPORT_ROWS = 5000;

type Column = (typeof IMPORT_COLUMNS)[number];

export type ImportContext = {
  currency: string;
  defaultTaxClassId: string;
  taxClasses: { id: string; name: string }[];
  categories: { name: string }[];
  products: { name: string; active: boolean }[];
  variants: {
    sku: string;
    name: string;
    barcode: string | null;
    price: number;
    cost: number | null;
    track: boolean;
    productName: string;
    categoryName: string | null;
    taxClassId: string;
  }[];
};

export type ImportRowStatus = "new" | "update" | "unchanged" | "error";

export type ResolvedRow = {
  product: string;
  category: string | null;
  variant: string;
  sku: string;
  barcode: string | null;
  price: number;
  cost: number | null;
  tax_class_id: string;
  track: boolean | null;
  stock: number | null;
};

export type ImportPreview = {
  fileError: string | null;
  rows: { line: number; sku: string; product: string; status: ImportRowStatus; errors: string[] }[];
  summary: Record<ImportRowStatus, number>;
  newCategories: string[];
  apply: ResolvedRow[];
};

const REQUIRED: Column[] = ["product", "sku", "price"];
const TRUE_VALUES = ["yes", "true", "1", "y"];
const FALSE_VALUES = ["no", "false", "0", "n"];

function emptyPreview(fileError: string): ImportPreview {
  return { fileError, rows: [], summary: { new: 0, update: 0, unchanged: 0, error: 0 }, newCategories: [], apply: [] };
}

function parseTrack(value: string): boolean | null | undefined {
  if (value === "") return null;
  const lower = value.toLowerCase();
  if (TRUE_VALUES.includes(lower)) return true;
  if (FALSE_VALUES.includes(lower)) return false;
  return undefined;
}

export function validateImport(header: string[], rows: string[][], ctx: ImportContext): ImportPreview {
  const indexOf = new Map<string, number>();
  header.forEach((name, index) => indexOf.set(name.trim().toLowerCase(), index));
  const missing = REQUIRED.filter((column) => !indexOf.has(column));
  if (missing.length > 0) return emptyPreview(`Missing columns: ${missing.join(", ")}`);
  if (rows.length > MAX_IMPORT_ROWS) return emptyPreview(`The file has ${rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`);

  const cell = (row: string[], column: Column) => {
    const index = indexOf.get(column);
    return index === undefined ? "" : (row[index] ?? "").trim();
  };

  const variantsBySku = new Map(ctx.variants.map((variant) => [variant.sku, variant]));
  const skuByBarcode = new Map(ctx.variants.filter((variant) => variant.barcode).map((variant) => [variant.barcode as string, variant.sku]));
  const taxByName = new Map(ctx.taxClasses.map((taxClass) => [taxClass.name.toLowerCase(), taxClass.id]));
  const activeProducts = new Set(ctx.products.filter((product) => product.active).map((product) => product.name.toLowerCase()));
  const archivedProducts = new Set(ctx.products.filter((product) => !product.active).map((product) => product.name.toLowerCase()));
  const knownCategories = new Set(ctx.categories.map((category) => category.name.toLowerCase()));

  const skuCounts = new Map<string, number>();
  const barcodeCounts = new Map<string, number>();
  for (const row of rows) {
    const sku = cell(row, "sku");
    const barcode = cell(row, "barcode");
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    if (barcode) barcodeCounts.set(barcode, (barcodeCounts.get(barcode) ?? 0) + 1);
  }

  const groupName = new Map<string, string>();
  const groupCategory = new Map<string, Set<string>>();
  const groupTax = new Map<string, Set<string>>();
  for (const row of rows) {
    const product = cell(row, "product");
    const key = product.toLowerCase();
    if (!key) continue;
    if (!groupName.has(key)) groupName.set(key, product);
    if (!groupCategory.has(key)) groupCategory.set(key, new Set());
    if (!groupTax.has(key)) groupTax.set(key, new Set());
    groupCategory.get(key)!.add(cell(row, "category").toLowerCase());
    const taxName = cell(row, "tax_class");
    const taxId = taxName === "" ? ctx.defaultTaxClassId : taxByName.get(taxName.toLowerCase());
    if (taxId) groupTax.get(key)!.add(taxId);
  }

  const preview: ImportPreview = { fileError: null, rows: [], summary: { new: 0, update: 0, unchanged: 0, error: 0 }, newCategories: [], apply: [] };
  const newCategories = new Map<string, string>();
  const resolved: { row: ResolvedRow; status: ImportRowStatus }[] = [];

  rows.forEach((row, index) => {
    const errors: string[] = [];
    const product = cell(row, "product");
    const sku = cell(row, "sku");
    const barcode = cell(row, "barcode");
    const category = cell(row, "category");
    const taxName = cell(row, "tax_class");
    const productKey = product.toLowerCase();

    if (!product) errors.push("Product name is required");
    if (!sku) errors.push("SKU is required");

    const price = parseMoney(cell(row, "price"), ctx.currency);
    if (price === null || price < 0) errors.push("Price must be an amount like 4.50");

    const costText = cell(row, "cost");
    const cost = costText === "" ? null : parseMoney(costText, ctx.currency);
    if (costText !== "" && (cost === null || cost < 0)) errors.push("Cost must be an amount like 1.20");

    const taxClassId = taxName === "" ? ctx.defaultTaxClassId : taxByName.get(taxName.toLowerCase());
    if (!taxClassId) errors.push(`Unknown tax class "${taxName}"`);

    if (sku && (skuCounts.get(sku) ?? 0) > 1) errors.push(`SKU ${sku} appears more than once in the file`);
    if (barcode && (barcodeCounts.get(barcode) ?? 0) > 1) errors.push(`Barcode ${barcode} appears more than once in the file`);
    const barcodeOwner = barcode ? skuByBarcode.get(barcode) : undefined;
    if (barcodeOwner && barcodeOwner !== sku) errors.push(`Barcode ${barcode} is already used by ${barcodeOwner}`);

    const track = parseTrack(cell(row, "track"));
    if (track === undefined) errors.push("Track must be yes or no");

    const stockText = cell(row, "stock");
    const stock = stockText === "" ? null : /^\d+$/.test(stockText) ? Number(stockText) : undefined;
    if (stock === undefined) errors.push("Stock must be a whole number of 0 or more");

    const existing = sku ? variantsBySku.get(sku) : undefined;
    if (!existing && product && archivedProducts.has(productKey) && !activeProducts.has(productKey)) {
      errors.push(`Product "${product}" is archived — restore it first`);
    }
    const displayName = groupName.get(productKey) ?? product;
    if (product && (groupCategory.get(productKey)?.size ?? 0) > 1) errors.push(`Rows for "${displayName}" disagree on category`);
    if (product && (groupTax.get(productKey)?.size ?? 0) > 1) errors.push(`Rows for "${displayName}" disagree on tax class`);

    if (errors.length > 0) {
      preview.rows.push({ line: index + 2, sku, product, status: "error", errors });
      preview.summary.error += 1;
      return;
    }

    if (category && !knownCategories.has(category.toLowerCase())) newCategories.set(category.toLowerCase(), category);

    const resolvedRow: ResolvedRow = {
      product,
      category: category || null,
      variant: cell(row, "variant") || "Default",
      sku,
      barcode: barcode || null,
      price: price as number,
      cost: cost as number | null,
      tax_class_id: taxClassId as string,
      track: track as boolean | null,
      stock: stock as number | null,
    };

    let status: ImportRowStatus = "new";
    if (existing) {
      const same =
        existing.productName === resolvedRow.product &&
        (existing.categoryName ?? null) === resolvedRow.category &&
        existing.name === resolvedRow.variant &&
        (existing.barcode ?? null) === resolvedRow.barcode &&
        existing.price === resolvedRow.price &&
        (existing.cost ?? null) === resolvedRow.cost &&
        existing.taxClassId === resolvedRow.tax_class_id &&
        (resolvedRow.track === null || resolvedRow.track === existing.track) &&
        resolvedRow.stock === null;
      status = same ? "unchanged" : "update";
    }

    preview.rows.push({ line: index + 2, sku, product, status, errors: [] });
    preview.summary[status] += 1;
    resolved.push({ row: resolvedRow, status });
  });

  if (preview.summary.error === 0) {
    preview.apply = resolved.filter((entry) => entry.status !== "unchanged").map((entry) => entry.row);
  }
  preview.newCategories = [...newCategories.values()];
  return preview;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/catalog/import.test.ts && npm run lint`
Expected: PASS (8 tests), and lint is clean. If the `Old Muffin` row also gains a second error, re-read the archived rule: a new SKU whose name matches only an archived product gets exactly one error.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog
git commit -m "Add CSV import validation with a preview

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Catalog form parsing, error messages and list helpers

**Files:**
- Create: `lib/catalog/product-form.ts`, `lib/catalog/product-form.test.ts`, `lib/catalog/stock-form.ts`, `lib/catalog/stock-form.test.ts`, `lib/catalog/db-errors.ts`, `lib/catalog/db-errors.test.ts`, `lib/catalog/list.ts`, `lib/catalog/list.test.ts`, `lib/catalog/history.ts`, `lib/catalog/history.test.ts`

**Interfaces:**
- Consumes: `parseMoney`, `formatMoney`, `friendlyDbError`.
- Produces:
  - `type ProductFormInput`:
    ```ts
    {
      id?: string;
      name: string;
      categoryId: string;
      taxClassId: string;
      description: string;
      active: boolean;
      variants: {
        id?: string;
        name: string;
        sku: string;
        barcode: string;
        price: string;
        cost: string;
        track: boolean;
        active: boolean;
      }[];
    }
    ```
  - `parseProductForm(input: ProductFormInput, currency: string)`: returns `{ ok: true; product: SaveProductPayload; variants: SaveVariantPayload[] }` or `{ ok: false; fieldErrors: Record<string, string> }`. Field error keys look like `name`, `variants`, `variants.1.sku`, `variants.0.price`.
  - `SaveProductPayload`, `SaveVariantPayload`: the JSON shapes `save_product` expects (Task 3).
  - `type StockAction`:
    ```ts
    | { kind: "received" | "damaged"; variantId: string; quantity: number; note: string | null }
    | { kind: "correction"; variantId: string; change: number; note: string }
    | { kind: "counted"; variantId: string; counted: number; note: string | null }
    | { kind: "transfer"; variantId: string; toStoreId: string; quantity: number; note: string | null }
    ```
  - `parseStockAction(values: Record<string, string>)`: returns `{ ok: true; action: StockAction }` or `{ ok: false; fieldErrors: Record<string, string> }`.
  - `parseStockSettings(values: Record<string, string>)`: returns `{ ok: true; variantId: string; track: boolean; lowStockAt: number | null }` or `{ ok: false; fieldErrors }`.
  - `catalogDbError(error: { code?: string; message?: string } | null): string`
  - `type ProductRow`:
    ```ts
    {
      id: string;
      name: string;
      active: boolean;
      categoryId: string | null;
      categoryName: string | null;
      variantCount: number;
      minPrice: number | null;
      maxPrice: number | null;
      trackedStock: number | null;
      lowStock: boolean;
      search: string;
    }
    ```
  - `toProductRows(data: ProductQueryRow[], storeId: string): ProductRow[]`, where `type ProductQueryRow` matches the Supabase select in Task 7.
  - `type ProductFilters = { q: string; category: string; view: "active" | "low" | "archived"; page: number }`
  - `filterProductRows(rows: ProductRow[], filters: ProductFilters): { rows: ProductRow[]; total: number; pages: number }` (50 per page)
  - `parseProductFilters(params: Record<string, string | string[] | undefined>): ProductFilters`
  - `formatPriceRange(row: ProductRow, currency: string): string`
  - `withRunningQuantity<T extends { quantity_change: number }>(newestFirst: T[], current: number): (T & { resulting: number })[]`

- [ ] **Step 1: Write the failing tests**

`lib/catalog/product-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseProductForm, type ProductFormInput } from "./product-form";

const base: ProductFormInput = {
  name: "Latte",
  categoryId: "",
  taxClassId: "00000000-0000-4000-8000-000000000001",
  description: "",
  active: true,
  variants: [
    { name: "Small", sku: "LAT-S", barcode: "", price: "4,20", cost: "", track: true, active: true },
    { name: "Large", sku: "LAT-L", barcode: "222", price: "5.20", cost: "1.40", track: false, active: true },
  ],
};

describe("parseProductForm", () => {
  it("builds the save payload in minor units with sort order", () => {
    const result = parseProductForm(base, "EUR");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product).toEqual({ name: "Latte", category_id: null, tax_class_id: base.taxClassId, description: null, active: true });
    expect(result.variants).toEqual([
      { name: "Small", sku: "LAT-S", barcode: null, price: 420, cost: null, track: true, active: true, sort_order: 0 },
      { name: "Large", sku: "LAT-L", barcode: "222", price: 520, cost: 140, track: false, active: true, sort_order: 1 },
    ]);
  });

  it("keeps ids for existing records", () => {
    const result = parseProductForm(
      { ...base, id: "00000000-0000-4000-8000-0000000000aa", variants: [{ ...base.variants[0], id: "00000000-0000-4000-8000-0000000000bb" }] },
      "EUR",
    );
    expect(result.ok && result.product.id).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(result.ok && result.variants[0].id).toBe("00000000-0000-4000-8000-0000000000bb");
  });

  it("names the row with a bad price or a duplicate SKU", () => {
    const result = parseProductForm(
      { ...base, variants: [base.variants[0], { ...base.variants[1], sku: "LAT-S", price: "abc" }] },
      "EUR",
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        "variants.1.price": "Enter a price like 4.50",
        "variants.1.sku": "This SKU is already used on another row",
      },
    });
  });

  it("flags duplicate barcodes", () => {
    const result = parseProductForm({ ...base, variants: [{ ...base.variants[0], barcode: "9" }, { ...base.variants[1], barcode: "9" }] }, "EUR");
    expect(result.ok ? null : result.fieldErrors["variants.1.barcode"]).toBe("This barcode is already used on another row");
  });

  it("requires a name and at least one active variant", () => {
    const result = parseProductForm({ ...base, name: " ", variants: [{ ...base.variants[0], active: false }] }, "EUR");
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: "Enter a product name", variants: "Keep at least one active variant" },
    });
  });
});
```

`lib/catalog/stock-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStockAction, parseStockSettings } from "./stock-form";

const variantId = "00000000-0000-4000-8000-000000000001";
const storeId = "00000000-0000-4000-8000-000000000002";

describe("parseStockAction", () => {
  it("parses receive, count, correction and transfer", () => {
    expect(parseStockAction({ kind: "received", variantId, quantity: "10", note: "" })).toEqual({ ok: true, action: { kind: "received", variantId, quantity: 10, note: null } });
    expect(parseStockAction({ kind: "counted", variantId, counted: "0", note: "Year end" })).toEqual({ ok: true, action: { kind: "counted", variantId, counted: 0, note: "Year end" } });
    expect(parseStockAction({ kind: "correction", variantId, change: "-2", note: "Typo" })).toEqual({ ok: true, action: { kind: "correction", variantId, change: -2, note: "Typo" } });
    expect(parseStockAction({ kind: "transfer", variantId, toStoreId: storeId, quantity: "3", note: "" })).toEqual({ ok: true, action: { kind: "transfer", variantId, toStoreId: storeId, quantity: 3, note: null } });
  });

  it("rejects bad quantities and a correction without a reason", () => {
    expect(parseStockAction({ kind: "received", variantId, quantity: "0", note: "" })).toEqual({ ok: false, fieldErrors: { quantity: "Enter a whole number above 0" } });
    expect(parseStockAction({ kind: "damaged", variantId, quantity: "1.5", note: "" })).toEqual({ ok: false, fieldErrors: { quantity: "Enter a whole number above 0" } });
    expect(parseStockAction({ kind: "counted", variantId, counted: "-1", note: "" })).toEqual({ ok: false, fieldErrors: { counted: "Enter a whole number of 0 or more" } });
    expect(parseStockAction({ kind: "correction", variantId, change: "0", note: "" })).toEqual({
      ok: false,
      fieldErrors: { change: "Enter a change like 3 or -2", note: "Say why you're correcting the count" },
    });
  });
});

describe("parseStockSettings", () => {
  it("parses tracking and an optional low-stock level", () => {
    expect(parseStockSettings({ variantId, track: "on", lowStockAt: "5" })).toEqual({ ok: true, variantId, track: true, lowStockAt: 5 });
    expect(parseStockSettings({ variantId, lowStockAt: "" })).toEqual({ ok: true, variantId, track: false, lowStockAt: null });
    expect(parseStockSettings({ variantId, track: "on", lowStockAt: "x" })).toEqual({ ok: false, fieldErrors: { lowStockAt: "Enter a whole number of 0 or more, or leave it empty" } });
  });
});
```

`lib/catalog/db-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { catalogDbError } from "./db-errors";

describe("catalogDbError", () => {
  it("names SKU and barcode clashes", () => {
    expect(catalogDbError({ code: "23505", message: 'duplicate key value violates unique constraint "product_variants_sku_key"' })).toBe("That SKU is already used by another product.");
    expect(catalogDbError({ code: "23505", message: 'duplicate key value violates unique constraint "product_variants_barcode_key"' })).toBe("That barcode is already used by another product.");
    expect(catalogDbError({ code: "23505", message: 'duplicate key value violates unique constraint "categories_name_key"' })).toBe("A category with that name already exists.");
  });
  it("explains missing records and falls back otherwise", () => {
    expect(catalogDbError({ code: "P0002" })).toBe("That item no longer exists. Reload the page and try again.");
    expect(catalogDbError({ code: "42501" })).toBe("You don't have access to this.");
  });
});
```

`lib/catalog/list.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterProductRows, formatPriceRange, parseProductFilters, toProductRows, type ProductQueryRow } from "./list";

const store = "s1";
const data: ProductQueryRow[] = [
  {
    id: "p1", name: "Latte", active: true, category: { id: "c1", name: "Coffee" },
    product_variants: [
      { id: "v1", name: "Small", sku: "LAT-S", barcode: "111", price: 420, active: true, stock_levels: [{ store_id: "s1", quantity: 3, track: true, low_stock_at: 5 }] },
      { id: "v2", name: "Large", sku: "LAT-L", barcode: null, price: 520, active: true, stock_levels: [{ store_id: "s1", quantity: 10, track: true, low_stock_at: null }] },
    ],
  },
  {
    id: "p2", name: "Espresso", active: true, category: null,
    product_variants: [{ id: "v3", name: "Default", sku: "ESP", barcode: null, price: 300, active: true, stock_levels: [{ store_id: "s1", quantity: 0, track: false, low_stock_at: null }] }],
  },
  { id: "p3", name: "Old Muffin", active: false, category: null, product_variants: [] },
];

describe("toProductRows", () => {
  it("summarises variants, prices and tracked stock for the store", () => {
    const rows = toProductRows(data, store);
    expect(rows[0]).toMatchObject({ variantCount: 2, minPrice: 420, maxPrice: 520, trackedStock: 13, lowStock: true, categoryName: "Coffee" });
    expect(rows[1]).toMatchObject({ trackedStock: null, lowStock: false });
  });
});

describe("filterProductRows", () => {
  const rows = toProductRows(data, store);
  it("hides archived products by default", () => {
    expect(filterProductRows(rows, parseProductFilters({})).rows.map((row) => row.id)).toEqual(["p2", "p1"]);
  });
  it("searches name, SKU and barcode", () => {
    expect(filterProductRows(rows, parseProductFilters({ q: "111" })).rows.map((row) => row.id)).toEqual(["p1"]);
    expect(filterProductRows(rows, parseProductFilters({ q: "esp" })).rows.map((row) => row.id)).toEqual(["p2"]);
  });
  it("filters low stock, archived and category", () => {
    expect(filterProductRows(rows, parseProductFilters({ view: "low" })).rows.map((row) => row.id)).toEqual(["p1"]);
    expect(filterProductRows(rows, parseProductFilters({ view: "archived" })).rows.map((row) => row.id)).toEqual(["p3"]);
    expect(filterProductRows(rows, parseProductFilters({ category: "c1" })).rows.map((row) => row.id)).toEqual(["p1"]);
  });
  it("paginates 50 per page and clamps bad pages", () => {
    const many = Array.from({ length: 120 }, (_, index) => ({ ...rows[1], id: `x${index}`, name: `Item ${String(index).padStart(3, "0")}` }));
    const page3 = filterProductRows(many, parseProductFilters({ page: "3" }));
    expect(page3).toMatchObject({ total: 120, pages: 3 });
    expect(page3.rows).toHaveLength(20);
    expect(filterProductRows(many, parseProductFilters({ page: "99" })).rows).toHaveLength(20);
    expect(parseProductFilters({ page: "abc", view: "weird" })).toEqual({ q: "", category: "", view: "active", page: 1 });
  });
});

describe("formatPriceRange", () => {
  it("shows one price or a range", () => {
    const rows = toProductRows(data, store);
    expect(formatPriceRange(rows[0], "USD")).toBe("$4.20 – $5.20");
    expect(formatPriceRange(rows[1], "USD")).toBe("$3.00");
    expect(formatPriceRange(rows[2], "USD")).toBe("—");
  });
});
```

`lib/catalog/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { withRunningQuantity } from "./history";

describe("withRunningQuantity", () => {
  it("works out the quantity after each movement, newest first", () => {
    expect(withRunningQuantity([{ quantity_change: -3 }, { quantity_change: 10 }], 7)).toEqual([
      { quantity_change: -3, resulting: 7 },
      { quantity_change: 10, resulting: 10 },
    ]);
  });
  it("handles an empty history", () => {
    expect(withRunningQuantity([], 4)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run lib/catalog`
Expected: FAIL (cannot resolve the new modules; `import.test.ts` still passes).

- [ ] **Step 3: Implement**

`lib/catalog/product-form.ts`:

```ts
import { parseMoney } from "@/lib/money";

export type ProductFormInput = {
  id?: string;
  name: string;
  categoryId: string;
  taxClassId: string;
  description: string;
  active: boolean;
  variants: {
    id?: string;
    name: string;
    sku: string;
    barcode: string;
    price: string;
    cost: string;
    track: boolean;
    active: boolean;
  }[];
};

export type SaveProductPayload = {
  id?: string;
  name: string;
  category_id: string | null;
  tax_class_id: string;
  description: string | null;
  active: boolean;
};

export type SaveVariantPayload = {
  id?: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  cost: number | null;
  track: boolean;
  active: boolean;
  sort_order: number;
};

type ParseResult =
  | { ok: true; product: SaveProductPayload; variants: SaveVariantPayload[] }
  | { ok: false; fieldErrors: Record<string, string> };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseProductForm(input: ProductFormInput, currency: string): ParseResult {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name) errors.name = "Enter a product name";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters";
  if (!GUID.test(input.taxClassId)) errors.taxClassId = "Pick a tax class";
  if (input.categoryId && !GUID.test(input.categoryId)) errors.categoryId = "Pick a category";
  if (input.variants.filter((variant) => variant.active).length === 0) errors.variants = "Keep at least one active variant";

  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();
  const variants: SaveVariantPayload[] = [];

  input.variants.forEach((variant, index) => {
    const key = (field: string) => `variants.${index}.${field}`;
    const variantName = variant.name.trim() || "Default";
    const sku = variant.sku.trim();
    const barcode = variant.barcode.trim();
    if (variantName.length > 60) errors[key("name")] = "Keep the variant name under 60 characters";
    if (!sku) errors[key("sku")] = "Enter a SKU";
    else if (seenSku.has(sku.toLowerCase())) errors[key("sku")] = "This SKU is already used on another row";
    if (barcode && seenBarcode.has(barcode)) errors[key("barcode")] = "This barcode is already used on another row";
    if (sku) seenSku.add(sku.toLowerCase());
    if (barcode) seenBarcode.add(barcode);

    const price = parseMoney(variant.price, currency);
    if (price === null || price < 0) errors[key("price")] = "Enter a price like 4.50";
    const cost = variant.cost.trim() === "" ? null : parseMoney(variant.cost, currency);
    if (variant.cost.trim() !== "" && (cost === null || cost < 0)) errors[key("cost")] = "Enter a cost like 1.20, or leave it empty";

    variants.push({
      ...(variant.id ? { id: variant.id } : {}),
      name: variantName,
      sku,
      barcode: barcode || null,
      price: price ?? 0,
      cost,
      track: variant.track,
      active: variant.active,
      sort_order: index,
    });
  });

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    product: {
      ...(input.id ? { id: input.id } : {}),
      name,
      category_id: input.categoryId || null,
      tax_class_id: input.taxClassId,
      description: input.description.trim() || null,
      active: input.active,
    },
    variants,
  };
}
```

`lib/catalog/stock-form.ts`:

```ts
export type StockAction =
  | { kind: "received" | "damaged"; variantId: string; quantity: number; note: string | null }
  | { kind: "correction"; variantId: string; change: number; note: string }
  | { kind: "counted"; variantId: string; counted: number; note: string | null }
  | { kind: "transfer"; variantId: string; toStoreId: string; quantity: number; note: string | null };

type Result<T> = ({ ok: true } & T) | { ok: false; fieldErrors: Record<string, string> };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE = /^[1-9]\d{0,6}$/;
const NON_NEGATIVE = /^\d{1,7}$/;
const SIGNED = /^-?[1-9]\d{0,6}$/;

export function parseStockAction(values: Record<string, string>): Result<{ action: StockAction }> {
  const errors: Record<string, string> = {};
  const variantId = values.variantId ?? "";
  if (!GUID.test(variantId)) errors.variantId = "Pick a variant";
  const noteText = (values.note ?? "").trim();
  if (noteText.length > 300) errors.note = "Keep the note under 300 characters";
  const note = noteText || null;
  const kind = values.kind;

  if (kind === "received" || kind === "damaged" || kind === "transfer") {
    const quantity = (values.quantity ?? "").trim();
    if (!POSITIVE.test(quantity)) errors.quantity = "Enter a whole number above 0";
    if (kind === "transfer" && !GUID.test(values.toStoreId ?? "")) errors.toStoreId = "Pick a store";
    if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
    if (kind === "transfer") return { ok: true, action: { kind, variantId, toStoreId: values.toStoreId, quantity: Number(quantity), note } };
    return { ok: true, action: { kind, variantId, quantity: Number(quantity), note } };
  }
  if (kind === "counted") {
    const counted = (values.counted ?? "").trim();
    if (!NON_NEGATIVE.test(counted)) errors.counted = "Enter a whole number of 0 or more";
    if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
    return { ok: true, action: { kind, variantId, counted: Number(counted), note } };
  }
  if (kind === "correction") {
    const change = (values.change ?? "").trim();
    if (!SIGNED.test(change)) errors.change = "Enter a change like 3 or -2";
    if (!note) errors.note = "Say why you're correcting the count";
    if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
    return { ok: true, action: { kind, variantId, change: Number(change), note: note as string } };
  }
  return { ok: false, fieldErrors: { kind: "Pick what happened" } };
}

export function parseStockSettings(values: Record<string, string>): Result<{ variantId: string; track: boolean; lowStockAt: number | null }> {
  const errors: Record<string, string> = {};
  const variantId = values.variantId ?? "";
  if (!GUID.test(variantId)) errors.variantId = "Pick a variant";
  const low = (values.lowStockAt ?? "").trim();
  if (low !== "" && !NON_NEGATIVE.test(low)) errors.lowStockAt = "Enter a whole number of 0 or more, or leave it empty";
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, variantId, track: values.track === "on", lowStockAt: low === "" ? null : Number(low) };
}
```

`lib/catalog/db-errors.ts`:

```ts
import { friendlyDbError } from "@/lib/db-error";

const CONSTRAINTS: Record<string, string> = {
  product_variants_sku_key: "That SKU is already used by another product.",
  product_variants_barcode_key: "That barcode is already used by another product.",
  categories_name_key: "A category with that name already exists.",
};

export function catalogDbError(error: { code?: string; message?: string } | null): string {
  if (error?.code === "P0002") return "That item no longer exists. Reload the page and try again.";
  if (error?.code === "23505" && error.message) {
    const match = Object.keys(CONSTRAINTS).find((name) => error.message!.includes(name));
    if (match) return CONSTRAINTS[match];
  }
  return friendlyDbError(error);
}
```

`lib/catalog/list.ts`:

```ts
import { formatMoney } from "@/lib/money";

export type ProductQueryRow = {
  id: string;
  name: string;
  active: boolean;
  category: { id: string; name: string } | null;
  product_variants: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    price: number;
    active: boolean;
    stock_levels: { store_id: string; quantity: number; track: boolean; low_stock_at: number | null }[];
  }[];
};

export type ProductRow = {
  id: string;
  name: string;
  active: boolean;
  categoryId: string | null;
  categoryName: string | null;
  variantCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  trackedStock: number | null;
  lowStock: boolean;
  search: string;
};

export type ProductFilters = { q: string; category: string; view: "active" | "low" | "archived"; page: number };

export const PAGE_SIZE = 50;

export function toProductRows(data: ProductQueryRow[], storeId: string): ProductRow[] {
  return data.map((product) => {
    const variants = product.product_variants.filter((variant) => variant.active);
    const prices = variants.map((variant) => variant.price);
    const levels = variants.flatMap((variant) => variant.stock_levels.filter((level) => level.store_id === storeId && level.track));
    return {
      id: product.id,
      name: product.name,
      active: product.active,
      categoryId: product.category?.id ?? null,
      categoryName: product.category?.name ?? null,
      variantCount: variants.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      trackedStock: levels.length ? levels.reduce((sum, level) => sum + level.quantity, 0) : null,
      lowStock: levels.some((level) => level.low_stock_at !== null && level.quantity <= level.low_stock_at),
      search: [product.name, ...product.product_variants.flatMap((variant) => [variant.sku, variant.barcode ?? ""])].join(" ").toLowerCase(),
    };
  });
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseProductFilters(params: Record<string, string | string[] | undefined>): ProductFilters {
  const view = first(params.view);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).trim(),
    category: first(params.category),
    view: view === "low" || view === "archived" ? view : "active",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function filterProductRows(rows: ProductRow[], filters: ProductFilters) {
  const query = filters.q.toLowerCase();
  const matching = rows
    .filter((row) => (filters.view === "archived" ? !row.active : row.active))
    .filter((row) => filters.view !== "low" || row.lowStock)
    .filter((row) => !filters.category || row.categoryId === filters.category)
    .filter((row) => !query || row.search.includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  return { rows: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matching.length, pages };
}

export function formatPriceRange(row: ProductRow, currency: string): string {
  if (row.minPrice === null || row.maxPrice === null) return "—";
  if (row.minPrice === row.maxPrice) return formatMoney(row.minPrice, currency, "en-US");
  return `${formatMoney(row.minPrice, currency, "en-US")} – ${formatMoney(row.maxPrice, currency, "en-US")}`;
}
```

`lib/catalog/history.ts`:

```ts
export function withRunningQuantity<T extends { quantity_change: number }>(newestFirst: T[], current: number): (T & { resulting: number })[] {
  let running = current;
  return newestFirst.map((movement) => {
    const entry = { ...movement, resulting: running };
    running -= movement.quantity_change;
    return entry;
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/catalog && npm run lint`
Expected: PASS for every catalog test file, and lint is clean.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog
git commit -m "Add catalog form parsing, error messages and list helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Products list, filters and CSV export

**Files:**
- Modify: `lib/money.ts`, `lib/money.test.ts`, `lib/catalog/list.ts`, `lib/catalog/list.test.ts`, `app/(app)/products/page.tsx`
- Create: `lib/catalog/export.ts`, `lib/catalog/export.test.ts`, `lib/catalog/queries.ts`, `components/products/products-toolbar.tsx`, `components/products/products-table.tsx`, `components/products/pagination.tsx`, `app/(app)/products/export/route.ts`

**Interfaces:**
- Consumes: `toProductRows`, `filterProductRows`, `parseProductFilters`, `formatPriceRange` (Task 6); `toCsv` (Task 4); `IMPORT_COLUMNS` (Task 5).
- Produces:
  - `formatAmount(minor: number, currency: string): string`, a plain decimal string ("4.20", "1500") for inputs and CSV
  - `matchProductRows(rows, filters): ProductRow[]`, every match, sorted, unpaginated (`filterProductRows` uses it)
  - `type ExportQueryRow`
  - `buildExportRows(data: ExportQueryRow[], storeId: string, currency: string, productIds: Set<string>): CsvCell[][]`
  - `PRODUCT_LIST_SELECT`, `EXPORT_SELECT`
  - `loadProductRows(supabase, storeId): Promise<ProductRow[]>`
  - `loadCategories(supabase): Promise<{ id: string; name: string; sort_order: number }[]>`

- [ ] **Step 1: Write the failing tests**

Append to `lib/money.test.ts`:

```ts
import { formatAmount } from "./money";

describe("formatAmount", () => {
  it("writes minor units as a plain decimal", () => {
    expect(formatAmount(420, "USD")).toBe("4.20");
    expect(formatAmount(1500, "JPY")).toBe("1500");
    expect(formatAmount(-5, "EUR")).toBe("-0.05");
    expect(formatAmount(1234, "KWD")).toBe("1.234");
  });
});
```

Append to `lib/catalog/list.test.ts`:

```ts
import { matchProductRows } from "./list";

describe("matchProductRows", () => {
  it("returns every match without paging", () => {
    const rows = toProductRows(data, store);
    const many = Array.from({ length: 70 }, (_, index) => ({ ...rows[1], id: `m${index}`, name: `M ${String(index).padStart(2, "0")}` }));
    expect(matchProductRows(many, parseProductFilters({}))).toHaveLength(70);
  });
});
```

`lib/catalog/export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildExportRows, type ExportQueryRow } from "./export";

const data: ExportQueryRow[] = [
  {
    id: "p1", name: "Latte", category: { name: "Coffee" }, tax_class: { name: "Standard" },
    product_variants: [
      { name: "Small", sku: "LAT-S", barcode: "111", price: 420, cost: 110, active: true, sort_order: 0, stock_levels: [{ store_id: "s1", quantity: 7, track: true }, { store_id: "s2", quantity: 1, track: true }] },
      { name: "Old", sku: "LAT-O", barcode: null, price: 400, cost: null, active: false, sort_order: 2, stock_levels: [] },
      { name: "Large", sku: "LAT-L", barcode: null, price: 520, cost: null, active: true, sort_order: 1, stock_levels: [{ store_id: "s1", quantity: 0, track: false }] },
    ],
  },
  { id: "p2", name: "=Hack", category: null, tax_class: { name: "Exempt" }, product_variants: [{ name: "Default", sku: "H", barcode: null, price: 100, cost: null, active: true, sort_order: 0, stock_levels: [] }] },
];

describe("buildExportRows", () => {
  it("writes one row per active variant in import column order", () => {
    expect(buildExportRows(data, "s1", "USD", new Set(["p1"]))).toEqual([
      ["product", "category", "variant", "sku", "barcode", "price", "cost", "tax_class", "track", "stock"],
      ["Latte", "Coffee", "Small", "LAT-S", "111", "4.20", "1.10", "Standard", "yes", 7],
      ["Latte", "Coffee", "Large", "LAT-L", "", "5.20", "", "Standard", "no", ""],
    ]);
  });
  it("keeps only the requested products", () => {
    expect(buildExportRows(data, "s1", "USD", new Set(["p2"]))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run lib/money.test.ts lib/catalog`
Expected: FAIL (`formatAmount`, `matchProductRows` and `./export` don't exist yet).

- [ ] **Step 3: Implement the helpers**

Append to `lib/money.ts`:

```ts
export function formatAmount(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  if (digits === 0) return `${sign}${absolute}`;
  const scale = 10 ** digits;
  return `${sign}${Math.floor(absolute / scale)}.${String(absolute % scale).padStart(digits, "0")}`;
}
```

In `lib/catalog/list.ts`, replace `filterProductRows` with:

```ts
export function matchProductRows(rows: ProductRow[], filters: ProductFilters): ProductRow[] {
  const query = filters.q.toLowerCase();
  return rows
    .filter((row) => (filters.view === "archived" ? !row.active : row.active))
    .filter((row) => filters.view !== "low" || row.lowStock)
    .filter((row) => !filters.category || row.categoryId === filters.category)
    .filter((row) => !query || row.search.includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterProductRows(rows: ProductRow[], filters: ProductFilters) {
  const matching = matchProductRows(rows, filters);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  return { rows: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matching.length, pages };
}
```

`lib/catalog/export.ts`:

```ts
import type { CsvCell } from "@/lib/csv";
import { formatAmount } from "@/lib/money";
import { IMPORT_COLUMNS } from "./import";

export type ExportQueryRow = {
  id: string;
  name: string;
  category: { name: string } | null;
  tax_class: { name: string } | null;
  product_variants: {
    name: string;
    sku: string;
    barcode: string | null;
    price: number;
    cost: number | null;
    active: boolean;
    sort_order: number;
    stock_levels: { store_id: string; quantity: number; track: boolean }[];
  }[];
};

export function buildExportRows(data: ExportQueryRow[], storeId: string, currency: string, productIds: Set<string>): CsvCell[][] {
  const rows: CsvCell[][] = [[...IMPORT_COLUMNS]];
  for (const product of data) {
    if (!productIds.has(product.id)) continue;
    const variants = product.product_variants.filter((variant) => variant.active).sort((a, b) => a.sort_order - b.sort_order);
    for (const variant of variants) {
      const level = variant.stock_levels.find((entry) => entry.store_id === storeId);
      rows.push([
        product.name,
        product.category?.name ?? "",
        variant.name,
        variant.sku,
        variant.barcode ?? "",
        formatAmount(variant.price, currency),
        variant.cost === null ? "" : formatAmount(variant.cost, currency),
        product.tax_class?.name ?? "",
        level?.track === false ? "no" : "yes",
        level && level.track ? level.quantity : "",
      ]);
    }
  }
  return rows;
}
```

`lib/catalog/queries.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { toProductRows, type ProductQueryRow, type ProductRow } from "./list";

type Client = SupabaseClient<Database>;

export const PRODUCT_LIST_SELECT =
  "id, name, active, category:categories(id, name), product_variants(id, name, sku, barcode, price, active, stock_levels(store_id, quantity, track, low_stock_at))";

export const EXPORT_SELECT =
  "id, name, category:categories(name), tax_class:tax_classes(name), product_variants(name, sku, barcode, price, cost, active, sort_order, stock_levels(store_id, quantity, track))";

export async function loadProductRows(supabase: Client, storeId: string): Promise<ProductRow[]> {
  const { data, error } = await supabase.from("products").select(PRODUCT_LIST_SELECT).order("name");
  if (error) throw error;
  return toProductRows((data ?? []) as unknown as ProductQueryRow[], storeId);
}

export async function loadCategories(supabase: Client) {
  const { data, error } = await supabase.from("categories").select("id, name, sort_order").order("sort_order").order("name");
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/money.test.ts lib/catalog && npm run lint`
Expected: PASS.

- [ ] **Step 5: Write the export route** — `app/(app)/products/export/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff, getCurrentStore } from "@/lib/auth/staff";
import { roleAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { buildExportRows, type ExportQueryRow } from "@/lib/catalog/export";
import { matchProductRows, parseProductFilters } from "@/lib/catalog/list";
import { EXPORT_SELECT, loadProductRows } from "@/lib/catalog/queries";

export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || !roleAtLeast(staff.role, "manager")) return new NextResponse("Not found", { status: 404 });
  const store = await getCurrentStore(staff);
  if (!store) return new NextResponse("Not found", { status: 404 });

  const filters = parseProductFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const rows = await loadProductRows(supabase, store.id);
  const productIds = new Set(matchProductRows(rows, filters).map((row) => row.id));
  const { data, error } = await supabase.from("products").select(EXPORT_SELECT).order("name");
  if (error) throw error;

  const csv = toCsv(buildExportRows((data ?? []) as unknown as ExportQueryRow[], store.id, store.currency, productIds));
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 6: Write the list UI**

`components/products/products-toolbar.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button, { buttonVariants } from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import type { ProductFilters } from "@/lib/catalog/list";

type ProductsToolbarProps = {
  filters: ProductFilters;
  categories: { id: string; name: string }[];
};

const VIEWS: { value: ProductFilters["view"]; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "low", label: "Low stock" },
  { value: "archived", label: "Archived" },
];

export default function ProductsToolbar({ filters, categories }: ProductsToolbarProps) {
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

  const exportParams = new URLSearchParams(params.toString());
  exportParams.delete("page");

  return (
    <div className="border-line-strong flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <form role="search" onSubmit={submit} className="flex min-w-[16em] flex-1 items-center gap-2">
        <Input aria-label="Search products, SKUs or barcodes" placeholder="Search name, SKU or scan a barcode" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary" size="md">Search</Button>
      </form>
      <Select value={filters.category || "all"} onValueChange={(value) => update({ category: value === "all" ? "" : value })}>
        <SelectTrigger aria-label="Category" className="w-auto min-w-[10em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div role="group" aria-label="Show" className="flex gap-1">
        {VIEWS.map((view) => (
          <Button
            key={view.value}
            variant="ghost"
            size="md"
            aria-pressed={filters.view === view.value}
            className="aria-pressed:bg-white/6 aria-pressed:text-foreground"
            onClick={() => update({ view: view.value === "active" ? "" : view.value })}
          >
            {view.label}
          </Button>
        ))}
      </div>
      <a href={`/products/export?${exportParams.toString()}`} className={buttonVariants({ variant: "secondary", size: "md" })}>
        Export CSV
      </a>
    </div>
  );
}
```

`components/products/products-table.tsx`:

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { formatPriceRange, type ProductRow } from "@/lib/catalog/list";
import { cn } from "@/lib/utils";

type ProductsTableProps = { rows: ProductRow[]; currency: string };

export default function ProductsTable({ rows, currency }: ProductsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Variants</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Stock here</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/products/${row.id}`} className="hover:underline">{row.name}</Link>
              {!row.active && <span className="caption-style text-subtle"> · archived</span>}
            </TableCell>
            <TableCell>{row.categoryName ?? "—"}</TableCell>
            <TableCell>{row.variantCount}</TableCell>
            <TableCell>{formatPriceRange(row, currency)}</TableCell>
            <TableCell className={cn(row.trackedStock !== null && row.trackedStock < 0 && "text-danger", row.lowStock && "text-warning")}>
              {row.trackedStock ?? "—"}
              {row.lowStock && <span className="caption-style"> · low</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

`components/products/pagination.tsx`:

```tsx
import Button from "@/components/_ui/button";

type PaginationProps = { page: number; pages: number; total: number; hrefFor: (page: number) => string };

export default function Pagination({ page, pages, total, hrefFor }: PaginationProps) {
  if (pages <= 1) return <span className="caption-style text-subtle block px-4 py-3">{total} {total === 1 ? "item" : "items"}</span>;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2 px-4 py-3">
      <span className="caption-style text-subtle">Page {page} of {pages} · {total} items</span>
      <div className="flex gap-2">
        {page > 1 && <Button href={hrefFor(page - 1)} variant="secondary" size="md">Previous</Button>}
        {page < pages && <Button href={hrefFor(page + 1)} variant="secondary" size="md">Next</Button>}
      </div>
    </nav>
  );
}
```

`app/(app)/products/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ProductsToolbar from "@/components/products/products-toolbar";
import ProductsTable from "@/components/products/products-table";
import Pagination from "@/components/products/pagination";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { filterProductRows, parseProductFilters } from "@/lib/catalog/list";
import { loadCategories, loadProductRows } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "Products" };

type ProductsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const params = await searchParams;
  const filters = parseProductFilters(params);
  const supabase = await createClient();
  const [rows, categories] = await Promise.all([store ? loadProductRows(supabase, store.id) : Promise.resolve([]), loadCategories(supabase)]);
  const result = filterProductRows(rows, filters);

  const hrefFor = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value) next.set(key, value);
    next.set("page", String(page));
    return `/products?${next.toString()}`;
  };

  return (
    <section id="products" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title="Products"
        actions={
          <>
            <Button href="/products/stock" variant="ghost" size="md">Stock history</Button>
            <Button href="/products/new" variant="primary" size="md">New product</Button>
          </>
        }
      />
      <ProductsToolbar filters={filters} categories={categories} />
      <ScrollArea className="min-h-0 flex-1">
        {result.total === 0 ? (
          <EmptyState title="No products match" description="Try a different search or filter, or add a new product." />
        ) : (
          <ProductsTable rows={result.rows} currency={store?.currency ?? "USD"} />
        )}
      </ScrollArea>
      <Pagination page={Math.min(filters.page, result.pages)} pages={result.pages} total={result.total} hrefFor={hrefFor} />
    </section>
  );
}
```

- [ ] **Step 7: Verify**

```bash
npm run lint && npm test && npm run build
npx next start -p 3402 & SERVER=$!
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3402/products/export
kill $SERVER
```

Expected: lint, tests and build pass. The export curl returns `307` because it isn't signed in; the proxy redirects to login. Then sign in as `manager@demo.test` in a browser on `npm run dev` and check the following:
- `/products` lists 30 products.
- Searching `LATTE` finds Latte.
- "Low stock" shows nothing yet.
- "Export CSV" downloads a file with 37 lines (a header plus 36 variants).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add the products list with filters and CSV export

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Categories

**Files:**
- Create: `lib/catalog/category-actions.ts`, `lib/catalog/category-order.ts`, `lib/catalog/category-order.test.ts`, `components/products/categories-dialog.tsx`
- Modify: `app/(app)/products/page.tsx` (add the dialog to the header actions)

**Interfaces:**
- Consumes: `catalogDbError`, `loadCategories`, `requireRole`.
- Produces:
  - `moveInOrder(ids: string[], id: string, direction: -1 | 1): string[]`
  - Server actions `saveCategory(prev, formData)` (fields `id?`, `name`), `moveCategory(prev, formData)` (`id`, `direction`) and `deleteCategory(prev, formData)` (`id`), each returning `ActionResult`
  - `CategoriesDialog({ categories })`

- [ ] **Step 1: Write the failing test** — `lib/catalog/category-order.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { moveInOrder } from "./category-order";

describe("moveInOrder", () => {
  it("moves an item up or down", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("leaves the order alone at the edges or for unknown ids", () => {
    expect(moveInOrder(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveInOrder(["a", "b"], "b", 1)).toEqual(["a", "b"]);
    expect(moveInOrder(["a", "b"], "z", 1)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run to see it fail, then implement** — `lib/catalog/category-order.ts`

Run `npx vitest run lib/catalog/category-order.test.ts` and confirm it FAILS. Then:

```ts
export function moveInOrder(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
```

Run again and confirm it PASSES.

- [ ] **Step 3: Write the actions** — `lib/catalog/category-actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { catalogDbError } from "./db-errors";
import { moveInOrder } from "./category-order";

const GONE = "That category no longer exists. Reload the page and try again.";

const categorySchema = z.object({
  id: z.preprocess((value) => (value === "" ? undefined : value), z.guid().optional()),
  name: z.string().trim().min(1, "Enter a category name").max(60, "Keep it under 60 characters"),
});

export async function saveCategory(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("manager");
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const supabase = await createClient();
  const { id, name } = parsed.data;
  if (id) {
    const { data, error } = await supabase.from("categories").update({ name }).eq("id", id).select("id");
    if (error) return { ok: false, error: catalogDbError(error) };
    if (!data || data.length === 0) return { ok: false, error: GONE };
  } else {
    const { count } = await supabase.from("categories").select("id", { count: "exact", head: true });
    const { error } = await supabase.from("categories").insert({ name, sort_order: count ?? 0 });
    if (error) return { ok: false, error: catalogDbError(error) };
  }
  revalidatePath("/products", "layout");
  return { ok: true, message: id ? "Category renamed." : "Category added." };
}

export async function moveCategory(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("manager");
  const parsed = z.object({ id: z.guid(), direction: z.enum(["-1", "1"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Pick a category to move." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id").order("sort_order").order("name");
  if (error) return { ok: false, error: catalogDbError(error) };
  const order = moveInOrder((data ?? []).map((row) => row.id), parsed.data.id, Number(parsed.data.direction) as -1 | 1);
  for (const [index, id] of order.entries()) {
    const { error: updateError } = await supabase.from("categories").update({ sort_order: index }).eq("id", id);
    if (updateError) return { ok: false, error: catalogDbError(updateError) };
  }
  revalidatePath("/products", "layout");
  return { ok: true };
}

export async function deleteCategory(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("manager");
  const parsed = z.object({ id: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Pick a category to remove." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").delete().eq("id", parsed.data.id).select("id");
  if (error) return { ok: false, error: catalogDbError(error) };
  if (!data || data.length === 0) return { ok: false, error: GONE };
  revalidatePath("/products", "layout");
  return { ok: true, message: "Category removed. Its products are now uncategorised." };
}
```

- [ ] **Step 4: Write the dialog** — `components/products/categories-dialog.tsx`

```tsx
"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import FormMessage from "@/components/_common/form-message";
import { deleteCategory, moveCategory, saveCategory } from "@/lib/catalog/category-actions";
import type { ActionResult } from "@/lib/action-result";

type Category = { id: string; name: string };

function CategoryRow({ category, index, last }: { category: Category; index: number; last: boolean }) {
  const [name, setName] = useState(category.name);
  const [prevName, setPrevName] = useState(category.name);
  const [saveState, saveAction, saving] = useActionState<ActionResult, FormData>(saveCategory, null);
  const [, moveAction, moving] = useActionState<ActionResult, FormData>(moveCategory, null);
  const [deleteState, deleteAction, deleting] = useActionState<ActionResult, FormData>(deleteCategory, null);

  if (category.name !== prevName) {
    setPrevName(category.name);
    setName(category.name);
  }

  const error = (saveState && !saveState.ok ? saveState.fieldErrors?.name ?? saveState.error : undefined) ?? (deleteState && !deleteState.ok ? deleteState.error : undefined);

  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <form action={saveAction} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={category.id} />
          <Input name="name" aria-label={`Name for ${category.name}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
          <Button type="submit" variant="secondary" size="sm" disabled={saving || name.trim() === category.name}>Rename</Button>
        </form>
        <form action={moveAction}>
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="direction" value="-1" />
          <Button type="submit" variant="ghost" size="sm" disabled={moving || index === 0} aria-label={`Move ${category.name} up`}>↑</Button>
        </form>
        <form action={moveAction}>
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="direction" value="1" />
          <Button type="submit" variant="ghost" size="sm" disabled={moving || last} aria-label={`Move ${category.name} down`}>↓</Button>
        </form>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={category.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={deleting}>Remove</Button>
        </form>
      </div>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
    </li>
  );
}

function AddCategoryForm() {
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await saveCategory(prev, formData);
    if (result?.ok) setName("");
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <Field label="New category" htmlFor="new-category" error={state && !state.ok ? state.fieldErrors?.name : undefined} className="flex-1">
          <Input id="new-category" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Drinks" />
        </Field>
        <Button type="submit" variant="primary" size="md" disabled={pending}>Add</Button>
      </div>
      <FormMessage result={state && !state.ok && state.error ? state : null} />
    </form>
  );
}

export default function CategoriesDialog({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="md">Categories</Button>
      </DialogTrigger>
      <DialogContent>
        <div key={openCount} className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Categories</DialogTitle>
            <DialogDescription>The register groups products by category, in this order.</DialogDescription>
          </DialogHeader>
          {categories.length > 0 && (
            <ul className="divide-line-strong border-line-strong divide-y rounded-lg border">
              {categories.map((category, index) => (
                <CategoryRow key={category.id} category={category} index={index} last={index === categories.length - 1} />
              ))}
            </ul>
          )}
          <AddCategoryForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

In `app/(app)/products/page.tsx`, import `CategoriesDialog` and add `<CategoriesDialog categories={categories} />` as the first element inside the header `actions` fragment.

- [ ] **Step 5: Verify**

Run: `npm run lint && npm test && npm run build`. Expected: all pass. In a browser on `npm run dev`, signed in as the manager:
- Add "Drinks".
- Rename it to "Cold drinks".
- Move it up.
- Remove it.
- Adding "Coffee" shows "A category with that name already exists."
- After a rename fails, the typed name stays in the field.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add category management

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Product editor

**Files:**
- Create: `lib/catalog/product-input.ts`, `lib/catalog/product-input.test.ts`, `lib/catalog/clashes.ts`, `lib/catalog/clashes.test.ts`, `lib/catalog/product-actions.ts`, `components/products/product-form.tsx`, `components/products/product-tabs.tsx`, `app/(app)/products/new/page.tsx`, `app/(app)/products/[id]/page.tsx`

**Interfaces:**
- Consumes: `parseProductForm`, `ProductFormInput`, `SaveVariantPayload` (Task 6); `formatAmount` (Task 7); `catalogDbError`; RPC `save_product` (Task 3).
- Produces:
  - `productFormInputSchema` (zod), which checks the shape of the posted JSON before `parseProductForm` reads it
  - `toProductFormInput(product, variants, storeId, currency): ProductFormInput`
  - `clashErrors(variants: SaveVariantPayload[], existing: { id: string; sku: string; barcode: string | null; productName: string }[]): Record<string, string>`
  - Server action `saveProduct(prev, formData)`: field `payload` is a JSON string. It redirects to `/products/{id}` after a create.
  - `ProductForm({ initial, categories, taxClasses, currency })`
  - `ProductTabs({ productId, current: "details" | "stock" })`

- [ ] **Step 1: Write the failing tests**

`lib/catalog/product-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { productFormInputSchema, toProductFormInput } from "./product-input";

describe("productFormInputSchema", () => {
  it("accepts a well-formed payload", () => {
    const input = { name: "Tea", categoryId: "", taxClassId: "t", description: "", active: true, variants: [{ name: "", sku: "T", barcode: "", price: "1", cost: "", track: true, active: true }] };
    expect(productFormInputSchema.safeParse(input).success).toBe(true);
  });
  it("rejects a malformed payload", () => {
    expect(productFormInputSchema.safeParse({ name: "Tea", variants: "nope" }).success).toBe(false);
    expect(productFormInputSchema.safeParse({ name: "Tea", categoryId: "", taxClassId: "t", description: "", active: true, variants: Array.from({ length: 101 }, () => ({ name: "", sku: "x", barcode: "", price: "1", cost: "", track: true, active: true })) }).success).toBe(false);
  });
});

describe("toProductFormInput", () => {
  it("turns database rows into editable strings for the current store", () => {
    const input = toProductFormInput(
      { id: "p1", name: "Latte", description: null, active: true, category_id: null, tax_class_id: "t1" },
      [
        { id: "v2", name: "Large", sku: "LAT-L", barcode: null, price: 520, cost: null, active: true, sort_order: 1, stock_levels: [{ store_id: "s1", track: false }] },
        { id: "v1", name: "Small", sku: "LAT-S", barcode: "111", price: 420, cost: 110, active: true, sort_order: 0, stock_levels: [{ store_id: "s1", track: true }] },
      ],
      "s1",
      "USD",
    );
    expect(input).toEqual({
      id: "p1", name: "Latte", categoryId: "", taxClassId: "t1", description: "", active: true,
      variants: [
        { id: "v1", name: "Small", sku: "LAT-S", barcode: "111", price: "4.20", cost: "1.10", track: true, active: true },
        { id: "v2", name: "Large", sku: "LAT-L", barcode: "", price: "5.20", cost: "", track: false, active: true },
      ],
    });
  });
});
```

`lib/catalog/clashes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clashErrors } from "./clashes";

const variant = (overrides: object) => ({ name: "Default", sku: "A", barcode: null, price: 1, cost: null, track: true, active: true, sort_order: 0, ...overrides });

describe("clashErrors", () => {
  it("names the row whose SKU or barcode belongs to another product", () => {
    expect(
      clashErrors(
        [variant({ sku: "NEW" }), variant({ sku: "LAT-S", barcode: "999" })],
        [
          { id: "v1", sku: "LAT-S", barcode: "111", productName: "Latte" },
          { id: "v9", sku: "MUG", barcode: "999", productName: "Mug" },
        ],
      ),
    ).toEqual({
      "variants.1.sku": "Already used by Latte",
      "variants.1.barcode": "Already used by Mug",
    });
  });
  it("ignores a row's own saved values", () => {
    expect(clashErrors([variant({ id: "v1", sku: "LAT-S", barcode: "111" })], [{ id: "v1", sku: "LAT-S", barcode: "111", productName: "Latte" }])).toEqual({});
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run lib/catalog/product-input.test.ts lib/catalog/clashes.test.ts`
Expected: FAIL (the modules don't exist yet).

- [ ] **Step 3: Implement**

`lib/catalog/product-input.ts`:

```ts
import { z } from "zod";
import { formatAmount } from "@/lib/money";
import type { ProductFormInput } from "./product-form";

const variantInput = z.object({
  id: z.string().optional(),
  name: z.string().max(200),
  sku: z.string().max(200),
  barcode: z.string().max(200),
  price: z.string().max(50),
  cost: z.string().max(50),
  track: z.boolean(),
  active: z.boolean(),
});

export const productFormInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(500),
  categoryId: z.string().max(100),
  taxClassId: z.string().max(100),
  description: z.string().max(2000),
  active: z.boolean(),
  variants: z.array(variantInput).max(100),
});

type ProductRecord = { id: string; name: string; description: string | null; active: boolean; category_id: string | null; tax_class_id: string };
type VariantRecord = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  cost: number | null;
  active: boolean;
  sort_order: number;
  stock_levels: { store_id: string; track: boolean }[];
};

export function toProductFormInput(product: ProductRecord, variants: VariantRecord[], storeId: string, currency: string): ProductFormInput {
  return {
    id: product.id,
    name: product.name,
    categoryId: product.category_id ?? "",
    taxClassId: product.tax_class_id,
    description: product.description ?? "",
    active: product.active,
    variants: [...variants]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode ?? "",
        price: formatAmount(variant.price, currency),
        cost: variant.cost === null ? "" : formatAmount(variant.cost, currency),
        track: variant.stock_levels.find((level) => level.store_id === storeId)?.track ?? true,
        active: variant.active,
      })),
  };
}
```

`lib/catalog/clashes.ts`:

```ts
import type { SaveVariantPayload } from "./product-form";

type Existing = { id: string; sku: string; barcode: string | null; productName: string };

export function clashErrors(variants: SaveVariantPayload[], existing: Existing[]): Record<string, string> {
  const errors: Record<string, string> = {};
  variants.forEach((variant, index) => {
    const skuOwner = existing.find((row) => row.sku.toLowerCase() === variant.sku.toLowerCase() && row.id !== variant.id);
    if (skuOwner) errors[`variants.${index}.sku`] = `Already used by ${skuOwner.productName}`;
    const barcodeOwner = variant.barcode ? existing.find((row) => row.barcode === variant.barcode && row.id !== variant.id) : undefined;
    if (barcodeOwner) errors[`variants.${index}.barcode`] = `Already used by ${barcodeOwner.productName}`;
  });
  return errors;
}
```

Run: `npx vitest run lib/catalog` → PASS.

- [ ] **Step 4: Write the save action** — `lib/catalog/product-actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { catalogDbError } from "./db-errors";
import { clashErrors } from "./clashes";
import { parseProductForm } from "./product-form";
import { productFormInputSchema } from "./product-input";

export async function saveProduct(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, error: "Something went wrong. Reload the page and try again." };
  }
  const shape = productFormInputSchema.safeParse(raw);
  if (!shape.success) return { ok: false, error: "Something went wrong. Reload the page and try again." };

  const parsed = parseProductForm(shape.data, store.currency);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  const supabase = await createClient();
  const skus = parsed.variants.map((variant) => variant.sku);
  const barcodes = parsed.variants.flatMap((variant) => (variant.barcode ? [variant.barcode] : []));
  const select = "id, sku, barcode, product:products(name)";
  const [bySku, byBarcode] = await Promise.all([
    supabase.from("product_variants").select(select).in("sku", skus),
    barcodes.length ? supabase.from("product_variants").select(select).in("barcode", barcodes) : Promise.resolve({ data: [], error: null }),
  ]);
  if (bySku.error || byBarcode.error) return { ok: false, error: catalogDbError(bySku.error ?? byBarcode.error) };
  const existing = [...(bySku.data ?? []), ...(byBarcode.data ?? [])].map((row) => ({
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    productName: (row.product as { name: string } | null)?.name ?? "another product",
  }));
  const clashes = clashErrors(parsed.variants, existing);
  if (Object.keys(clashes).length > 0) return { ok: false, fieldErrors: clashes };

  const { data: productId, error } = await supabase.rpc("save_product", {
    p_store_id: store.id,
    p_product: parsed.product,
    p_variants: parsed.variants,
  });
  if (error || !productId) return { ok: false, error: catalogDbError(error) };

  revalidatePath("/products", "layout");
  if (!parsed.product.id) redirect(`/products/${productId}`);
  return { ok: true, message: "Product saved." };
}
```

- [ ] **Step 5: Write the form, tabs and pages**

`components/products/product-tabs.tsx`:

```tsx
import Button from "@/components/_ui/button";

type ProductTabsProps = { productId: string; current: "details" | "stock" };

export default function ProductTabs({ productId, current }: ProductTabsProps) {
  const tabs = [
    { key: "details", label: "Details", href: `/products/${productId}` },
    { key: "stock", label: "Stock", href: `/products/${productId}?tab=stock` },
  ] as const;
  return (
    <nav aria-label="Product" className="border-line-strong flex shrink-0 gap-1 border-b px-4 py-2">
      {tabs.map((tab) => (
        <Button
          key={tab.key}
          href={tab.href}
          variant="ghost"
          size="md"
          aria-current={current === tab.key ? "page" : undefined}
          className="aria-[current=page]:bg-white/6 aria-[current=page]:text-foreground"
        >
          {tab.label}
        </Button>
      ))}
    </nav>
  );
}
```

`components/products/product-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Checkbox } from "@/components/_ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { saveProduct } from "@/lib/catalog/product-actions";
import type { ProductFormInput } from "@/lib/catalog/product-form";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type Variant = ProductFormInput["variants"][number];

type ProductFormProps = {
  initial: ProductFormInput;
  categories: Option[];
  taxClasses: Option[];
  currency: string;
};

function emptyVariant(): Variant {
  return { name: "", sku: "", barcode: "", price: "", cost: "", track: true, active: true };
}

export default function ProductForm({ initial, categories, taxClasses, currency }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormInput>(initial);
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveProduct, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};

  function set<K extends keyof ProductFormInput>(key: K, value: ProductFormInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setVariant(index: number, patch: Partial<Variant>) {
    setValues((current) => ({ ...current, variants: current.variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)) }));
  }

  function moveVariant(index: number, direction: -1 | 1) {
    setValues((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.variants.length) return current;
      const variants = [...current.variants];
      [variants[index], variants[target]] = [variants[target], variants[index]];
      return { ...current, variants };
    });
  }

  function removeVariant(index: number) {
    setValues((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }));
  }

  return (
    <form action={action} className="flex flex-col gap-6 p-4">
      <input type="hidden" name="payload" value={JSON.stringify(values)} />
      <FormMessage result={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" htmlFor="product-name" error={errors.name}>
          <Input id="product-name" value={values.name} onChange={(event) => set("name", event.target.value)} maxLength={120} required />
        </Field>
        <Field label="Category" htmlFor="product-category" error={errors.categoryId}>
          <Select value={values.categoryId || "none"} onValueChange={(value) => set("categoryId", value === "none" ? "" : value)}>
            <SelectTrigger id="product-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tax class" htmlFor="product-tax" error={errors.taxClassId}>
          <Select value={values.taxClassId} onValueChange={(value) => set("taxClassId", value)}>
            <SelectTrigger id="product-tax">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {taxClasses.map((taxClass) => (
                <SelectItem key={taxClass.id} value={taxClass.id}>{taxClass.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Description" htmlFor="product-description">
          <Input id="product-description" value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={500} />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="product-active" checked={values.active} onCheckedChange={(checked) => set("active", checked === true)} />
        <Label htmlFor="product-active">Active — shown at the register</Label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2>Variants</h2>
          <Button variant="secondary" size="md" onClick={() => setValues((current) => ({ ...current, variants: [...current.variants, emptyVariant()] }))}>
            Add variant
          </Button>
        </div>
        <span className="caption-style text-subtle">Prices in {currency}. Tracking applies to the store you&apos;re viewing.</span>
        {errors.variants && <span role="alert" className="caption-style text-danger">{errors.variants}</span>}
        <ul className="divide-line-strong border-line-strong divide-y rounded-lg border">
          {values.variants.map((variant, index) => {
            const label = (field: string) => `Variant ${index + 1} ${field}`;
            const error = (field: string) => errors[`variants.${index}.${field}`];
            return (
              <li key={variant.id ?? `new-${index}`} className={cn("flex flex-col gap-2 p-3", !variant.active && "opacity-60")}>
                <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr]">
                  <Input aria-label={label("name")} placeholder="Default" value={variant.name} onChange={(event) => setVariant(index, { name: event.target.value })} maxLength={60} />
                  <Input aria-label={label("SKU")} aria-invalid={Boolean(error("sku"))} placeholder="SKU" value={variant.sku} onChange={(event) => setVariant(index, { sku: event.target.value })} maxLength={64} />
                  <Input aria-label={label("barcode")} aria-invalid={Boolean(error("barcode"))} placeholder="Barcode" value={variant.barcode} onChange={(event) => setVariant(index, { barcode: event.target.value })} maxLength={64} />
                  <Input aria-label={label("price")} aria-invalid={Boolean(error("price"))} placeholder="Price" inputMode="decimal" value={variant.price} onChange={(event) => setVariant(index, { price: event.target.value })} />
                  <Input aria-label={label("cost")} aria-invalid={Boolean(error("cost"))} placeholder="Cost" inputMode="decimal" value={variant.cost} onChange={(event) => setVariant(index, { cost: event.target.value })} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox id={`variant-${index}-track`} checked={variant.track} onCheckedChange={(checked) => setVariant(index, { track: checked === true })} />
                  <Label htmlFor={`variant-${index}-track`}>Track stock</Label>
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" aria-label={`Move variant ${index + 1} up`} disabled={index === 0} onClick={() => moveVariant(index, -1)}>↑</Button>
                    <Button variant="ghost" size="sm" aria-label={`Move variant ${index + 1} down`} disabled={index === values.variants.length - 1} onClick={() => moveVariant(index, 1)}>↓</Button>
                    {variant.id ? (
                      <Button variant="ghost" size="sm" onClick={() => setVariant(index, { active: !variant.active })}>{variant.active ? "Archive" : "Restore"}</Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled={values.variants.length === 1} onClick={() => removeVariant(index)}>Remove</Button>
                    )}
                  </div>
                </div>
                {["name", "sku", "barcode", "price", "cost"].map((field) =>
                  error(field) ? <span key={field} role="alert" className="caption-style text-danger">{error(field)}</span> : null,
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex justify-end gap-2">
        <Button href="/products" variant="ghost" size="md">Back to products</Button>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save product" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
```

`app/(app)/products/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ProductForm from "@/components/products/product-form";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const supabase = await createClient();
  const [categories, { data: taxClasses }] = await Promise.all([
    loadCategories(supabase),
    supabase.from("tax_classes").select("id, name, is_default").order("name"),
  ]);
  const defaultTax = taxClasses?.find((taxClass) => taxClass.is_default)?.id ?? taxClasses?.[0]?.id ?? "";

  return (
    <section id="new-product" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="New product" />
      <ScrollArea className="min-h-0 flex-1">
        <ProductForm
          initial={{ name: "", categoryId: "", taxClassId: defaultTax, description: "", active: true, variants: [{ name: "Default", sku: "", barcode: "", price: "", cost: "", track: true, active: true }] }}
          categories={categories}
          taxClasses={taxClasses ?? []}
          currency={store?.currency ?? "USD"}
        />
      </ScrollArea>
    </section>
  );
}
```

`app/(app)/products/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ProductForm from "@/components/products/product-form";
import ProductTabs from "@/components/products/product-tabs";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/catalog/queries";
import { toProductFormInput } from "@/lib/catalog/product-input";

export const metadata: Metadata = { title: "Product" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const { id } = await params;
  const { tab } = await searchParams;
  if (!GUID.test(id) || !store) notFound();

  const supabase = await createClient();
  const [{ data: product }, { data: variants }, categories, { data: taxClasses }] = await Promise.all([
    supabase.from("products").select("id, name, description, active, category_id, tax_class_id").eq("id", id).maybeSingle(),
    supabase.from("product_variants").select("id, name, sku, barcode, price, cost, active, sort_order, stock_levels(store_id, quantity, track, low_stock_at)").eq("product_id", id).order("sort_order"),
    loadCategories(supabase),
    supabase.from("tax_classes").select("id, name").order("name"),
  ]);
  if (!product) notFound();

  const current = tab === "stock" ? "stock" : "details";
  const formKey = (variants ?? []).map((variant) => variant.id).join(",");

  return (
    <section id="product" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={product.name} />
      <ProductTabs productId={product.id} current={current} />
      <ScrollArea className="min-h-0 flex-1">
        {current === "details" && (
          <ProductForm
            key={formKey}
            initial={toProductFormInput(product, variants ?? [], store.id, store.currency)}
            categories={categories}
            taxClasses={taxClasses ?? []}
            currency={store.currency}
          />
        )}
      </ScrollArea>
    </section>
  );
}
```

- [ ] **Step 6: Verify**

Run `npm run lint && npm test && npm run build`. All must pass. Then on `npm run dev`, signed in as the manager:
- `/products/new`: create "Test Cookie" with variants Plain (`TC-1`, 2.50) and Choc (`TC-2`, 3.00). You should land on `/products/<id>`.
- Change Choc's price to `3,25` and save. "Product saved." appears; reload, and it shows 3.25.
- Set a variant's SKU to `LATTE-SMALL` and save. That row shows "Already used by Latte", and the other fields keep their values.
- Archive Choc and save; it shows as faded with Restore.
- `/products/not-a-uuid` returns the 404 page.
- As the cashier, `/products/new` returns a 404.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add the product editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Stock tab

**Files:**
- Create: `lib/catalog/stock-actions.ts`, `components/products/stock-panel.tsx`, `components/products/stock-action-dialog.tsx`, `components/products/stock-settings-form.tsx`
- Modify: `lib/catalog/history.ts`, `lib/catalog/history.test.ts`, `app/(app)/products/[id]/page.tsx`

**Interfaces:**
- Consumes: `parseStockAction`, `parseStockSettings` (Task 6); `withRunningQuantity`; RPCs `record_stock_count`, `transfer_stock` (Task 2); `catalogDbError`.
- Produces:
  - `STOCK_REASON_LABELS: Record<StockReason, string>`
  - `formatChange(change: number): string`, which gives "+10" or "−3" (with a real minus sign)
  - Server actions `recordStock(prev, formData)` and `updateStockSettings(prev, formData)`
  - `StockPanel({ productId, storeId, otherStores, variants, movements })`

- [ ] **Step 1: Write the failing test** — append to `lib/catalog/history.test.ts`

```ts
import { STOCK_REASON_LABELS, formatChange } from "./history";

describe("formatChange", () => {
  it("signs changes with a real minus sign", () => {
    expect(formatChange(10)).toBe("+10");
    expect(formatChange(-3)).toBe("−3");
  });
});

describe("STOCK_REASON_LABELS", () => {
  it("has a label for every reason", () => {
    expect(Object.keys(STOCK_REASON_LABELS).sort()).toEqual(["correction", "counted", "damaged", "received", "returned", "sold", "transfer_in", "transfer_out"]);
  });
});
```

Run `npx vitest run lib/catalog/history.test.ts` and confirm it FAILS.

- [ ] **Step 2: Implement** — append to `lib/catalog/history.ts`

```ts
import type { Database } from "@/lib/supabase/database.types";

export type StockReason = Database["public"]["Enums"]["stock_reason"];

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  received: "Received",
  counted: "Counted",
  damaged: "Damaged",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  sold: "Sold",
  returned: "Returned",
  correction: "Correction",
};

export function formatChange(change: number): string {
  return change > 0 ? `+${change}` : `−${Math.abs(change)}`;
}
```

Move the `import type` line to the top of the file, then run the tests again and confirm they PASS.

- [ ] **Step 3: Write the actions** — `lib/catalog/stock-actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { catalogDbError } from "./db-errors";
import { parseStockAction, parseStockSettings } from "./stock-form";

function formStrings(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") values[key] = value;
  return values;
}

export async function recordStock(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = parseStockAction(formStrings(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
  const action = parsed.action;
  const supabase = await createClient();

  let error: { code?: string; message?: string } | null = null;
  if (action.kind === "counted") {
    ({ error } = await supabase.rpc("record_stock_count", {
      p_store_id: store.id,
      p_variant_id: action.variantId,
      p_counted: action.counted,
      p_note: action.note ?? undefined,
    }));
  } else if (action.kind === "transfer") {
    ({ error } = await supabase.rpc("transfer_stock", {
      p_from: store.id,
      p_to: action.toStoreId,
      p_variant_id: action.variantId,
      p_quantity: action.quantity,
      p_note: action.note ?? undefined,
    }));
  } else {
    const change = action.kind === "received" ? action.quantity : action.kind === "damaged" ? -action.quantity : action.change;
    ({ error } = await supabase.from("stock_movements").insert({
      store_id: store.id,
      variant_id: action.variantId,
      quantity_change: change,
      reason: action.kind,
      staff_id: staff.id,
      note: action.note,
    }));
  }
  if (error) return { ok: false, error: catalogDbError(error) };

  revalidatePath("/products", "layout");
  return { ok: true, message: "Stock updated." };
}

export async function updateStockSettings(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = parseStockSettings(formStrings(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_levels")
    .update({ track: parsed.track, low_stock_at: parsed.lowStockAt })
    .eq("store_id", store.id)
    .eq("variant_id", parsed.variantId)
    .select("variant_id");
  if (error) return { ok: false, error: catalogDbError(error) };
  if (!data || data.length === 0) return { ok: false, error: "That item no longer exists. Reload the page and try again." };

  revalidatePath("/products", "layout");
  return { ok: true, message: "Saved." };
}
```

- [ ] **Step 4: Write the stock UI**

`components/products/stock-settings-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Checkbox } from "@/components/_ui/checkbox";
import { updateStockSettings } from "@/lib/catalog/stock-actions";
import type { ActionResult } from "@/lib/action-result";

type StockSettingsFormProps = { variantId: string; variantName: string; track: boolean; lowStockAt: number | null };

export default function StockSettingsForm({ variantId, variantName, track, lowStockAt }: StockSettingsFormProps) {
  const key = `${track}|${lowStockAt ?? ""}`;
  const [prevKey, setPrevKey] = useState(key);
  const [tracked, setTracked] = useState(track);
  const [low, setLow] = useState(lowStockAt === null ? "" : String(lowStockAt));
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateStockSettings, null);

  if (key !== prevKey) {
    setPrevKey(key);
    setTracked(track);
    setLow(lowStockAt === null ? "" : String(lowStockAt));
  }

  const error = state && !state.ok ? state.fieldErrors?.lowStockAt ?? state.error : undefined;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <Checkbox id={`track-${variantId}`} name="track" checked={tracked} onCheckedChange={(checked) => setTracked(checked === true)} />
      <Label htmlFor={`track-${variantId}`}>Track</Label>
      <Label htmlFor={`low-${variantId}`} className="ml-2">Low at</Label>
      <Input id={`low-${variantId}`} name="lowStockAt" inputMode="numeric" className="w-20" value={low} onChange={(event) => setLow(event.target.value)} aria-label={`Low-stock level for ${variantName}`} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>Save</Button>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
    </form>
  );
}
```

`components/products/stock-action-dialog.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { recordStock } from "@/lib/catalog/stock-actions";
import type { ActionResult } from "@/lib/action-result";

type Kind = "received" | "counted" | "damaged" | "correction" | "transfer";

type StockActionDialogProps = {
  variantId: string;
  variantName: string;
  quantity: number;
  otherStores: { id: string; name: string }[];
};

const KIND_LABELS: Record<Kind, string> = {
  received: "Received stock",
  counted: "Counted the shelf",
  damaged: "Damaged or lost",
  correction: "Correct a mistake",
  transfer: "Send to another store",
};

function StockActionForm({ variantId, variantName, quantity, otherStores, onSaved }: StockActionDialogProps & { onSaved: () => void }) {
  const [kind, setKind] = useState<Kind>("received");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [toStoreId, setToStoreId] = useState(otherStores[0]?.id ?? "");
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await recordStock(prev, formData);
    if (result?.ok) onSaved();
    return result;
  }, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  const amountField = kind === "counted" ? "counted" : kind === "correction" ? "change" : "quantity";
  const amountLabel = kind === "counted" ? "Counted on the shelf" : kind === "correction" ? "Change (use - to subtract)" : "Quantity";
  const kinds = (Object.keys(KIND_LABELS) as Kind[]).filter((value) => value !== "transfer" || otherStores.length > 0);

  return (
    <form action={action} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Update stock for {variantName}</DialogTitle>
        <DialogDescription>Currently {quantity} in this store.</DialogDescription>
      </DialogHeader>
      <FormMessage result={state && !state.ok && state.error ? state : null} />
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="kind" value={kind} />
      <Field label="What happened" htmlFor="stock-kind">
        <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
          <SelectTrigger id="stock-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((value) => (
              <SelectItem key={value} value={value}>{KIND_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {kind === "transfer" && (
        <Field label="To store" htmlFor="stock-to" error={errors.toStoreId}>
          <Select name="toStoreId" value={toStoreId} onValueChange={setToStoreId}>
            <SelectTrigger id="stock-to" aria-invalid={Boolean(errors.toStoreId)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {otherStores.map((store) => (
                <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label={amountLabel} htmlFor="stock-amount" error={errors[amountField]}>
        <Input id="stock-amount" name={amountField} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </Field>
      <Field label={kind === "correction" ? "Reason" : "Note (optional)"} htmlFor="stock-note" error={errors.note}>
        <Input id="stock-note" name="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </form>
  );
}

export default function StockActionDialog(props: StockActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Update stock for ${props.variantName}`}>Update stock</Button>
      </DialogTrigger>
      <DialogContent>
        <StockActionForm key={openCount} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

`components/products/stock-panel.tsx`:

```tsx
import StockActionDialog from "./stock-action-dialog";
import StockSettingsForm from "./stock-settings-form";
import { STOCK_REASON_LABELS, formatChange, withRunningQuantity, type StockReason } from "@/lib/catalog/history";
import { cn } from "@/lib/utils";

type StockVariant = { id: string; name: string; sku: string; active: boolean; quantity: number; track: boolean; lowStockAt: number | null };
type Movement = { id: string; variant_id: string; quantity_change: number; reason: StockReason; note: string | null; created_at: string; staff: { name: string } | null };

type StockPanelProps = {
  variants: StockVariant[];
  movements: Movement[];
  otherStores: { id: string; name: string }[];
  timeZone: string;
};

export default function StockPanel({ variants, movements, otherStores, timeZone }: StockPanelProps) {
  const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone });
  return (
    <ul className="flex flex-col gap-4 p-4">
      {variants.map((variant) => {
        const history = withRunningQuantity(movements.filter((movement) => movement.variant_id === variant.id).slice(0, 10), variant.quantity);
        const low = variant.track && variant.lowStockAt !== null && variant.quantity <= variant.lowStockAt;
        return (
          <li key={variant.id} className={cn("border-line-strong flex flex-col gap-3 rounded-lg border p-4", !variant.active && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h2>{variant.name}</h2>
                <span className="caption-style text-subtle">{variant.sku}{variant.active ? "" : " · archived"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span data-testid={`stock-${variant.sku}`} className={cn("lead-style", variant.quantity < 0 && "text-danger", low && "text-warning")}>
                  {variant.track ? variant.quantity : "Not tracked"}
                </span>
                <StockActionDialog variantId={variant.id} variantName={variant.name} quantity={variant.quantity} otherStores={otherStores} />
              </div>
            </div>
            <StockSettingsForm variantId={variant.id} variantName={variant.name} track={variant.track} lowStockAt={variant.lowStockAt} />
            {history.length > 0 && (
              <ol className="divide-line-strong divide-y">
                {history.map((entry) => (
                  <li key={entry.id} className="caption-style flex flex-wrap gap-x-3 gap-y-1 py-2">
                    <span className="text-subtle">{dateFormat.format(new Date(entry.created_at))}</span>
                    <span>{STOCK_REASON_LABELS[entry.reason]}</span>
                    <span className={entry.quantity_change < 0 ? "text-danger" : "text-success"}>{formatChange(entry.quantity_change)}</span>
                    <span className="text-subtle">→ {entry.resulting}</span>
                    <span className="text-subtle">{entry.staff?.name ?? "Staff"}</span>
                    {entry.note && <span className="text-subtle">· {entry.note}</span>}
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Show the stock tab** — in `app/(app)/products/[id]/page.tsx`

Add these imports:

```tsx
import StockPanel from "@/components/products/stock-panel";
import type { StockReason } from "@/lib/catalog/history";
```

After `const current = …`, add:

```tsx
  const variantIds = (variants ?? []).map((variant) => variant.id);
  const { data: movements } =
    current === "stock" && variantIds.length > 0
      ? await supabase
          .from("stock_movements")
          .select("id, variant_id, quantity_change, reason, note, created_at, staff:staff(name)")
          .eq("store_id", store.id)
          .in("variant_id", variantIds)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] };
  const { data: storeRow } = await supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle();
  const stockVariants = (variants ?? []).map((variant) => {
    const level = variant.stock_levels.find((entry) => entry.store_id === store.id);
    return {
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      active: variant.active,
      quantity: level?.quantity ?? 0,
      track: level?.track ?? true,
      lowStockAt: level?.low_stock_at ?? null,
    };
  });
```

Inside the `ScrollArea`, after the details block, add:

```tsx
        {current === "stock" && (
          <StockPanel
            variants={stockVariants}
            movements={(movements ?? []) as unknown as { id: string; variant_id: string; quantity_change: number; reason: StockReason; note: string | null; created_at: string; staff: { name: string } | null }[]}
            otherStores={staff.stores.filter((entry) => entry.id !== store.id).map((entry) => ({ id: entry.id, name: entry.name }))}
            timeZone={storeRow?.timezone ?? "UTC"}
          />
        )}
```

- [ ] **Step 6: Verify**

Run `npm run lint && npm test && npm run build`. All must pass. Then on `npm run dev`, signed in as the manager, open Latte → Stock:
- **Receive 10** on Small; the number rises by 10 and the history shows "Received +10 → new total".
- **Count** to 7; the history shows "Counted" with the difference.
- **Correction** without a reason shows "Say why you're correcting the count", and the typed amount is kept.
- **Transfer** 2 to Airport Kiosk (the manager has both stores). Switch to Airport Kiosk in the sidebar and see the +2.
- **Settings:** set "Low at" to 100 and save. The products list "Low stock" filter now shows Latte.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add the stock tab with receive, count, adjust and transfer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Stock history page

**Files:**
- Modify: `lib/catalog/history.ts`, `lib/catalog/history.test.ts`
- Create: `app/(app)/products/stock/page.tsx`, `components/products/history-filters.tsx`

**Interfaces:**
- Consumes: `STOCK_REASON_LABELS`, `formatChange`, `Pagination` (Task 7).
- Produces:
  - `type HistoryFilters = { q: string; reason: StockReason | ""; from: string; to: string; page: number }`
  - `parseHistoryFilters(params): HistoryFilters`
  - `HISTORY_PAGE_SIZE = 50`
  - `dayRange(from: string, to: string): { gte?: string; lt?: string }`, which turns UTC ISO bounds into an inclusive date range

- [ ] **Step 1: Write the failing test** — append to `lib/catalog/history.test.ts`

```ts
import { dayRange, parseHistoryFilters } from "./history";

describe("parseHistoryFilters", () => {
  it("keeps valid values and drops bad ones", () => {
    expect(parseHistoryFilters({ q: " latte ", reason: "received", from: "2026-10-01", to: "2026-10-14", page: "2" })).toEqual({ q: "latte", reason: "received", from: "2026-10-01", to: "2026-10-14", page: 2 });
    expect(parseHistoryFilters({ reason: "stolen", from: "yesterday", page: "-1" })).toEqual({ q: "", reason: "", from: "", to: "", page: 1 });
  });
});

describe("dayRange", () => {
  it("makes the end date inclusive", () => {
    expect(dayRange("2026-10-01", "2026-10-14")).toEqual({ gte: "2026-10-01T00:00:00.000Z", lt: "2026-10-15T00:00:00.000Z" });
    expect(dayRange("", "")).toEqual({});
  });
});
```

Run `npx vitest run lib/catalog/history.test.ts` and confirm it FAILS.

- [ ] **Step 2: Implement** — append to `lib/catalog/history.ts`

```ts
export const HISTORY_PAGE_SIZE = 50;

export type HistoryFilters = { q: string; reason: StockReason | ""; from: string; to: string; page: number };

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function validDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : "";
}

export function parseHistoryFilters(params: Record<string, string | string[] | undefined>): HistoryFilters {
  const reason = single(params.reason);
  const page = Number.parseInt(single(params.page), 10);
  return {
    q: single(params.q).trim(),
    reason: reason in STOCK_REASON_LABELS ? (reason as StockReason) : "",
    from: validDate(single(params.from)),
    to: validDate(single(params.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function dayRange(from: string, to: string): { gte?: string; lt?: string } {
  const range: { gte?: string; lt?: string } = {};
  if (from) range.gte = new Date(`${from}T00:00:00Z`).toISOString();
  if (to) {
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end.toISOString();
  }
  return range;
}
```

Run the tests again and confirm they PASS.

- [ ] **Step 3: Write the filters and the page**

`components/products/history-filters.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import { STOCK_REASON_LABELS, type HistoryFilters, type StockReason } from "@/lib/catalog/history";

export default function HistoryFiltersBar({ filters }: { filters: HistoryFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState(filters);
  const filtersKey = JSON.stringify(filters);
  const [prevKey, setPrevKey] = useState(filtersKey);

  if (filtersKey !== prevKey) {
    setPrevKey(filtersKey);
    setValues(filters);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (values.q) next.set("q", values.q);
    if (values.reason) next.set("reason", values.reason);
    if (values.from) next.set("from", values.from);
    if (values.to) next.set("to", values.to);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="border-line-strong flex flex-wrap items-end gap-2 border-b px-4 py-3">
      <Input aria-label="Search product or SKU" placeholder="Product or SKU" className="min-w-[14em] flex-1" value={values.q} onChange={(event) => setValues({ ...values, q: event.target.value })} />
      <Select value={values.reason || "all"} onValueChange={(value) => setValues({ ...values, reason: value === "all" ? "" : (value as StockReason) })}>
        <SelectTrigger aria-label="Reason" className="w-auto min-w-[10em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All reasons</SelectItem>
          {(Object.keys(STOCK_REASON_LABELS) as StockReason[]).map((reason) => (
            <SelectItem key={reason} value={reason}>{STOCK_REASON_LABELS[reason]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input type="date" aria-label="From date" className="w-auto" value={values.from} onChange={(event) => setValues({ ...values, from: event.target.value })} />
      <Input type="date" aria-label="To date" className="w-auto" value={values.to} onChange={(event) => setValues({ ...values, to: event.target.value })} />
      <Button type="submit" variant="secondary" size="md">Apply</Button>
    </form>
  );
}
```

`app/(app)/products/stock/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import HistoryFiltersBar from "@/components/products/history-filters";
import Pagination from "@/components/products/pagination";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { HISTORY_PAGE_SIZE, STOCK_REASON_LABELS, dayRange, formatChange, parseHistoryFilters, type StockReason } from "@/lib/catalog/history";

export const metadata: Metadata = { title: "Stock history" };

type StockHistoryPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type HistoryRow = {
  id: string;
  quantity_change: number;
  reason: StockReason;
  note: string | null;
  created_at: string;
  staff: { name: string } | null;
  variant: { name: string; sku: string; product: { name: string } | null } | null;
};

export default async function StockHistoryPage({ searchParams }: StockHistoryPageProps) {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const params = await searchParams;
  const filters = parseHistoryFilters(params);
  const supabase = await createClient();

  let variantIds: string[] | null = null;
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[%_]/g, "")}%`;
    const [bySku, byProduct] = await Promise.all([
      supabase.from("product_variants").select("id").ilike("sku", pattern),
      supabase.from("product_variants").select("id, product:products!inner(name)").ilike("product.name", pattern),
    ]);
    variantIds = [...new Set([...(bySku.data ?? []), ...(byProduct.data ?? [])].map((row) => row.id))];
  }

  const from = (filters.page - 1) * HISTORY_PAGE_SIZE;
  let query = supabase
    .from("stock_movements")
    .select("id, quantity_change, reason, note, created_at, staff:staff(name), variant:product_variants(name, sku, product:products(name))", { count: "exact" })
    .eq("store_id", store?.id ?? "")
    .order("created_at", { ascending: false })
    .range(from, from + HISTORY_PAGE_SIZE - 1);
  if (filters.reason) query = query.eq("reason", filters.reason);
  const range = dayRange(filters.from, filters.to);
  if (range.gte) query = query.gte("created_at", range.gte);
  if (range.lt) query = query.lt("created_at", range.lt);
  if (variantIds) query = query.in("variant_id", variantIds.length ? variantIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data, count } = store ? await query : { data: [], count: 0 };
  const rows = (data ?? []) as unknown as HistoryRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

  const hrefFor = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value) next.set(key, value);
    next.set("page", String(page));
    return `/products/stock?${next.toString()}`;
  };

  return (
    <section id="stock-history" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Stock history" actions={<Button href="/products" variant="ghost" size="md">Back to products</Button>} />
      <HistoryFiltersBar filters={filters} />
      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <EmptyState title="No stock changes match" description="Try a wider date range or a different reason." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{dateFormat.format(new Date(row.created_at))}</TableCell>
                  <TableCell>
                    <span className="block">{row.variant?.product?.name ?? "—"}</span>
                    <span className="caption-style text-subtle block">{row.variant ? `${row.variant.name} · ${row.variant.sku}` : ""}</span>
                  </TableCell>
                  <TableCell>{STOCK_REASON_LABELS[row.reason]}</TableCell>
                  <TableCell className={row.quantity_change < 0 ? "text-danger" : "text-success"}>{formatChange(row.quantity_change)}</TableCell>
                  <TableCell>{row.staff?.name ?? "—"}</TableCell>
                  <TableCell>{row.note ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
      <Pagination page={Math.min(filters.page, pages)} pages={pages} total={total} hrefFor={hrefFor} />
    </section>
  );
}
```

- [ ] **Step 4: Verify**

Run `npm run lint && npm test && npm run build`. All must pass. On `npm run dev`, signed in as the manager:
- `/products/stock` lists the seeded "Received" entries.
- Filter Reason = Counted, then search "latte".
- A date range of today shows today's entries.
- The page has a working Next button, since the seed has 36 entries per store.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the stock history page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: CSV import

**Files:**
- Create: `lib/catalog/import-context.ts`, `lib/catalog/import-context.test.ts`, `lib/catalog/import-actions.ts`, `components/products/import-panel.tsx`, `app/(app)/products/import/page.tsx`
- Modify: `app/(app)/products/page.tsx` (add an "Import CSV" header action)

**Interfaces:**
- Consumes: `parseCsv`, `CsvError` (Task 4); `validateImport`, `ImportContext`, `ImportPreview` (Task 5); RPC `import_catalog` (Task 3).
- Produces:
  - `buildImportContext(raw: ImportContextRaw, storeId: string, currency: string): ImportContext`
  - `type ImportState = { preview: ImportPreview | null; error: string | null; applied: number | null }`
  - Server actions `previewImport(prev: ImportState, formData)` and `applyImport(prev: ImportState, formData)`, both reading the `csv` text field
  - `MAX_IMPORT_BYTES = 2_000_000`

- [ ] **Step 1: Write the failing test** — `lib/catalog/import-context.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildImportContext } from "./import-context";

describe("buildImportContext", () => {
  it("flattens database rows for validation", () => {
    const ctx = buildImportContext(
      {
        taxClasses: [{ id: "t1", name: "Standard", is_default: true }, { id: "t2", name: "Exempt", is_default: false }],
        categories: [{ name: "Coffee" }],
        products: [{ name: "Latte", active: true }],
        variants: [
          {
            sku: "LAT-S", name: "Small", barcode: null, price: 420, cost: null,
            product: { name: "Latte", tax_class_id: "t1", category: { name: "Coffee" } },
            stock_levels: [{ store_id: "s1", track: false }, { store_id: "s2", track: true }],
          },
        ],
      },
      "s1",
      "USD",
    );
    expect(ctx).toEqual({
      currency: "USD",
      defaultTaxClassId: "t1",
      taxClasses: [{ id: "t1", name: "Standard" }, { id: "t2", name: "Exempt" }],
      categories: [{ name: "Coffee" }],
      products: [{ name: "Latte", active: true }],
      variants: [{ sku: "LAT-S", name: "Small", barcode: null, price: 420, cost: null, track: false, productName: "Latte", categoryName: "Coffee", taxClassId: "t1" }],
    });
  });
});
```

Run `npx vitest run lib/catalog/import-context.test.ts` and confirm it FAILS.

- [ ] **Step 2: Implement** — `lib/catalog/import-context.ts`

```ts
import type { ImportContext } from "./import";

export type ImportContextRaw = {
  taxClasses: { id: string; name: string; is_default: boolean }[];
  categories: { name: string }[];
  products: { name: string; active: boolean }[];
  variants: {
    sku: string;
    name: string;
    barcode: string | null;
    price: number;
    cost: number | null;
    product: { name: string; tax_class_id: string; category: { name: string } | null } | null;
    stock_levels: { store_id: string; track: boolean }[];
  }[];
};

export function buildImportContext(raw: ImportContextRaw, storeId: string, currency: string): ImportContext {
  return {
    currency,
    defaultTaxClassId: raw.taxClasses.find((taxClass) => taxClass.is_default)?.id ?? raw.taxClasses[0]?.id ?? "",
    taxClasses: raw.taxClasses.map(({ id, name }) => ({ id, name })),
    categories: raw.categories,
    products: raw.products,
    variants: raw.variants.map((variant) => ({
      sku: variant.sku,
      name: variant.name,
      barcode: variant.barcode,
      price: variant.price,
      cost: variant.cost,
      track: variant.stock_levels.find((level) => level.store_id === storeId)?.track ?? true,
      productName: variant.product?.name ?? "",
      categoryName: variant.product?.category?.name ?? null,
      taxClassId: variant.product?.tax_class_id ?? "",
    })),
  };
}
```

Run the test again and confirm it PASSES.

- [ ] **Step 3: Write the actions** — `lib/catalog/import-actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { CsvError, parseCsv } from "@/lib/csv";
import { catalogDbError } from "./db-errors";
import { validateImport, type ImportPreview } from "./import";
import { buildImportContext, type ImportContextRaw } from "./import-context";

export type ImportState = { preview: ImportPreview | null; error: string | null; applied: number | null };

const MAX_IMPORT_BYTES = 2_000_000;

async function prepare(formData: FormData): Promise<{ error: string } | { preview: ImportPreview; storeId: string }> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) return { error: "Pick a store in the sidebar first." };
  const text = String(formData.get("csv") ?? "");
  if (!text.trim()) return { error: "Choose a CSV file first." };
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { error: "The file is larger than 2 MB. Split it into smaller files." };

  let parsed: { header: string[]; rows: string[][] };
  try {
    parsed = parseCsv(text);
  } catch (error) {
    return { error: error instanceof CsvError ? error.message : "That file couldn't be read as a CSV." };
  }

  const supabase = await createClient();
  const [taxClasses, categories, products, variants] = await Promise.all([
    supabase.from("tax_classes").select("id, name, is_default"),
    supabase.from("categories").select("name"),
    supabase.from("products").select("name, active"),
    supabase.from("product_variants").select("sku, name, barcode, price, cost, product:products(name, tax_class_id, category:categories(name)), stock_levels(store_id, track)"),
  ]);
  const failed = taxClasses.error ?? categories.error ?? products.error ?? variants.error;
  if (failed) return { error: catalogDbError(failed) };

  const raw = {
    taxClasses: taxClasses.data ?? [],
    categories: categories.data ?? [],
    products: products.data ?? [],
    variants: (variants.data ?? []) as unknown as ImportContextRaw["variants"],
  };
  return { preview: validateImport(parsed.header, parsed.rows, buildImportContext(raw, store.id, store.currency)), storeId: store.id };
}

export async function previewImport(_: ImportState, formData: FormData): Promise<ImportState> {
  const result = await prepare(formData);
  if ("error" in result) return { preview: null, error: result.error, applied: null };
  return { preview: result.preview, error: result.preview.fileError, applied: null };
}

export async function applyImport(_: ImportState, formData: FormData): Promise<ImportState> {
  const result = await prepare(formData);
  if ("error" in result) return { preview: null, error: result.error, applied: null };
  const { preview, storeId } = result;
  if (preview.fileError || preview.summary.error > 0) return { preview, error: "Fix the rows with errors, then preview again.", applied: null };
  if (preview.apply.length === 0) return { preview, error: null, applied: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_catalog", { p_store_id: storeId, p_rows: preview.apply });
  if (error) return { preview, error: `Nothing was imported. ${catalogDbError(error)}`, applied: null };

  revalidatePath("/products", "layout");
  return { preview: null, error: null, applied: data ?? preview.apply.length };
}
```

- [ ] **Step 4: Write the panel and page**

`components/products/import-panel.tsx`:

```tsx
"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { applyImport, previewImport, type ImportState } from "@/lib/catalog/import-actions";
import { cn } from "@/lib/utils";

const EMPTY: ImportState = { preview: null, error: null, applied: null };
const STATUS_LABELS = { new: "New", update: "Update", unchanged: "No change", error: "Error" } as const;

export default function ImportPanel() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [previewState, preview, previewing] = useActionState(previewImport, EMPTY);
  const [applyState, apply, applying] = useActionState(applyImport, EMPTY);
  const [shown, setShown] = useState<"preview" | "apply">("preview");

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setShown("preview");
  }

  const state = shown === "apply" ? applyState : previewState;
  const result = state.preview;
  const canApply = Boolean(result && !result.fileError && result.summary.error === 0 && result.apply.length > 0);

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <span className="caption-style text-subtle">
          Columns: product, category, variant, sku, barcode, price, cost, tax_class, track, stock. Only product, sku and price are required. Existing SKUs are updated and nothing is deleted. Stock values become counts for the store you&apos;re viewing.
        </span>
        <form action={preview} onSubmit={() => setShown("preview")} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-file">CSV file</Label>
            <Input id="import-file" type="file" accept=".csv,text/csv" onChange={choose} />
          </div>
          <input type="hidden" name="csv" value={csv} />
          <Button type="submit" variant="secondary" size="md" disabled={!csv || previewing}>{previewing ? "Checking…" : "Preview"}</Button>
        </form>
      </div>

      {state.error && <div role="alert" className="caption-style bg-danger/10 text-danger rounded-lg px-3 py-2">{state.error}</div>}
      {applyState.applied !== null && shown === "apply" && (
        <div role="status" className="caption-style bg-success/10 text-success rounded-lg px-3 py-2">
          Imported {applyState.applied} {applyState.applied === 1 ? "row" : "rows"} from {fileName}.
        </div>
      )}

      {result && !result.fileError && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {result.summary.new} new · {result.summary.update} updated · {result.summary.unchanged} unchanged · {result.summary.error} {result.summary.error === 1 ? "error" : "errors"}
              {result.newCategories.length > 0 && ` · new categories: ${result.newCategories.join(", ")}`}
            </span>
            <form action={apply} onSubmit={() => setShown("apply")}>
              <input type="hidden" name="csv" value={csv} />
              <Button type="submit" variant="primary" size="md" disabled={!canApply || applying}>
                {applying ? "Importing…" : `Import ${result.apply.length} ${result.apply.length === 1 ? "row" : "rows"}`}
              </Button>
            </form>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.line} className={cn(row.status === "error" && "bg-danger/5")}>
                  <TableCell>{row.line}</TableCell>
                  <TableCell>{row.product || "—"}</TableCell>
                  <TableCell>{row.sku || "—"}</TableCell>
                  <TableCell className={row.status === "error" ? "text-danger" : undefined}>
                    {row.status === "error" ? row.errors.join(" · ") : STATUS_LABELS[row.status]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

`app/(app)/products/import/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ImportPanel from "@/components/products/import-panel";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportProductsPage() {
  await requireRole("manager");
  return (
    <section id="import-products" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Import products" actions={<Button href="/products" variant="ghost" size="md">Back to products</Button>} />
      <ScrollArea className="min-h-0 flex-1">
        <ImportPanel />
      </ScrollArea>
    </section>
  );
}
```

In `app/(app)/products/page.tsx`, add `<Button href="/products/import" variant="ghost" size="md">Import CSV</Button>` before "Stock history" in the header actions.

- [ ] **Step 5: Verify**

Run `npm run lint && npm test && npm run build`. All must pass. On `npm run dev`, signed in as the manager, export the catalog, then use these files:
- **Unchanged re-import:** importing the export unchanged shows "0 new · 0 updated · 36 unchanged" and a disabled Import button.
- **Price change:** edit one price to `9,99` with a semicolon-separated copy, or a dot price in a comma file. The preview shows 1 update; Import applies it and shows "Imported 1 row".
- **Bad row:** a file with a bad price row lists the error, and Import is disabled.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add CSV import with a preview

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: End-to-end tests, README and final checks

**Files:**
- Create: `e2e/products.spec.ts`
- Modify: `README.md`, `app/(app)/products/page.tsx` (only if a selector needs an accessible name)

**Interfaces:**
- Consumes: everything above; `signIn` from `e2e/helpers.ts`.

- [ ] **Step 1: Write the end-to-end tests** — `e2e/products.spec.ts`

```ts
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

async function chooseOption(page: Page, trigger: string, option: string) {
  await page.getByRole("combobox", { name: trigger }).click();
  await page.getByRole("option", { name: option }).click();
}

test("a manager creates a product and manages its stock", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/products/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Cookie");
  await page.getByLabel("Variant 1 name").fill("Plain");
  await page.getByLabel("Variant 1 SKU").fill("E2E-PLAIN");
  await page.getByLabel("Variant 1 price").fill("2.50");
  await page.getByRole("button", { name: "Add variant" }).click();
  await page.getByLabel("Variant 2 name").fill("Choc");
  await page.getByLabel("Variant 2 SKU").fill("E2E-CHOC");
  await page.getByLabel("Variant 2 price").fill("3,00");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);

  await page.getByRole("link", { name: "Stock" }).click();
  await expect(page.getByTestId("stock-E2E-PLAIN")).toHaveText("0");

  await page.getByRole("button", { name: "Update stock for Plain" }).click();
  await page.getByLabel("Quantity").fill("10");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("stock-E2E-PLAIN")).toHaveText("10");

  await page.getByRole("button", { name: "Update stock for Plain" }).click();
  await chooseOption(page, "What happened", "Counted the shelf");
  await page.getByLabel("Counted on the shelf").fill("7");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("stock-E2E-PLAIN")).toHaveText("7");
  await expect(page.getByText("Counted").first()).toBeVisible();
  await expect(page.getByText("−3").first()).toBeVisible();
});

test("a duplicate SKU is reported on the right row", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/products/new");
  await page.getByLabel("Name", { exact: true }).fill("Clash");
  await page.getByLabel("Variant 1 SKU").fill("LATTE-SMALL");
  await page.getByLabel("Variant 1 price").fill("1");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Already used by Latte" })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Clash");
});

test("CSV import previews errors and applies a clean file", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/products/import");

  const bad = "product,sku,price\nE2E Scone,E2E-SCONE,2.00\nE2E Bun,E2E-BUN,abc\n";
  await page.getByLabel("CSV file").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("1 new · 0 updated · 0 unchanged · 1 error")).toBeVisible();
  await expect(page.getByText("Price must be an amount like 4.50")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Import/ })).toBeDisabled();

  const good = "product;sku;price\nE2E Scone;E2E-SCONE;2,00\nE2E Bun;E2E-BUN;1,50\n";
  await page.getByLabel("CSV file").setInputFiles({ name: "good.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("2 new · 0 updated · 0 unchanged · 0 errors")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 2 rows" })).toBeVisible();

  await page.goto("/products?q=E2E-BUN");
  await expect(page.getByRole("link", { name: "E2E Bun" })).toBeVisible();
});

test("export downloads the catalog as CSV", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/products");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^products-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("cashiers cannot reach the catalog", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  for (const path of ["/products", "/products/new", "/products/stock", "/products/import"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
});
```

- [ ] **Step 2: Update the README**

Add a "Catalog & stock" section after "Quick start":

```markdown
## Catalog & stock

- **Products** (managers and owners): add products with named variants, each with its own SKU, barcode, price and cost. Archive instead of deleting, so past sales stay intact.
- **Stock** is kept per store as a history: received, counted, damaged, corrected or transferred. Counts always match the history. Set a low-stock level per item to use the "Low stock" filter.
- **CSV import/export:** export, edit in a spreadsheet, import back. Imports are matched by SKU, previewed before anything is saved, and applied all-or-nothing. Comma or semicolon files both work.
- **One currency for now:** prices are shared by every store, so all stores should use the same currency until multi-currency support arrives.
```

- [ ] **Step 3: Run every suite**

```bash
npm run lint && npm test && npm run test:db && npm run test:e2e && npm run build
```

Expected: everything passes. The e2e run now has 15 specs: 1 fresh, 9 role tests and 5 product tests. If a product spec selector doesn't match the real UI, fix the selector (not the assertion) and report it. If it fails because of an app bug, fix the bug and report it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add catalog end-to-end tests and README notes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Publish (ask first)**

Ask the user before pushing. When they approve:
1. `git ls-remote --heads origin catalog-f2f3` must print nothing.
2. Run `git push -u origin catalog-f2f3`.
3. Run `gh pr create --base main`, ending the body with the Claude Code line.
4. Run `gh pr merge --merge --delete-branch`.
5. Run `git switch main && git pull --ff-only`.
