# Counter Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reusable priced modifiers on products, tips at payment, and printed kitchen tickets, exact to the cent and priced by the database.

**Architecture:**
- **Modifiers:** catalog tables are managed by managers. `create_order` validates choices, prices each unit as the variant price plus option deltas, snapshots the choices per line, and passes the effective price to the unchanged `price_cart`.
- **Tips:** stored on the order and split across payments with a SQL `private.allocate`, which mirrors the TS `allocate`. Cash tips flow through `private.session_cash` into close-till, cash-ups and reports, which net tips out of sales.
- **Kitchen tickets:** an 80mm page of the kitchen-category lines.

**Tech Stack:** Next.js 16.4, React 19, Tailwind 4, Supabase Postgres (RLS, pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-counter-service-design.md`

## Global Constraints

- **Money:** integer minor units. Tips use half-even percentages (`tipFor`) and largest-remainder splits (`allocate` / `private.allocate`, ties to earlier payments).
- **Modifier rules:**
  - for every active group attached to the product, `min ≤ chosen ≤ max`;
  - options must be active, in an active, attached group;
  - unit price = variant price + Σ deltas ≥ 0.
- **Database messages:**
  - `'pick {group} for {item}'`, `'pick up to {n} {group} for {item}'`;
  - `'{option} isn''t available for {item} any more'`, `'modifiers can''t make {item} cost less than 0'`;
  - `'the tip must be 0 or more'`, `'payments must add up to the total plus tip'`;
  - `'keep the order name under 40 characters'`.

  The screen capitalises them and adds a full stop (the existing `registerDbError` 22023 rule).
- **Lockdown:** sales tables, including `order_item_modifiers`, are written only by definer functions.
- **Touch:** register controls are at least 44px (`min-h-11`).
- **Conventions:**
  - no comments;
  - Tailwind only;
  - explicit `Button` variants;
  - React 19 patterns (no setState in effects, dialogs remount per open);
  - `localStorage` only for the per-device auto-print switch, wrapped in try/catch.

## Rulings made while planning

- **Modifier group upserts are atomic:** `save_modifier_group(p_group jsonb)` is a security invoker function (RLS managers-only), so the group and its options save in one transaction. Cost if wrong: one function.
- **Cart line `key`:** lines get a `key` field. It equals `variantId` when no options are chosen, so existing calls and tests that pass a variant id keep working. Cost if wrong: none.
- **Modifier-free sales keep their old payments message:** with a tip of 0, the payments error stays `'payments must add up to the total'`, so existing tests and screens are unchanged. With a tip it is `'… total plus tip'`. Cost if wrong: one message.
- **The new browser test is `e2e/zz-service.spec.ts`:** it sorts after `zz-reports.spec.ts`, so the reports test data is unchanged. Cost if wrong: none.
- **Demo data:** the seed marks Coffee and Bakery as kitchen categories. Cost if wrong: a seed line.

## Review Focus

1. **A cashier edits a line's choices so it now matches another line:** the two must merge (same key), not double-count. *Pinned in Task 2 (`changeSelection`).*
2. **A manager archives an option or group while it sits in an open cart:** `create_order` refuses with the "isn't available" message, and an archived group stops being required. *Pinned in Task 1 pgTAP.*
3. **Tip with split payments:** the per-payment tip shares sum to the tip, no share exceeds its payment, and cash tips reach expected cash. *Pinned in Task 1 (card 130 / cash 76) and Task 2 (`allocateTip`).*
4. **Refunding a tipped sale:** the refund total excludes the tip, and card refund room is still capped. *Pinned in Task 1.*
5. **Reports still add up:** payment-method nets equal net sales when tips exist. *Pinned in Task 1 (cash 130 + card 475 = net 605).*

---

### Task 1: Database — modifiers, tips, kitchen flag, cash and reports

**Files:**
- Create: `supabase/migrations/20261015000012_counter_service.sql`, `supabase/tests/counter_service.test.sql`
- Modify:
  - `supabase/tests/reports.test.sql`: the summary JSON gains `"tips":0`;
  - `supabase/tests/orders.test.sql`: the close JSON gains `"cash_tips":0`;
  - `supabase/tests/register.test.sql`: the close JSON gains `"cash_tips":0`;
  - `supabase/tests/schema.test.sql`: `tables_are` gains the four new tables;
  - `supabase/seed.sql`: kitchen categories;
  - `lib/supabase/database.types.ts`: regenerated.

**Interfaces:**
- Produces:
  - **Tables:** `modifier_groups(id, name, min_choices, max_choices, sort_order, active)`, `modifier_options(id, group_id, name, price_delta, sort_order, active)`, `product_modifier_groups(product_id, group_id, sort_order)`, `order_item_modifiers(id, order_item_id, option_id, group_name, option_name, price_delta, sort_order)`.
  - **Columns:** `categories.kitchen`, `orders.tip`, `orders.order_name`, `payments.tip`.
  - **`public.create_order(p_session_id, p_lines, p_order_discount, p_approval_id, p_customer_id, p_payments, p_tip bigint default 0, p_order_name text default null)`.** Lines take `option_ids`.
  - **`public.save_modifier_group(p_group jsonb) returns uuid`.** `p_group` is `{ id?, name, min_choices, max_choices, active?, options: [{ id?, name, price_delta, active? }] }`.
  - **`public.save_product`:** `p_product.modifier_group_ids` replaces the product's attachments when the key is present.
  - **Cash:** `private.session_cash` returns `(opening_cash, cash_sales, cash_tips, cash_refunds, expected_cash)`. `close_register` adds `cash_tips`.
  - **Reports:** `report_summary` adds `tips`, and its methods are net of tips. `report_staff` adds a `tips bigint` column (last). `report_cashups` adds `cash_tips bigint` after `cash_sales`.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/counter_service.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;
truncate table public.modifier_groups cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'cs-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'cs-cashier@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency, prices_include_tax, timezone) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD', false, 'UTC');
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'cs-manager@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'cs-cashier@test', 'cashier', true);
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1');
insert into public.registers (id, store_id, name) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Till 1');
insert into public.register_sessions (id, register_id, opened_by, opening_cash) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3', 0);
insert into public.tax_classes (id, name, is_default) values ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);
insert into public.tax_rates (store_id, tax_class_id, name, rate_bps) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 'Tax', 1000);
insert into public.categories (id, name, kitchen) values ('00000000-0000-0000-0000-0000000000e2', 'Coffee', true);
insert into public.products (id, name, category_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'Latte', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000f2', 'Mug', null);
insert into public.product_variants (id, product_id, name, sku, price) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'Small', 'LAT-S', 420),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 'Default', 'MUG', 1250);
update public.stock_levels set track = false;
insert into public.modifier_groups (id, name, min_choices, max_choices, sort_order, active) values
  ('00000000-0000-0000-0000-000000000101', 'Milk', 1, 1, 0, true),
  ('00000000-0000-0000-0000-000000000102', 'Extras', 0, 1, 1, true),
  ('00000000-0000-0000-0000-000000000103', 'Old', 1, 1, 2, false),
  ('00000000-0000-0000-0000-000000000104', 'Sauce', 0, 1, 3, true);
insert into public.modifier_options (id, group_id, name, price_delta, sort_order, active) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Whole', 0, 0, true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Oat', 50, 1, true),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101', 'Skip', -500, 2, true),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000102', 'Shot', 80, 0, true),
  ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000102', 'Syrup', 40, 1, true),
  ('00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000102', 'Cream', 60, 2, false),
  ('00000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000103', 'Gone', 0, 0, true),
  ('00000000-0000-0000-0000-000000000208', '00000000-0000-0000-0000-000000000104', 'Ketchup', 0, 0, true);
insert into public.product_modifier_groups (product_id, group_id, sort_order) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000101', 0),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000102', 1),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000103', 2);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is(
  public.create_order('00000000-0000-0000-0000-000000000011',
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1,"option_ids":["00000000-0000-0000-0000-000000000202","00000000-0000-0000-0000-000000000204"]}]',
    null, null, null, '[{"method":"card","amount":605}]') ->> 'total',
  '605',
  'modifiers are priced from the catalog before tax'
);
select is((select unit_price from public.order_items where sku = 'LAT-S'), 550::bigint, 'the line keeps the price actually charged per unit');
select is(
  (select array_agg(row(group_name, option_name, price_delta)::text order by sort_order) from public.order_item_modifiers),
  array['(Milk,Oat,50)', '(Extras,Shot,80)'],
  'each choice is kept on the line in group order'
);
select throws_ok(
  $$select public.create_order('00000000-0000-0000-0000-000000000011', '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]', null, null, null, '[{"method":"card","amount":462}]')$$,
  '22023', 'pick Milk for Latte – Small', 'a required group must be chosen'
);
select throws_ok(
  $$select public.create_order('00000000-0000-0000-0000-000000000011',
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1,"option_ids":["00000000-0000-0000-0000-000000000201","00000000-0000-0000-0000-000000000204","00000000-0000-0000-0000-000000000205"]}]',
    null, null, null, '[{"method":"card","amount":594}]')$$,
  '22023', 'pick up to 1 Extras for Latte – Small', 'a group cannot have too many choices'
);
select throws_ok(
  $$select public.create_order('00000000-0000-0000-0000-000000000011',
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1,"option_ids":["00000000-0000-0000-0000-000000000201","00000000-0000-0000-0000-000000000206"]}]',
    null, null, null, '[{"method":"card","amount":528}]')$$,
  '22023', 'Cream isn''t available for Latte – Small any more', 'an archived option is refused'
);
select throws_ok(
  $$select public.create_order('00000000-0000-0000-0000-000000000011',
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1,"option_ids":["00000000-0000-0000-0000-000000000201","00000000-0000-0000-0000-000000000208"]}]',
    null, null, null, '[{"method":"card","amount":462}]')$$,
  '22023', 'Ketchup isn''t available for Latte – Small any more', 'an option from a group not on the product is refused'
);
select throws_ok(
  $$select public.create_order('00000000-0000-0000-0000-000000000011',
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1,"option_ids":["00000000-0000-0000-0000-000000000203"]}]',
    null, null, null, '[{"method":"card","amount":0}]')$$,
  '22023', 'modifiers can''t make Latte – Small cost less than 0', 'a unit price cannot go below zero'
);
select lives_ok(
  $$select public.create_order('00000000-0000-0000-0000-000000000011', '[{"variant_id":"00000000-0000-0000-0000-0000000000f4","quantity":1}]', null, null, null,
    '[{"method":"card","amount":1000},{"method":"cash","amount":581}]', 206, '  Sam ')$$,
  'a tip is paid on top of the total'
);
select is(
  (select array_agg(row(p.method, p.tip)::text order by p.method::text) from public.payments p join public.orders o on o.id = p.order_id where o.tip > 0),
  array['(card,130)', '(cash,76)'],
  'the tip is split across payments in proportion, exact to the cent'
);
select is((select row(tip, order_name)::text from public.orders where tip > 0), row(206::bigint, 'Sam')::text, 'the tip and the order name are kept on the sale');
select throws_ok(
  $$select public.create_order('00000000-0000-0000-0000-000000000011', '[{"variant_id":"00000000-0000-0000-0000-0000000000f4","quantity":1}]', null, null, null, '[{"method":"card","amount":1375}]', 206)$$,
  '22023', 'payments must add up to the total plus tip', 'payments must cover the tip too'
);
select throws_ok(
  $$select public.create_order('00000000-0000-0000-0000-000000000011', '[{"variant_id":"00000000-0000-0000-0000-0000000000f4","quantity":1}]', null, null, null, '[{"method":"card","amount":1375}]', -1)$$,
  '22023', 'the tip must be 0 or more', 'a negative tip is refused'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(
  public.create_refund((select id from public.orders where tip > 0), '00000000-0000-0000-0000-000000000011',
    (select jsonb_build_array(jsonb_build_object('order_item_id', oi.id, 'quantity', 1, 'restock', true)) from public.order_items oi join public.orders o on o.id = oi.order_id where o.tip > 0),
    '[{"method":"card","amount":1000},{"method":"cash","amount":375}]') ->> 'total',
  '1375',
  'a refund gives back the sale, never the tip'
);
select is(
  public.report_summary('00000000-0000-0000-0000-0000000000b1', now() - interval '1 day', now() + interval '1 day') -> 'methods',
  '{"cash":130,"card":475,"other":0}'::jsonb,
  'payment methods leave tips out, so they add up to net sales'
);
select is(
  (public.report_summary('00000000-0000-0000-0000-0000000000b1', now() - interval '1 day', now() + interval '1 day') ->> 'tips'),
  '206',
  'the summary reports tips separately'
);
select is(
  (select tips from public.report_staff('00000000-0000-0000-0000-0000000000b1', now() - interval '1 day', now() + interval '1 day') where name = 'Cashier'),
  206::bigint,
  'tips are credited to whoever rang up the sale'
);
select is(
  public.close_register('00000000-0000-0000-0000-000000000011', 206),
  '{"opening_cash":0,"cash_sales":505,"cash_tips":76,"cash_refunds":375,"expected_cash":206,"counted_cash":206,"difference":0,"voided_count":0}'::jsonb,
  'cash tips are counted in the drawer'
);
select is(
  (select cash_tips from public.report_cashups('00000000-0000-0000-0000-0000000000b1', now() - interval '1 day', now() + interval '1 day')),
  76::bigint,
  'cash-ups show cash tips'
);
select lives_ok(
  $$select public.save_product('00000000-0000-0000-0000-0000000000b1',
    '{"id":"00000000-0000-0000-0000-0000000000f2","name":"Mug","tax_class_id":"00000000-0000-0000-0000-0000000000e1","active":true,"modifier_group_ids":["00000000-0000-0000-0000-000000000104"]}', '[]')$$,
  'a manager attaches groups when saving a product'
);
select throws_ok(
  $$select public.save_modifier_group('{"name":"Size","min_choices":2,"max_choices":2,"options":[{"name":"Small","price_delta":0}]}')$$,
  '22023', 'min choices can''t be more than the active options', 'a group cannot require more choices than it has'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select throws_ok($$insert into public.modifier_groups (name) values ('Hack')$$, '42501', null, 'cashiers cannot change modifier groups');

select * from finish();
rollback;
```

The count is 22: 13 as the cashier, 8 as the manager, and 1 final cashier check.

In the other test files:
- **`supabase/tests/reports.test.sql`:** in the first `select is(public.report_summary(...))`, add `"tips":0,` after `"sales_total":1897,` in the expected JSON.
- **`supabase/tests/orders.test.sql`:** the close-till expected JSON becomes `'{"opening_cash":5000,"cash_sales":490,"cash_tips":0,"cash_refunds":490,"expected_cash":5000,"difference":0,"voided_count":2}'`.
- **`supabase/tests/register.test.sql`:** the close-till expected JSON becomes `'{"opening_cash":5000,"cash_sales":660,"cash_tips":0,"cash_refunds":0,"expected_cash":5660,"counted_cash":5700,"difference":40,"voided_count":0}'`.
- **`supabase/tests/schema.test.sql`:** add `'modifier_groups', 'modifier_options', 'product_modifier_groups', 'order_item_modifiers'` after `'refund_approvals'`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx supabase db reset >/dev/null && npm run test:db`
Expected: FAIL. `counter_service.test.sql` errors on `relation "public.modifier_groups" does not exist`; `schema`, `reports`, `orders` and `register` fail on their changed expectations.

- [ ] **Step 3: Write the migration and the seed change**

`supabase/seed.sql`: append
```sql
update public.categories set kitchen = true where name in ('Coffee', 'Bakery');
```

`supabase/migrations/20261015000012_counter_service.sql`:
```sql
alter table public.categories add column kitchen boolean not null default false;

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  min_choices integer not null default 0 check (min_choices >= 0),
  max_choices integer not null default 1 check (max_choices >= 1),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (max_choices >= min_choices)
);
create unique index modifier_groups_active_name_idx on public.modifier_groups (lower(name)) where active;

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  price_delta bigint not null default 0 check (price_delta between -1000000 and 1000000),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);
create index modifier_options_group_id_idx on public.modifier_options (group_id);

create table public.product_modifier_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete restrict,
  sort_order integer not null default 0,
  primary key (product_id, group_id)
);
create index product_modifier_groups_group_id_idx on public.product_modifier_groups (group_id);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  option_id uuid references public.modifier_options (id) on delete set null,
  group_name text not null,
  option_name text not null,
  price_delta bigint not null,
  sort_order integer not null default 0
);
create index order_item_modifiers_order_item_id_idx on public.order_item_modifiers (order_item_id);
create index order_item_modifiers_option_id_idx on public.order_item_modifiers (option_id);

alter table public.orders
  add column tip bigint not null default 0 check (tip >= 0),
  add column order_name text check (length(order_name) between 1 and 40);
alter table public.payments add column tip bigint not null default 0 check (tip >= 0 and tip <= amount);

alter table public.modifier_groups enable row level security;
alter table public.modifier_options enable row level security;
alter table public.product_modifier_groups enable row level security;
alter table public.order_item_modifiers enable row level security;
revoke all on public.modifier_groups, public.modifier_options, public.product_modifier_groups, public.order_item_modifiers from anon;
revoke insert, update, delete, truncate, references, trigger on public.order_item_modifiers from authenticated;

create policy "staff read modifier groups" on public.modifier_groups
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage modifier groups" on public.modifier_groups
  for all to authenticated
  using ((select private.staff_role()) in ('owner', 'manager'))
  with check ((select private.staff_role()) in ('owner', 'manager'));
create policy "staff read modifier options" on public.modifier_options
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage modifier options" on public.modifier_options
  for all to authenticated
  using ((select private.staff_role()) in ('owner', 'manager'))
  with check ((select private.staff_role()) in ('owner', 'manager'));
create policy "staff read product modifier groups" on public.product_modifier_groups
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage product modifier groups" on public.product_modifier_groups
  for all to authenticated
  using ((select private.staff_role()) in ('owner', 'manager'))
  with check ((select private.staff_role()) in ('owner', 'manager'));
create policy "staff read order item modifiers" on public.order_item_modifiers
  for select to authenticated using (
    exists (select 1 from public.order_items oi where oi.id = order_item_id and private.can_access_order(oi.order_id))
  );

create function private.allocate(p_amount bigint, p_bases bigint[])
returns bigint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer := coalesce(array_length(p_bases, 1), 0);
  v_total numeric := 0;
  v_shares bigint[] := '{}';
  v_rems numeric[] := '{}';
  v_left bigint;
  v_index integer;
  i integer;
begin
  if v_count = 0 then
    return '{}';
  end if;
  for i in 1..v_count loop
    v_total := v_total + p_bases[i];
  end loop;
  if p_amount = 0 or v_total = 0 then
    return array_fill(0::bigint, array[v_count]);
  end if;
  for i in 1..v_count loop
    v_shares := v_shares || floor(p_amount::numeric * p_bases[i] / v_total)::bigint;
    v_rems := v_rems || (p_amount::numeric * p_bases[i] - floor(p_amount::numeric * p_bases[i] / v_total) * v_total);
  end loop;
  v_left := p_amount - (select sum(s) from unnest(v_shares) s);
  for v_index in select o.i from unnest(v_rems) with ordinality as o(r, i) order by o.r desc, o.i loop
    exit when v_left = 0;
    v_shares[v_index] := v_shares[v_index] + 1;
    v_left := v_left - 1;
  end loop;
  return v_shares;
end;
$$;
revoke execute on function private.allocate(bigint, bigint[]) from public, anon, authenticated;

drop function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb);

create function public.create_order(
  p_session_id uuid,
  p_lines jsonb,
  p_order_discount jsonb default null,
  p_approval_id uuid default null,
  p_customer_id uuid default null,
  p_payments jsonb default '[]'::jsonb,
  p_tip bigint default 0,
  p_order_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_role public.staff_role;
  v_store_id uuid;
  v_register_id uuid;
  v_closed_at timestamptz;
  v_include_tax boolean;
  v_cap integer;
  v_line jsonb;
  v_quantity integer;
  v_variant record;
  v_group record;
  v_option_ids uuid[];
  v_bad text;
  v_delta bigint;
  v_unit bigint;
  v_priced jsonb := '[]'::jsonb;
  v_variant_ids uuid[] := '{}';
  v_product_ids uuid[] := '{}';
  v_option_sets jsonb := '[]'::jsonb;
  v_names text[] := '{}';
  v_skus text[] := '{}';
  v_prices bigint[] := '{}';
  v_quantities integer[] := '{}';
  v_rates integer[] := '{}';
  v_tracks boolean[] := '{}';
  v_entered_bps integer[] := '{}';
  v_entered_amounts bigint[] := '{}';
  v_cart jsonb;
  v_subtotal bigint;
  v_discount_total bigint;
  v_total bigint;
  v_share integer;
  v_discount_by uuid;
  v_approval_id uuid;
  v_approver uuid;
  v_payment jsonb;
  v_method public.payment_method;
  v_amount bigint;
  v_tendered bigint;
  v_reference text;
  v_paid bigint := 0;
  v_change bigint := 0;
  v_amounts bigint[] := '{}';
  v_tips bigint[];
  v_tip bigint := coalesce(p_tip, 0);
  v_order_name text := nullif(trim(p_order_name), '');
  v_receipt integer;
  v_order_id uuid;
  v_item_id uuid;
  i integer;
  n integer;
begin
  select s.id, s.role into v_staff_id, v_role from public.staff s where s.user_id = (select auth.uid()) and s.active;
  if v_staff_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select r.store_id, r.id, rs.closed_at into v_store_id, v_register_id, v_closed_at
  from public.register_sessions rs
  join public.registers r on r.id = rs.register_id
  where rs.id = p_session_id
  for update of rs;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.can_access_store(v_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_closed_at is not null then
    raise exception 'till is closed' using errcode = 'P0001';
  end if;
  if v_tip < 0 or v_tip > 1000000000 then
    raise exception 'the tip must be 0 or more' using errcode = '22023';
  end if;
  if length(v_order_name) > 40 then
    raise exception 'keep the order name under 40 characters' using errcode = '22023';
  end if;

  select s.prices_include_tax, s.max_cashier_discount_bps into v_include_tax, v_cap from public.stores s where s.id = v_store_id;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'add at least one item' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity is null or v_quantity < 1 or v_quantity > 9999 then
      raise exception 'quantity must be between 1 and 9999' using errcode = '22023';
    end if;

    select v.id, v.price, v.sku, v.product_id,
      case when v.name = 'Default' then p.name else p.name || ' – ' || v.name end as label,
      coalesce(tr.rate_bps, 0) as rate_bps,
      coalesce(sl.track, false) as track
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.tax_rates tr on tr.store_id = v_store_id and tr.tax_class_id = p.tax_class_id
    left join public.stock_levels sl on sl.store_id = v_store_id and sl.variant_id = v.id
    where v.id = (v_line ->> 'variant_id')::uuid and v.active and p.active;
    if not found then
      raise exception 'item not available' using errcode = 'P0002';
    end if;

    v_option_ids := array(select (jsonb_array_elements_text(coalesce(v_line -> 'option_ids', '[]'::jsonb)))::uuid);
    if cardinality(v_option_ids) > 50 or cardinality(v_option_ids) <> (select count(distinct x) from unnest(v_option_ids) x) then
      raise exception 'list each choice once' using errcode = '22023';
    end if;

    select coalesce(mo.name, 'A choice') into v_bad
    from unnest(v_option_ids) as chosen(id)
    left join public.modifier_options mo on mo.id = chosen.id
    left join public.modifier_groups mg on mg.id = mo.group_id
    left join public.product_modifier_groups pmg on pmg.group_id = mg.id and pmg.product_id = v_variant.product_id
    where mo.id is null or not mo.active or not mg.active or pmg.product_id is null
    limit 1;
    if found then
      raise exception '%', format('%s isn''t available for %s any more', v_bad, v_variant.label) using errcode = '22023';
    end if;

    for v_group in
      select mg.name, mg.min_choices, mg.max_choices,
        (select count(*) from unnest(v_option_ids) c(id) join public.modifier_options mo on mo.id = c.id where mo.group_id = mg.id)::integer as chosen
      from public.product_modifier_groups pmg
      join public.modifier_groups mg on mg.id = pmg.group_id
      where pmg.product_id = v_variant.product_id and mg.active
      order by pmg.sort_order, mg.name
    loop
      if v_group.chosen < v_group.min_choices then
        raise exception '%', format('pick %s for %s', v_group.name, v_variant.label) using errcode = '22023';
      end if;
      if v_group.chosen > v_group.max_choices then
        raise exception '%', format('pick up to %s %s for %s', v_group.max_choices, v_group.name, v_variant.label) using errcode = '22023';
      end if;
    end loop;

    select coalesce(sum(mo.price_delta), 0) into v_delta from public.modifier_options mo where mo.id = any(v_option_ids);
    v_unit := v_variant.price + v_delta;
    if v_unit < 0 then
      raise exception '%', format('modifiers can''t make %s cost less than 0', v_variant.label) using errcode = '22023';
    end if;

    v_variant_ids := v_variant_ids || v_variant.id;
    v_product_ids := v_product_ids || v_variant.product_id;
    v_option_sets := v_option_sets || jsonb_build_array(to_jsonb(v_option_ids));
    v_names := v_names || v_variant.label;
    v_skus := v_skus || v_variant.sku;
    v_prices := v_prices || v_unit;
    v_quantities := v_quantities || v_quantity;
    v_rates := v_rates || v_variant.rate_bps;
    v_tracks := v_tracks || v_variant.track;
    v_entered_bps := v_entered_bps || (v_line ->> 'discount_bps')::integer;
    v_entered_amounts := v_entered_amounts || (v_line ->> 'discount_amount')::bigint;
    v_priced := v_priced || jsonb_build_array(jsonb_build_object(
      'price', v_unit,
      'quantity', v_quantity,
      'rate_bps', v_variant.rate_bps,
      'discount_bps', v_line -> 'discount_bps',
      'discount_amount', v_line -> 'discount_amount'
    ));
  end loop;

  v_cart := private.price_cart(v_include_tax, v_priced, case when jsonb_typeof(p_order_discount) = 'object' then p_order_discount end);
  v_subtotal := (v_cart ->> 'subtotal')::bigint;
  v_discount_total := (v_cart ->> 'discount_total')::bigint;
  v_total := (v_cart ->> 'total')::bigint;

  if v_discount_total > 0 then
    v_discount_by := v_staff_id;
    v_share := ceil(v_discount_total::numeric * 10000 / v_subtotal)::integer;
    if v_role = 'cashier' and v_share > v_cap then
      select a.id, a.approved_by into v_approval_id, v_approver
      from public.discount_approvals a
      where a.id = p_approval_id
        and a.store_id = v_store_id
        and a.used_at is null
        and a.expires_at > now()
        and a.requested_by = v_staff_id
        and a.max_bps >= v_share
        and a.max_discount >= v_discount_total
      for update;
      if not found then
        raise exception 'discount needs approval' using errcode = 'P0001';
      end if;
      update public.discount_approvals set used_at = now() where id = v_approval_id;
      v_discount_by := v_approver;
    end if;
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 10 then
    raise exception 'add a payment' using errcode = '22023';
  end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_method := (v_payment ->> 'method')::public.payment_method;
    v_amount := (v_payment ->> 'amount')::bigint;
    v_tendered := (v_payment ->> 'tendered')::bigint;
    v_reference := nullif(trim(v_payment ->> 'reference'), '');
    if v_amount is null or v_amount <= 0 then
      raise exception 'each payment needs an amount above 0' using errcode = '22023';
    end if;
    if v_tendered is not null then
      if v_method <> 'cash' then
        raise exception 'only cash can have an amount received' using errcode = '22023';
      end if;
      if v_tendered < v_amount then
        raise exception 'cash received is less than the amount' using errcode = '22023';
      end if;
      v_change := v_change + v_tendered - v_amount;
    end if;
    if length(v_reference) > 100 then
      raise exception 'keep the payment reference under 100 characters' using errcode = '22023';
    end if;
    v_paid := v_paid + v_amount;
    v_amounts := v_amounts || v_amount;
  end loop;
  if v_paid <> v_total + v_tip then
    if v_tip = 0 then
      raise exception 'payments must add up to the total' using errcode = '22023';
    end if;
    raise exception 'payments must add up to the total plus tip' using errcode = '22023';
  end if;
  v_tips := private.allocate(v_tip, v_amounts);

  if p_customer_id is not null and not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  update public.registers set next_receipt_number = next_receipt_number + 1
  where id = v_register_id
  returning next_receipt_number - 1 into v_receipt;

  insert into public.orders (
    store_id, register_id, session_id, staff_id, customer_id, receipt_number, status,
    subtotal, discount_total, tax_total, total, discount_approval_id, discount_by, tip, order_name
  ) values (
    v_store_id, v_register_id, p_session_id, v_staff_id, p_customer_id, v_receipt, 'completed',
    v_subtotal, v_discount_total, (v_cart ->> 'tax_total')::bigint, v_total, v_approval_id, v_discount_by, v_tip, v_order_name
  )
  returning id into v_order_id;

  for i in 1..array_length(v_variant_ids, 1) loop
    insert into public.order_items (
      order_id, line_number, variant_id, name, sku, unit_price, quantity, discount,
      line_discount_bps, line_discount_amount, tax_rate_bps, tax, line_total
    ) values (
      v_order_id, i, v_variant_ids[i], v_names[i], v_skus[i], v_prices[i], v_quantities[i],
      (v_cart -> 'lines' -> (i - 1) ->> 'discount')::bigint,
      v_entered_bps[i], v_entered_amounts[i], v_rates[i],
      (v_cart -> 'lines' -> (i - 1) ->> 'tax')::bigint,
      (v_cart -> 'lines' -> (i - 1) ->> 'line_total')::bigint
    )
    returning id into v_item_id;

    insert into public.order_item_modifiers (order_item_id, option_id, group_name, option_name, price_delta, sort_order)
    select v_item_id, mo.id, mg.name, mo.name, mo.price_delta,
      (row_number() over (order by pmg.sort_order, mg.name, mo.sort_order, mo.name))::integer
    from jsonb_array_elements_text(v_option_sets -> (i - 1)) as chosen(id)
    join public.modifier_options mo on mo.id = chosen.id::uuid
    join public.modifier_groups mg on mg.id = mo.group_id
    left join public.product_modifier_groups pmg on pmg.group_id = mg.id and pmg.product_id = v_product_ids[i];
  end loop;

  n := 0;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    n := n + 1;
    v_amount := (v_payment ->> 'amount')::bigint;
    v_tendered := (v_payment ->> 'tendered')::bigint;
    insert into public.payments (order_id, method, amount, tendered, change, reference, tip)
    values (
      v_order_id,
      (v_payment ->> 'method')::public.payment_method,
      v_amount,
      v_tendered,
      case when v_tendered is not null then v_tendered - v_amount end,
      nullif(trim(v_payment ->> 'reference'), ''),
      v_tips[n]
    );
  end loop;

  perform 1 from public.stock_levels
  where store_id = v_store_id and variant_id = any(v_variant_ids)
  order by variant_id
  for update;

  for i in 1..array_length(v_variant_ids, 1) loop
    if v_tracks[i] then
      insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
      values (v_store_id, v_variant_ids[i], -v_quantities[i], 'sold', v_staff_id, 'Receipt #' || v_receipt);
    end if;
  end loop;

  return jsonb_build_object('order_id', v_order_id, 'receipt_number', v_receipt, 'total', v_total, 'change', v_change);
end;
$$;

revoke execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text) to authenticated;

create function public.save_modifier_group(p_group jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_group ->> 'id', '')::uuid;
  v_option jsonb;
  v_option_id uuid;
  v_keep uuid[] := '{}';
  v_position integer := 0;
  v_active integer;
begin
  if jsonb_typeof(p_group -> 'options') <> 'array' or jsonb_array_length(p_group -> 'options') = 0 then
    raise exception 'add at least one option' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.modifier_groups (name, min_choices, max_choices, active, sort_order)
    values (
      trim(p_group ->> 'name'),
      (p_group ->> 'min_choices')::integer,
      (p_group ->> 'max_choices')::integer,
      coalesce((p_group ->> 'active')::boolean, true),
      coalesce((select max(sort_order) + 1 from public.modifier_groups), 0)
    )
    returning id into v_id;
  else
    update public.modifier_groups set
      name = trim(p_group ->> 'name'),
      min_choices = (p_group ->> 'min_choices')::integer,
      max_choices = (p_group ->> 'max_choices')::integer,
      active = coalesce((p_group ->> 'active')::boolean, true)
    where id = v_id;
    if not found then
      raise exception 'modifier group not found' using errcode = 'P0002';
    end if;
  end if;

  for v_option in select value from jsonb_array_elements(p_group -> 'options') loop
    v_option_id := nullif(v_option ->> 'id', '')::uuid;
    if v_option_id is not null then
      v_keep := v_keep || v_option_id;
    end if;
  end loop;
  delete from public.modifier_options where group_id = v_id and not (id = any(v_keep));

  for v_option in select value from jsonb_array_elements(p_group -> 'options') loop
    v_option_id := nullif(v_option ->> 'id', '')::uuid;
    if v_option_id is null then
      insert into public.modifier_options (group_id, name, price_delta, active, sort_order)
      values (v_id, trim(v_option ->> 'name'), (v_option ->> 'price_delta')::bigint, coalesce((v_option ->> 'active')::boolean, true), v_position);
    else
      update public.modifier_options set
        name = trim(v_option ->> 'name'),
        price_delta = (v_option ->> 'price_delta')::bigint,
        active = coalesce((v_option ->> 'active')::boolean, true),
        sort_order = v_position
      where id = v_option_id and group_id = v_id;
      if not found then
        raise exception 'option not found' using errcode = 'P0002';
      end if;
    end if;
    v_position := v_position + 1;
  end loop;

  select count(*) into v_active from public.modifier_options where group_id = v_id and active;
  if (select min_choices from public.modifier_groups where id = v_id) > v_active then
    raise exception 'min choices can''t be more than the active options' using errcode = '22023';
  end if;
  return v_id;
end;
$$;
revoke execute on function public.save_modifier_group(jsonb) from public, anon;
grant execute on function public.save_modifier_group(jsonb) to authenticated;

create or replace function public.save_product(p_store_id uuid, p_product jsonb, p_variants jsonb)
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

  if p_product ? 'modifier_group_ids' then
    delete from public.product_modifier_groups where product_id = v_product_id;
    insert into public.product_modifier_groups (product_id, group_id, sort_order)
    select v_product_id, g.id::uuid, (g.position - 1)::integer
    from jsonb_array_elements_text(p_product -> 'modifier_group_ids') with ordinality as g(id, position);
  end if;

  return v_product_id;
end;
$$;

drop function public.report_cashups(uuid, timestamptz, timestamptz);
drop function public.report_staff(uuid, timestamptz, timestamptz);
drop function private.session_cash(uuid);

create function private.session_cash(p_session_id uuid)
returns table (opening_cash bigint, cash_sales bigint, cash_tips bigint, cash_refunds bigint, expected_cash bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select rs.opening_cash, s.sales, s.tips, f.cash, rs.opening_cash + s.sales + s.tips - f.cash
  from public.register_sessions rs
  cross join lateral (
    select coalesce(sum(p.amount - p.tip), 0)::bigint as sales, coalesce(sum(p.tip), 0)::bigint as tips
    from public.payments p
    join public.orders o on o.id = p.order_id
    where o.session_id = rs.id and o.status <> 'voided' and p.method = 'cash'
  ) s
  cross join lateral (
    select coalesce(sum(rp.amount), 0)::bigint as cash
    from public.refund_payments rp
    join public.refunds r on r.id = rp.refund_id
    where r.session_id = rs.id and rp.method = 'cash'
  ) f
  where rs.id = p_session_id
$$;
revoke execute on function private.session_cash(uuid) from public, anon;
grant execute on function private.session_cash(uuid) to authenticated;

create or replace function public.close_register(p_session_id uuid, p_counted_cash bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_store_id uuid;
  v_closed_at timestamptz;
  v_cash record;
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

  select r.store_id, rs.closed_at into v_store_id, v_closed_at
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

  select * into v_cash from private.session_cash(p_session_id);
  select count(*) into v_voided from public.orders o where o.session_id = p_session_id and o.status = 'voided';

  update public.register_sessions set
    closed_by = v_staff_id,
    closed_at = now(),
    counted_cash = p_counted_cash,
    close_note = nullif(trim(p_note), '')
  where id = p_session_id;

  return jsonb_build_object(
    'opening_cash', v_cash.opening_cash,
    'cash_sales', v_cash.cash_sales,
    'cash_tips', v_cash.cash_tips,
    'cash_refunds', v_cash.cash_refunds,
    'expected_cash', v_cash.expected_cash,
    'counted_cash', p_counted_cash,
    'difference', p_counted_cash - v_cash.expected_cash,
    'voided_count', v_voided
  );
end;
$$;

create or replace function public.report_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_sales record;
  v_refunds record;
  v_voids record;
  v_methods jsonb;
begin
  perform private.report_guard(p_store_id, p_from, p_to);

  select count(*)::integer as n,
    coalesce(sum(o.subtotal), 0)::bigint as gross,
    coalesce(sum(o.discount_total), 0)::bigint as discounts,
    coalesce(sum(o.tax_total), 0)::bigint as tax,
    coalesce(sum(o.total), 0)::bigint as total,
    coalesce(sum(o.tip), 0)::bigint as tips
  into v_sales
  from public.orders o
  where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to and o.status <> 'voided';

  select count(*)::integer as n, coalesce(sum(r.total), 0)::bigint as total, coalesce(sum(r.tax_total), 0)::bigint as tax
  into v_refunds
  from public.refunds r
  where r.store_id = p_store_id and r.created_at >= p_from and r.created_at < p_to;

  select count(*)::integer as n, coalesce(sum(o.total), 0)::bigint as total
  into v_voids
  from public.orders o
  where o.store_id = p_store_id and o.voided_at >= p_from and o.voided_at < p_to;

  select jsonb_build_object(
    'cash', coalesce(sum(m.amount) filter (where m.method = 'cash'), 0)::bigint,
    'card', coalesce(sum(m.amount) filter (where m.method = 'card'), 0)::bigint,
    'other', coalesce(sum(m.amount) filter (where m.method = 'other'), 0)::bigint
  )
  into v_methods
  from (
    select p.method, p.amount - p.tip as amount
    from public.payments p
    join public.orders o on o.id = p.order_id
    where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to and o.status <> 'voided'
    union all
    select rp.method, -rp.amount
    from public.refund_payments rp
    join public.refunds r on r.id = rp.refund_id
    where r.store_id = p_store_id and r.created_at >= p_from and r.created_at < p_to
  ) m;

  return jsonb_build_object(
    'sales_count', v_sales.n,
    'gross', v_sales.gross,
    'discounts', v_sales.discounts,
    'tax', v_sales.tax,
    'sales_total', v_sales.total,
    'tips', v_sales.tips,
    'refund_count', v_refunds.n,
    'refunds_total', v_refunds.total,
    'refund_tax', v_refunds.tax,
    'net_sales', v_sales.total - v_refunds.total,
    'net_tax', v_sales.tax - v_refunds.tax,
    'average_sale', case when v_sales.n = 0 then 0 else private.div_half_even(v_sales.total, v_sales.n) end,
    'void_count', v_voids.n,
    'void_total', v_voids.total,
    'methods', v_methods
  );
end;
$$;

create function public.report_staff(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, name text, sales_count integer, sales_total bigint, refund_count integer, refunds_total bigint, void_count integer, void_total bigint, cash_void_count integer, discounts bigint, tips bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.report_guard(p_store_id, p_from, p_to);

  return query
  with sales_by as (
    select o.staff_id as sid, count(*)::integer as n, sum(o.total)::bigint as amount, sum(o.discount_total)::bigint as discount_sum, sum(o.tip)::bigint as tip_sum
    from public.orders o
    where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to and o.status <> 'voided'
    group by o.staff_id
  ),
  refunds_by as (
    select r.staff_id as sid, count(*)::integer as n, sum(r.total)::bigint as amount
    from public.refunds r
    where r.store_id = p_store_id and r.created_at >= p_from and r.created_at < p_to
    group by r.staff_id
  ),
  voids_by as (
    select o.staff_id as sid, count(*)::integer as n, sum(o.total)::bigint as amount,
      (count(*) filter (where exists (select 1 from public.payments p where p.order_id = o.id and p.method = 'cash')))::integer as cash
    from public.orders o
    where o.store_id = p_store_id and o.voided_at >= p_from and o.voided_at < p_to
    group by o.staff_id
  ),
  ids as (
    select sid from sales_by union select sid from refunds_by union select sid from voids_by
  )
  select ids.sid, coalesce(st.name, 'Former staff'),
    coalesce(s.n, 0), coalesce(s.amount, 0)::bigint,
    coalesce(r.n, 0), coalesce(r.amount, 0)::bigint,
    coalesce(v.n, 0), coalesce(v.amount, 0)::bigint, coalesce(v.cash, 0),
    coalesce(s.discount_sum, 0)::bigint,
    coalesce(s.tip_sum, 0)::bigint
  from ids
  left join sales_by s on s.sid = ids.sid
  left join refunds_by r on r.sid = ids.sid
  left join voids_by v on v.sid = ids.sid
  left join public.staff st on st.id = ids.sid
  order by coalesce(s.amount, 0) desc, 2;
end;
$$;

create function public.report_cashups(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, register text, opened_at timestamptz, closed_at timestamptz, opened_by text, closed_by text, opening_cash bigint, cash_sales bigint, cash_tips bigint, cash_refunds bigint, expected_cash bigint, counted_cash bigint, difference bigint, close_note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.report_guard(p_store_id, p_from, p_to);

  return query
  select rs.id, rg.name, rs.opened_at, rs.closed_at, op.name, cl.name,
    c.opening_cash, c.cash_sales, c.cash_tips, c.cash_refunds, c.expected_cash,
    rs.counted_cash, (rs.counted_cash - c.expected_cash)::bigint, rs.close_note
  from public.register_sessions rs
  join public.registers rg on rg.id = rs.register_id
  cross join lateral private.session_cash(rs.id) c
  left join public.staff op on op.id = rs.opened_by
  left join public.staff cl on cl.id = rs.closed_by
  where rg.store_id = p_store_id and rs.closed_at >= p_from and rs.closed_at < p_to
  order by rs.closed_at desc, rs.id;
end;
$$;

revoke execute on function public.report_staff(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_cashups(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.report_staff(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_cashups(uuid, timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 4: Run the database tests and the race test, then regenerate the types**

Run: `npx supabase db reset >/dev/null && npm run test:db && npm run test:race && npm run db:types && npx prettier --write lib/supabase/database.types.ts`
Expected:
- `Result: PASS`, including `counter_service.test.sql` 22/22 and the updated `reports`, `orders`, `register` and `schema` tests;
- the race test prints `PASS`;
- the regenerated types include `modifier_groups` and `save_modifier_group`.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: errors only where TS code now disagrees with the regenerated types. `completeSale`'s rpc call still compiles, because the new parameters are optional. If `tsc` reports errors in files later tasks change, note them and continue; Task 2 fixes them. Otherwise it is clean.

```bash
git add supabase/migrations/20261015000012_counter_service.sql supabase/tests supabase/seed.sql lib/supabase/database.types.ts
git commit -m "feat(db): modifiers, tips, kitchen categories and tip-aware cash and reports"
```

### Task 2: Shared logic — modifiers, tips, cart, sale input, catalog loading, forms

**Files:**
- Create:
  - `lib/modifiers.ts`, `lib/modifiers.test.ts`;
  - `lib/tips.ts`, `lib/tips.test.ts`;
  - `lib/catalog/modifier-form.ts`, `lib/catalog/modifier-form.test.ts`, `lib/catalog/modifier-actions.ts`.
- Modify:
  - `lib/register/cart.ts` (whole file shown), `lib/register/cart.test.ts`;
  - `lib/register/sale-schema.ts`, `lib/register/sale-schema.test.ts`;
  - `lib/register/actions.ts` (`completeSale`), `lib/register/queries.ts`;
  - `lib/catalog/queries.ts` (`loadCategories` adds `kitchen`);
  - `lib/catalog/product-form.ts`, `lib/catalog/product-form.test.ts`, `lib/catalog/product-input.ts`;
  - `lib/catalog/category-actions.ts` (adds `setCategoryKitchen`).

**Interfaces:**
- Consumes: `allocate` (`lib/checkout.ts`), `divRoundHalfEven` (`lib/tax.ts`), `parseMoney`, `formatAmount`; Task 1 tables and RPCs.
- Produces:
  - **`lib/modifiers.ts`:**
    - `ModifierOption = { id; name; priceDelta }`, `ModifierGroup = { id; name; min; max; options }`, `Selection = Record<string, string[]>`;
    - `checkSelection(groups, selection, item)`, `selectionIds`, `selectionDelta`, `selectionLabel`, `selectionKey`, `selectionFromIds`, `toggleOption`, `groupRule(min, max)`.
  - **`lib/tips.ts`:** `TIP_PRESETS`, `tipFor(total, bps)`, `allocateTip(tip, amounts)`.
  - **`lib/register/cart.ts`:**
    - `RegisterProduct` gains `kitchen: boolean`, `modifierGroups: ModifierGroup[]`;
    - `CartLine` gains `key`, `basePrice`, `optionIds`, `modifierLabel`, `kitchen`;
    - `addToCart(lines, product, variant, selection = {})`, `setQuantity(lines, key, q)`, `setLineDiscount(lines, key, d)`, `changeSelection(lines, key, product, selection)`;
    - `toRegisterCatalog(rows, storeId, rates, kitchenCategoryIds = new Set())`.
  - **`saleSchema`:** lines take `optionIds?`; the sale takes `tip?` and `orderName?`.
  - **`lib/catalog/modifier-form.ts`:** `ModifierGroupFormInput`, `parseModifierGroupForm(input, currency)`.
  - **`lib/catalog/modifier-actions.ts`:** `saveModifierGroup(input)`, `setModifierGroupActive(id, active)`.
  - **`category-actions.ts`:** `setCategoryKitchen(id, kitchen)`.
  - **`ProductFormInput`:** gains `modifierGroupIds?: string[]`.

- [ ] **Step 1: Write the failing tests**

`lib/modifiers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { checkSelection, groupRule, selectionDelta, selectionFromIds, selectionIds, selectionKey, selectionLabel, toggleOption, type ModifierGroup } from "./modifiers";

const milk: ModifierGroup = { id: "g1", name: "Milk", min: 1, max: 1, options: [{ id: "o1", name: "Whole", priceDelta: 0 }, { id: "o2", name: "Oat", priceDelta: 50 }] };
const extras: ModifierGroup = { id: "g2", name: "Extras", min: 0, max: 2, options: [{ id: "o3", name: "Shot", priceDelta: 80 }, { id: "o4", name: "Syrup", priceDelta: 40 }] };
const groups = [milk, extras];

describe("checkSelection", () => {
  it("asks for required groups and caps choices", () => {
    expect(checkSelection(groups, {}, "Latte")).toBe("Pick Milk for Latte");
    expect(checkSelection(groups, { g1: ["o2"], g2: ["o3", "o4"] }, "Latte")).toBeNull();
    expect(checkSelection([milk, { ...extras, max: 1 }], { g1: ["o1"], g2: ["o3", "o4"] }, "Latte")).toBe("Pick up to 1 Extras for Latte");
  });
  it("ignores ids that are no longer options", () => {
    expect(checkSelection(groups, { g1: ["o1"], g2: ["gone"] }, "Latte")).toBeNull();
  });
});

describe("selection helpers", () => {
  const selection = { g1: ["o2"], g2: ["o3"] };
  it("prices, labels and lists choices in group order", () => {
    expect(selectionDelta(groups, selection)).toBe(130);
    expect(selectionLabel(groups, selection)).toBe("Oat · Shot");
    expect(selectionIds(groups, selection)).toEqual(["o2", "o3"]);
    expect(selectionKey(["o3", "o2"])).toBe("o2,o3");
    expect(selectionFromIds(groups, ["o3", "o2"])).toEqual({ g1: ["o2"], g2: ["o3"] });
  });
  it("toggles like radio buttons for pick-one groups", () => {
    expect(toggleOption(milk, { g1: ["o1"] }, "o2")).toEqual({ g1: ["o2"] });
    expect(toggleOption(milk, { g1: ["o2"] }, "o2")).toEqual({ g1: [] });
    expect(toggleOption(extras, { g2: ["o3"] }, "o4")).toEqual({ g2: ["o3", "o4"] });
  });
  it("describes group rules", () => {
    expect(groupRule(1, 1)).toBe("Pick 1");
    expect(groupRule(0, 1)).toBe("Optional");
    expect(groupRule(0, 3)).toBe("Up to 3");
    expect(groupRule(1, 2)).toBe("Pick 1–2");
  });
});
```

`lib/tips.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { TIP_PRESETS, allocateTip, tipFor } from "./tips";

describe("tips", () => {
  it("works out percentage tips half-even", () => {
    expect(tipFor(1375, 1500)).toBe(206);
    expect(tipFor(509, 1500)).toBe(76);
    expect(tipFor(15, 1000)).toBe(2);
    expect(tipFor(5, 1000)).toBe(0);
    expect(TIP_PRESETS.map((preset) => preset.label)).toEqual(["No tip", "10%", "15%", "20%"]);
  });
  it("splits a tip across payments exactly, like the database", () => {
    expect(allocateTip(206, [1000, 581])).toEqual([130, 76]);
    expect(allocateTip(1, [100, 100])).toEqual([1, 0]);
    expect(allocateTip(0, [500])).toEqual([0]);
  });
});
```

`lib/catalog/modifier-form.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseModifierGroupForm, type ModifierGroupFormInput } from "./modifier-form";

const base: ModifierGroupFormInput = {
  name: " Milk ",
  min: "1",
  max: "1",
  active: true,
  options: [
    { name: "Whole", price: "", active: true },
    { name: "Oat", price: "0.50", active: true },
    { name: "", price: "", active: true },
  ],
};

describe("parseModifierGroupForm", () => {
  it("builds the payload in minor units and drops blank rows", () => {
    expect(parseModifierGroupForm(base, "USD")).toEqual({
      ok: true,
      payload: {
        name: "Milk",
        min_choices: 1,
        max_choices: 1,
        active: true,
        options: [
          { name: "Whole", price_delta: 0, active: true },
          { name: "Oat", price_delta: 50, active: true },
        ],
      },
    });
  });
  it("accepts negative price changes and keeps ids", () => {
    const result = parseModifierGroupForm({ ...base, id: "g", options: [{ id: "o", name: "No cheese", price: "-0.50", active: true }] }, "USD");
    expect(result).toMatchObject({ ok: true, payload: { id: "g", options: [{ id: "o", name: "No cheese", price_delta: -50, active: true }] } });
  });
  it("explains what's wrong", () => {
    expect(parseModifierGroupForm({ ...base, name: "", min: "2", max: "1", options: [] }, "USD")).toEqual({
      ok: false,
      errors: { name: "Enter a group name", max: "Max must be at least min", options: "Add at least one option" },
    });
    expect(parseModifierGroupForm({ ...base, options: [{ name: "Oat", price: "", active: true }, { name: "oat", price: "x", active: true }] }, "USD")).toEqual({
      ok: false,
      errors: { options: "Option names must be different", "price-1": "Enter a price change, like 0.50" },
    });
    expect(parseModifierGroupForm({ ...base, min: "2", max: "2", options: [{ name: "Oat", price: "", active: true }] }, "USD")).toEqual({
      ok: false,
      errors: { min: "Min can't be more than the active options" },
    });
  });
});
```

`lib/register/cart.test.ts` changes:
- In "adds, increments and labels lines", replace the `expect(lines).toEqual([...])` line with:
```ts
    expect(lines).toEqual([
      {
        key: "v1", variantId: "v1", label: "Latte – Small", sku: "LAT-S", basePrice: 420, price: 420, optionIds: [], modifierLabel: "", kitchen: false,
        rateBps: 825, track: true, stock: 0, quantity: 2, discountBps: null, discountAmount: null,
      },
    ]);
```
- Update the import to `import { addToCart, cartInputs, changeSelection, discountInput, findByCode, isOverStock, searchProducts, setLineDiscount, setQuantity, toRegisterCatalog, type RegisterCatalogRow, type RegisterProduct } from "./cart";`.
- Append at the end:
```ts
describe("modifiers in the cart", () => {
  const latte: RegisterProduct = {
    id: "p1",
    name: "Latte",
    categoryId: "c1",
    kitchen: true,
    modifierGroups: [{ id: "g1", name: "Milk", min: 1, max: 1, options: [{ id: "o1", name: "Whole", priceDelta: 0 }, { id: "o2", name: "Oat", priceDelta: 50 }] }],
    variants: [{ id: "v1", name: "Small", sku: "LAT-S", barcode: null, price: 420, rateBps: 825, track: false, quantity: 0 }],
  };
  it("prices and keys lines by their choices", () => {
    let lines = addToCart([], latte, latte.variants[0], { g1: ["o2"] });
    lines = addToCart(lines, latte, latte.variants[0], { g1: ["o2"] });
    lines = addToCart(lines, latte, latte.variants[0], { g1: ["o1"] });
    expect(lines.map((line) => [line.key, line.price, line.modifierLabel, line.quantity, line.kitchen])).toEqual([
      ["v1|o2", 470, "Oat", 2, true],
      ["v1|o1", 420, "Whole", 1, true],
    ]);
    expect(cartInputs(lines)[0].price).toBe(470);
  });
  it("merges a line into a matching one when its choices change", () => {
    let lines = addToCart([], latte, latte.variants[0], { g1: ["o2"] });
    lines = addToCart(lines, latte, latte.variants[0], { g1: ["o1"] });
    lines = changeSelection(lines, "v1|o1", latte, { g1: ["o2"] });
    expect(lines.map((line) => [line.key, line.quantity])).toEqual([["v1|o2", 2]]);
  });
  it("reads groups and the kitchen flag from the catalog", () => {
    const [product] = toRegisterCatalog(
      [
        {
          id: "p1", name: "Latte", active: true, category_id: "c1", tax_class_id: "t1",
          product_variants: [{ id: "v1", name: "Small", sku: "LAT-S", barcode: null, price: 420, active: true, sort_order: 0, stock_levels: [] }],
          product_modifier_groups: [
            { sort_order: 1, group: { id: "g2", name: "Old", min_choices: 1, max_choices: 1, active: false, modifier_options: [] } },
            { sort_order: 0, group: { id: "g1", name: "Milk", min_choices: 1, max_choices: 1, active: true, modifier_options: [
              { id: "o2", name: "Oat", price_delta: 50, active: true, sort_order: 1 },
              { id: "o1", name: "Whole", price_delta: 0, active: true, sort_order: 0 },
              { id: "o3", name: "Cream", price_delta: 60, active: false, sort_order: 2 },
            ] } },
          ],
        },
      ],
      "s1",
      [],
      new Set(["c1"]),
    );
    expect(product.kitchen).toBe(true);
    expect(product.modifierGroups).toEqual([{ id: "g1", name: "Milk", min: 1, max: 1, options: [{ id: "o1", name: "Whole", priceDelta: 0 }, { id: "o2", name: "Oat", priceDelta: 50 }] }]);
  });
});
```

`lib/register/sale-schema.test.ts`: append inside `describe("saleSchema", …)`:
```ts
  it("checks choices, tips and the order name", () => {
    const sale = { sessionId: id, lines: [{ variantId: id, quantity: 1, optionIds: [id] }], orderDiscount: null, approvalId: null, customerId: null, payments: [{ method: "card", amount: 100 }], tip: 10, orderName: "Sam" };
    expect(saleSchema.safeParse(sale).success).toBe(true);
    expect(saleSchema.safeParse({ ...sale, tip: -1 }).success).toBe(false);
    expect(saleSchema.safeParse({ ...sale, orderName: "x".repeat(41) }).success).toBe(false);
    expect(saleSchema.safeParse({ ...sale, lines: [{ variantId: id, quantity: 1, optionIds: ["nope"] }] }).success).toBe(false);
  });
```

`lib/catalog/product-form.test.ts`: append inside `describe("parseProductForm", …)`:
```ts
  it("passes modifier groups through only when the form has them", () => {
    const group = "00000000-0000-4000-8000-0000000000cc";
    const withGroups = parseProductForm({ ...base, modifierGroupIds: [group, "bad"] }, "EUR");
    expect(withGroups.ok && withGroups.product.modifier_group_ids).toEqual([group]);
    const without = parseProductForm(base, "EUR");
    expect(without.ok && "modifier_group_ids" in without.product).toBe(false);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/modifiers.test.ts lib/tips.test.ts lib/catalog/modifier-form.test.ts lib/register lib/catalog/product-form.test.ts`
Expected: FAIL:
- `Cannot find module './modifiers'`, `'./tips'` and `'./modifier-form'`;
- cart tests fail on the new fields and `changeSelection`;
- the sale-schema test accepts `tip: -1`;
- the product-form test has no `modifier_group_ids`.

- [ ] **Step 3: Implement**

`lib/modifiers.ts`:
```ts
export type ModifierOption = { id: string; name: string; priceDelta: number };
export type ModifierGroup = { id: string; name: string; min: number; max: number; options: ModifierOption[] };
export type Selection = Record<string, string[]>;

function chosen(group: ModifierGroup, selection: Selection): ModifierOption[] {
  const picked = new Set(selection[group.id] ?? []);
  return group.options.filter((option) => picked.has(option.id));
}

export function checkSelection(groups: ModifierGroup[], selection: Selection, item: string): string | null {
  for (const group of groups) {
    const count = chosen(group, selection).length;
    if (count < group.min) return `Pick ${group.name} for ${item}`;
    if (count > group.max) return `Pick up to ${group.max} ${group.name} for ${item}`;
  }
  return null;
}

function selected(groups: ModifierGroup[], selection: Selection): ModifierOption[] {
  return groups.flatMap((group) => chosen(group, selection));
}

export function selectionIds(groups: ModifierGroup[], selection: Selection): string[] {
  return selected(groups, selection).map((option) => option.id);
}

export function selectionDelta(groups: ModifierGroup[], selection: Selection): number {
  return selected(groups, selection).reduce((sum, option) => sum + option.priceDelta, 0);
}

export function selectionLabel(groups: ModifierGroup[], selection: Selection): string {
  return selected(groups, selection)
    .map((option) => option.name)
    .join(" · ");
}

export function selectionKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

export function selectionFromIds(groups: ModifierGroup[], ids: string[]): Selection {
  const wanted = new Set(ids);
  const selection: Selection = {};
  for (const group of groups) {
    const picked = group.options.filter((option) => wanted.has(option.id)).map((option) => option.id);
    if (picked.length > 0) selection[group.id] = picked;
  }
  return selection;
}

export function toggleOption(group: ModifierGroup, selection: Selection, optionId: string): Selection {
  const current = selection[group.id] ?? [];
  if (current.includes(optionId)) return { ...selection, [group.id]: current.filter((id) => id !== optionId) };
  if (group.max === 1) return { ...selection, [group.id]: [optionId] };
  return { ...selection, [group.id]: [...current, optionId] };
}

export function groupRule(min: number, max: number): string {
  if (min === max) return `Pick ${min}`;
  if (min === 0) return max === 1 ? "Optional" : `Up to ${max}`;
  return `Pick ${min}–${max}`;
}
```

`lib/tips.ts`:
```ts
import { allocate } from "./checkout";
import { divRoundHalfEven } from "./tax";

export const TIP_PRESETS = [
  { bps: 0, label: "No tip" },
  { bps: 1000, label: "10%" },
  { bps: 1500, label: "15%" },
  { bps: 2000, label: "20%" },
];

export function tipFor(total: number, bps: number): number {
  return Number(divRoundHalfEven(BigInt(total) * BigInt(bps), 10_000n));
}

export function allocateTip(tip: number, amounts: number[]): number[] {
  return allocate(tip, amounts);
}
```

`lib/register/cart.ts` (replace the whole file):
```ts
import type { CartLineInput, OrderDiscountInput } from "@/lib/checkout";
import { selectionDelta, selectionIds, selectionKey, selectionLabel, type ModifierGroup, type Selection } from "@/lib/modifiers";

export type RegisterVariant = { id: string; name: string; sku: string; barcode: string | null; price: number; rateBps: number; track: boolean; quantity: number };
export type RegisterProduct = { id: string; name: string; categoryId: string | null; kitchen: boolean; modifierGroups: ModifierGroup[]; variants: RegisterVariant[] };
export type RegisterCatalogRow = {
  id: string;
  name: string;
  active: boolean;
  category_id: string | null;
  tax_class_id: string;
  product_variants: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    price: number;
    active: boolean;
    sort_order: number;
    stock_levels: { store_id: string; quantity: number; track: boolean }[];
  }[];
  product_modifier_groups?: {
    sort_order: number;
    group: {
      id: string;
      name: string;
      min_choices: number;
      max_choices: number;
      active: boolean;
      modifier_options: { id: string; name: string; price_delta: number; active: boolean; sort_order: number }[];
    } | null;
  }[];
};
export type CartLine = {
  key: string;
  variantId: string;
  label: string;
  sku: string;
  basePrice: number;
  price: number;
  optionIds: string[];
  modifierLabel: string;
  kitchen: boolean;
  rateBps: number;
  track: boolean;
  stock: number;
  quantity: number;
  discountBps: number | null;
  discountAmount: number | null;
};
export type Discount = { bps: number } | { amount: number } | null;

export function toRegisterCatalog(
  rows: RegisterCatalogRow[],
  storeId: string,
  rates: { tax_class_id: string; rate_bps: number }[],
  kitchenCategoryIds: ReadonlySet<string> = new Set(),
): RegisterProduct[] {
  const rateFor = new Map(rates.map((rate) => [rate.tax_class_id, rate.rate_bps]));
  return rows
    .filter((row) => row.active)
    .map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      kitchen: row.category_id !== null && kitchenCategoryIds.has(row.category_id),
      modifierGroups: (row.product_modifier_groups ?? [])
        .filter((entry) => entry.group?.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((entry) => {
          const group = entry.group!;
          return {
            id: group.id,
            name: group.name,
            min: group.min_choices,
            max: group.max_choices,
            options: group.modifier_options
              .filter((option) => option.active)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((option) => ({ id: option.id, name: option.name, priceDelta: option.price_delta })),
          };
        }),
      variants: row.product_variants
        .filter((variant) => variant.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((variant) => {
          const level = variant.stock_levels.find((entry) => entry.store_id === storeId);
          return {
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            barcode: variant.barcode,
            price: variant.price,
            rateBps: rateFor.get(row.tax_class_id) ?? 0,
            track: level?.track ?? false,
            quantity: level?.quantity ?? 0,
          };
        }),
    }))
    .filter((product) => product.variants.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findByCode(products: RegisterProduct[], code: string): { product: RegisterProduct; variant: RegisterVariant } | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.barcode === trimmed || variant.sku.toLowerCase() === trimmed.toLowerCase()) return { product, variant };
    }
  }
  return null;
}

export function searchProducts(products: RegisterProduct[], query: string, categoryId: string): RegisterProduct[] {
  const needle = query.trim().toLowerCase();
  return products.filter(
    (product) =>
      (!categoryId || product.categoryId === categoryId) &&
      (!needle || product.name.toLowerCase().includes(needle) || product.variants.some((variant) => variant.sku.toLowerCase().includes(needle))),
  );
}

export function variantLabel(product: RegisterProduct, variant: RegisterVariant): string {
  return variant.name === "Default" ? product.name : `${product.name} – ${variant.name}`;
}

function buildLine(product: RegisterProduct, variant: RegisterVariant, selection: Selection, quantity: number, discountBps: number | null, discountAmount: number | null): CartLine {
  const optionIds = selectionIds(product.modifierGroups, selection);
  return {
    key: optionIds.length > 0 ? `${variant.id}|${selectionKey(optionIds)}` : variant.id,
    variantId: variant.id,
    label: variantLabel(product, variant),
    sku: variant.sku,
    basePrice: variant.price,
    price: variant.price + selectionDelta(product.modifierGroups, selection),
    optionIds,
    modifierLabel: selectionLabel(product.modifierGroups, selection),
    kitchen: product.kitchen,
    rateBps: variant.rateBps,
    track: variant.track,
    stock: variant.quantity,
    quantity,
    discountBps,
    discountAmount,
  };
}

export function addToCart(lines: CartLine[], product: RegisterProduct, variant: RegisterVariant, selection: Selection = {}): CartLine[] {
  const line = buildLine(product, variant, selection, 1, null, null);
  if (lines.some((existing) => existing.key === line.key)) {
    return lines.map((existing) => (existing.key === line.key ? { ...existing, quantity: Math.min(9_999, existing.quantity + 1) } : existing));
  }
  return [...lines, line];
}

export function changeSelection(lines: CartLine[], key: string, product: RegisterProduct, selection: Selection): CartLine[] {
  const line = lines.find((entry) => entry.key === key);
  const variant = line ? product.variants.find((entry) => entry.id === line.variantId) : undefined;
  if (!line || !variant) return lines;
  const next = buildLine(product, variant, selection, line.quantity, line.discountBps, line.discountAmount);
  if (next.key === key) return lines.map((entry) => (entry.key === key ? next : entry));
  if (lines.some((entry) => entry.key === next.key)) {
    return lines
      .filter((entry) => entry.key !== key)
      .map((entry) => (entry.key === next.key ? { ...entry, quantity: Math.min(9_999, entry.quantity + line.quantity) } : entry));
  }
  return lines.map((entry) => (entry.key === key ? next : entry));
}

export function setQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.key !== key);
  return lines.map((line) => (line.key === key ? { ...line, quantity: Math.min(9_999, Math.floor(quantity)) } : line));
}

export function setLineDiscount(lines: CartLine[], key: string, discount: Discount): CartLine[] {
  return lines.map((line) =>
    line.key === key
      ? {
          ...line,
          discountBps: discount && "bps" in discount ? discount.bps : null,
          discountAmount: discount && "amount" in discount ? discount.amount : null,
        }
      : line,
  );
}

export function cartInputs(lines: CartLine[]): CartLineInput[] {
  return lines.map((line) => ({ price: line.price, quantity: line.quantity, rateBps: line.rateBps, discountBps: line.discountBps, discountAmount: line.discountAmount }));
}

export function isOverStock(line: CartLine): boolean {
  return line.track && line.quantity > line.stock;
}

export function discountInput(discount: Discount): OrderDiscountInput {
  if (!discount) return null;
  return "bps" in discount ? { bps: discount.bps } : { amount: discount.amount };
}
```

`lib/register/sale-schema.ts`, in the line object, add `optionIds: z.array(z.guid()).max(50).optional(),` after `discountAmount`. In the top-level object, after `payments: …`, add:
```ts
  tip: money.optional(),
  orderName: z.string().trim().max(40).optional(),
```

`lib/register/actions.ts` (`completeSale`):
- in `p_lines`, add `option_ids: line.optionIds ?? [],`;
- after `p_payments: …`, add `p_tip: sale.tip ?? 0,` and `p_order_name: sale.orderName || undefined,`.

`lib/register/queries.ts` (replace `loadRegisterCatalog`):
```ts
export async function loadRegisterCatalog(supabase: SupabaseClient<Database>, storeId: string): Promise<RegisterProduct[]> {
  const [rows, rates, kitchen] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("products")
        .select(
          "id, name, active, category_id, tax_class_id, product_variants(id, name, sku, barcode, price, active, sort_order, stock_levels(store_id, quantity, track)), product_modifier_groups(sort_order, group:modifier_groups(id, name, min_choices, max_choices, active, modifier_options(id, name, price_delta, active, sort_order)))",
        )
        .eq("active", true)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) => supabase.from("tax_rates").select("tax_class_id, rate_bps").eq("store_id", storeId).order("id").range(from, to)),
    fetchAll((from, to) => supabase.from("categories").select("id").eq("kitchen", true).order("id").range(from, to)),
  ]);
  return toRegisterCatalog(rows as unknown as RegisterCatalogRow[], storeId, rates, new Set(kitchen.map((row) => row.id)));
}
```

`lib/catalog/queries.ts`: `loadCategories` selects `"id, name, sort_order, kitchen"`.

`lib/catalog/product-form.ts`:
- `ProductFormInput` gains `modifierGroupIds?: string[];`;
- `SaveProductPayload` gains `modifier_group_ids?: string[];`;
- in the returned `product` object, after `active: input.active,`, add `...(input.modifierGroupIds ? { modifier_group_ids: input.modifierGroupIds.filter((id) => GUID.test(id)) } : {}),`.

`lib/catalog/product-input.ts`: `productFormInputSchema` gains `modifierGroupIds: z.array(z.string().max(100)).max(50).optional(),`.

`lib/catalog/modifier-form.ts`:
```ts
import { parseMoney } from "@/lib/money";

export type ModifierGroupFormInput = {
  id?: string;
  name: string;
  min: string;
  max: string;
  active: boolean;
  options: { id?: string; name: string; price: string; active: boolean }[];
};

export type ModifierGroupPayload = {
  id?: string;
  name: string;
  min_choices: number;
  max_choices: number;
  active: boolean;
  options: { id?: string; name: string; price_delta: number; active: boolean }[];
};

function whole(value: string): number | null {
  return /^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : null;
}

export function parseModifierGroupForm(input: ModifierGroupFormInput, currency: string): { ok: true; payload: ModifierGroupPayload } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name) errors.name = "Enter a group name";
  else if (name.length > 60) errors.name = "Keep it under 60 characters";
  const min = whole(input.min);
  const max = whole(input.max);
  if (min === null) errors.min = "Enter 0 or more";
  if (max === null || max < 1) errors.max = "Enter 1 or more";
  else if (min !== null && max < min) errors.max = "Max must be at least min";

  const options: ModifierGroupPayload["options"] = [];
  const seen = new Set<string>();
  input.options.forEach((option, index) => {
    const optionName = option.name.trim();
    if (!optionName && !option.price.trim()) return;
    if (!optionName) errors[`option-${index}`] = "Enter a name";
    else if (optionName.length > 60) errors[`option-${index}`] = "Keep it under 60 characters";
    else if (seen.has(optionName.toLowerCase())) errors.options = "Option names must be different";
    seen.add(optionName.toLowerCase());
    const delta = option.price.trim() === "" ? 0 : parseMoney(option.price, currency);
    if (delta === null || Math.abs(delta) > 1_000_000) errors[`price-${index}`] = "Enter a price change, like 0.50";
    options.push({ ...(option.id ? { id: option.id } : {}), name: optionName, price_delta: delta ?? 0, active: option.active });
  });
  if (options.length === 0) errors.options = "Add at least one option";
  else if (min !== null && !errors.max && min > options.filter((option) => option.active).length) errors.min = "Min can't be more than the active options";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: { ...(input.id ? { id: input.id } : {}), name, min_choices: min ?? 0, max_choices: max ?? 1, active: input.active, options },
  };
}
```

`lib/catalog/modifier-actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { catalogDbError } from "./db-errors";
import { parseModifierGroupForm, type ModifierGroupFormInput } from "./modifier-form";

const shape = z.object({
  id: z.guid().optional(),
  name: z.string().max(200),
  min: z.string().max(10),
  max: z.string().max(10),
  active: z.boolean(),
  options: z.array(z.object({ id: z.guid().optional(), name: z.string().max(200), price: z.string().max(30), active: z.boolean() })).max(50),
});

type Result = { ok: true } | { ok: false; error?: string; errors?: Record<string, string> };

function dbMessage(error: { code?: string; message?: string }): string {
  if (error.code === "22023" && error.message) return `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.`;
  return catalogDbError(error);
}

export async function saveModifierGroup(input: ModifierGroupFormInput): Promise<Result> {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const parsedShape = shape.safeParse(input);
  if (!parsedShape.success) return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const parsed = parseModifierGroupForm(parsedShape.data, store?.currency ?? "USD");
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_modifier_group", { p_group: parsed.payload });
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath("/products", "layout");
  revalidatePath("/register");
  return { ok: true };
}

export async function setModifierGroupActive(id: string, active: boolean): Promise<Result> {
  await requireRole("manager");
  if (!z.guid().safeParse(id).success) return { ok: false, error: "That group no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("modifier_groups").update({ active }).eq("id", id).select("id");
  if (error) return { ok: false, error: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: "That group no longer exists." };
  revalidatePath("/products", "layout");
  revalidatePath("/register");
  return { ok: true };
}
```

`lib/catalog/category-actions.ts` (append):
```ts
export async function setCategoryKitchen(id: string, kitchen: boolean): Promise<ActionResult> {
  await requireRole("manager");
  if (!z.guid().safeParse(id).success) return { ok: false, error: GONE };
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").update({ kitchen }).eq("id", id).select("id");
  if (error) return { ok: false, error: catalogDbError(error) };
  if (!data || data.length === 0) return { ok: false, error: GONE };
  revalidatePath("/products", "layout");
  revalidatePath("/register");
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run lib && npx tsc --noEmit`
Expected: the unit tests PASS. `tsc` may report errors only in `components/register/*` and pages that still call `setQuantity`/`setLineDiscount` with `variantId` or build `RegisterProduct` without the new fields. Note them; Task 4 fixes them. No errors are expected under `lib/`.

- [ ] **Step 5: Commit**

```bash
git add lib
git commit -m "feat(modifiers): selection rules, tips, modifier-aware cart and catalog actions"
```

### Task 3: Catalog screens — modifier groups, product attachments, kitchen categories

**Files:**
- Create: `app/(app)/products/modifiers/page.tsx`, `components/products/modifier-groups-table.tsx`, `components/products/modifier-group-dialog.tsx`
- Modify:
  - `components/products/product-form.tsx`, `app/(app)/products/[id]/page.tsx`, `app/(app)/products/new/page.tsx`, `app/(app)/products/page.tsx`;
  - `components/products/categories-dialog.tsx`.

**Interfaces:**
- Consumes: Task 2 `saveModifierGroup`, `setModifierGroupActive`, `setCategoryKitchen`, `groupRule`, `ModifierGroupFormInput`, `ProductFormInput.modifierGroupIds`, and `loadCategories` now returning `kitchen`.
- Produces: **accessible names** "New group", "Save group", "Name", "Min choices", "Max choices", "Option name {n}", "Price change {n}", "Option {n} active", "Add option", "Archive {name}" / "Restore {name}", "Edit {name}"; a product-page checkbox named "{group} …"; and the category checkbox "{category} goes to the kitchen".

- [ ] **Step 1: Modifier groups page, table and dialog**

`components/products/modifier-group-dialog.tsx`:
```tsx
"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Checkbox } from "@/components/_ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { saveModifierGroup } from "@/lib/catalog/modifier-actions";
import type { ModifierGroupFormInput } from "@/lib/catalog/modifier-form";
import { formatAmount } from "@/lib/money";

export type ModifierGroupRow = {
  id: string;
  name: string;
  min_choices: number;
  max_choices: number;
  active: boolean;
  modifier_options: { id: string; name: string; price_delta: number; active: boolean; sort_order: number }[];
  product_modifier_groups: { product_id: string }[];
};

type ModifierGroupDialogProps = { group?: ModifierGroupRow; currency: string; trigger: ReactNode };

function toInput(group: ModifierGroupRow | undefined, currency: string): ModifierGroupFormInput {
  if (!group) {
    return { name: "", min: "0", max: "1", active: true, options: [{ name: "", price: "", active: true }, { name: "", price: "", active: true }] };
  }
  return {
    id: group.id,
    name: group.name,
    min: String(group.min_choices),
    max: String(group.max_choices),
    active: group.active,
    options: [...group.modifier_options]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => ({ id: option.id, name: option.name, price: option.price_delta === 0 ? "" : formatAmount(option.price_delta, currency), active: option.active })),
  };
}

function GroupForm({ group, currency, onSaved }: { group?: ModifierGroupRow; currency: string; onSaved: () => void }) {
  const [values, setValues] = useState<ModifierGroupFormInput>(() => toInput(group, currency));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setOption(index: number, patch: Partial<ModifierGroupFormInput["options"][number]>) {
    setValues((current) => ({ ...current, options: current.options.map((option, i) => (i === index ? { ...option, ...patch } : option)) }));
  }

  function moveOption(index: number, direction: -1 | 1) {
    setValues((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.options.length) return current;
      const options = [...current.options];
      [options[index], options[target]] = [options[target], options[index]];
      return { ...current, options };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await saveModifierGroup(values);
      if (result.ok) onSaved();
      else {
        setErrors(result.errors ?? {});
        setError(result.error ?? null);
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>{group ? `Edit ${group.name}` : "New modifier group"}</DialogTitle>
        <DialogDescription>Min 1 and max 1 makes a required pick-one group. Leave min at 0 for optional extras.</DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Name" htmlFor="mg-name" error={errors.name}>
        <Input id="mg-name" value={values.name} maxLength={60} onChange={(event) => setValues({ ...values, name: event.target.value })} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min choices" htmlFor="mg-min" error={errors.min}>
          <Input id="mg-min" inputMode="numeric" value={values.min} onChange={(event) => setValues({ ...values, min: event.target.value })} />
        </Field>
        <Field label="Max choices" htmlFor="mg-max" error={errors.max}>
          <Input id="mg-max" inputMode="numeric" value={values.max} onChange={(event) => setValues({ ...values, max: event.target.value })} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="eyebrow-style text-soft mb-2 font-normal">Options</legend>
        {errors.options && <span role="alert" className="caption-style text-danger">{errors.options}</span>}
        {values.options.map((option, index) => (
          <div key={option.id ?? `new-${index}`} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Option name ${index + 1}`} className="min-w-[8em] flex-1" maxLength={60} value={option.name} onChange={(event) => setOption(index, { name: event.target.value })} />
              <Input aria-label={`Price change ${index + 1}`} placeholder="0.00" inputMode="decimal" className="w-[6em]" value={option.price} onChange={(event) => setOption(index, { price: event.target.value })} />
              <Checkbox aria-label={`Option ${index + 1} active`} checked={option.active} onCheckedChange={(checked) => setOption(index, { active: checked === true })} />
              <Button type="button" variant="ghost" size="sm" aria-label={`Move option ${index + 1} up`} disabled={index === 0} onClick={() => moveOption(index, -1)}>↑</Button>
              <Button type="button" variant="ghost" size="sm" aria-label={`Move option ${index + 1} down`} disabled={index === values.options.length - 1} onClick={() => moveOption(index, 1)}>↓</Button>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove option ${index + 1}`} onClick={() => setValues({ ...values, options: values.options.filter((_, i) => i !== index) })}>
                Remove
              </Button>
            </div>
            {(errors[`option-${index}`] || errors[`price-${index}`]) && (
              <span role="alert" className="caption-style text-danger">{errors[`option-${index}`] ?? errors[`price-${index}`]}</span>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" size="md" className="self-start" onClick={() => setValues({ ...values, options: [...values.options, { name: "", price: "", active: true }] })}>
          Add option
        </Button>
      </fieldset>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" disabled={pending}>{pending ? "Saving…" : "Save group"}</Button>
      </DialogFooter>
    </form>
  );
}

export default function ModifierGroupDialog({ group, currency, trigger }: ModifierGroupDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-[36em]">
        <GroupForm
          key={openCount}
          group={group}
          currency={currency}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

`components/products/modifier-groups-table.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import ModifierGroupDialog, { type ModifierGroupRow } from "./modifier-group-dialog";
import { setModifierGroupActive } from "@/lib/catalog/modifier-actions";
import { groupRule } from "@/lib/modifiers";

export default function ModifierGroupsTable({ groups, currency }: { groups: ModifierGroupRow[]; currency: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function toggle(group: ModifierGroupRow) {
    setError(null);
    try {
      const result = await setModifierGroupActive(group.id, !group.active);
      if (!result.ok) setError(result.error ?? "Something went wrong. Try again.");
      else router.refresh();
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <span role="alert" className="caption-style text-danger px-4">{error}</span>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead className="text-right">Options</TableHead>
            <TableHead className="text-right">Products</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell>{group.name}</TableCell>
              <TableCell>{groupRule(group.min_choices, group.max_choices)}</TableCell>
              <TableCell className="text-right tabular-nums">{group.modifier_options.filter((option) => option.active).length}</TableCell>
              <TableCell className="text-right tabular-nums">{group.product_modifier_groups.length}</TableCell>
              <TableCell><Tag tone={group.active ? "green" : "neutral"} size="sm">{group.active ? "Active" : "Archived"}</Tag></TableCell>
              <TableCell className="text-right">
                <span className="inline-flex gap-1">
                  <ModifierGroupDialog group={group} currency={currency} trigger={<Button variant="ghost" size="sm" aria-label={`Edit ${group.name}`}>Edit</Button>} />
                  <Button variant="ghost" size="sm" aria-label={`${group.active ? "Archive" : "Restore"} ${group.name}`} onClick={() => toggle(group)}>
                    {group.active ? "Archive" : "Restore"}
                  </Button>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

`app/(app)/products/modifiers/page.tsx`:
```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ModifierGroupDialog, { type ModifierGroupRow } from "@/components/products/modifier-group-dialog";
import ModifierGroupsTable from "@/components/products/modifier-groups-table";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Modifiers" };

export default async function ModifiersPage() {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const currency = store?.currency ?? "USD";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modifier_groups")
    .select("id, name, min_choices, max_choices, active, sort_order, modifier_options(id, name, price_delta, active, sort_order), product_modifier_groups(product_id)")
    .order("active", { ascending: false })
    .order("sort_order")
    .order("name");
  if (error) throw error;
  const groups = (data ?? []) as unknown as ModifierGroupRow[];

  return (
    <section id="modifiers" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title="Modifiers"
        actions={
          <>
            <Button href="/products" variant="ghost" size="md">Products</Button>
            <ModifierGroupDialog currency={currency} trigger={<Button variant="primary" size="md">New group</Button>} />
          </>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        {groups.length === 0 ? (
          <EmptyState title="No modifier groups yet" description="Create groups like Milk or Extras, then attach them to products on each product's page." />
        ) : (
          <ModifierGroupsTable groups={groups} currency={currency} />
        )}
      </ScrollArea>
    </section>
  );
}
```

`app/(app)/products/page.tsx`: in the header actions, insert `<Button href="/products/modifiers" variant="ghost" size="md">Modifiers</Button>` after `<CategoriesDialog categories={categories} />`.

- [ ] **Step 2: Attach groups on the product page**

`components/products/product-form.tsx`:
- Add the imports `import Link from "next/link";` and `import { groupRule } from "@/lib/modifiers";`.
- `ProductFormProps` gains `modifierGroups?: { id: string; name: string; min_choices: number; max_choices: number }[];`. Destructure `modifierGroups` in the component signature.
- Inside the component, before `return (`, add:
```tsx
  const attached = values.modifierGroupIds ?? [];
  const orderedGroups = modifierGroups
    ? [...attached.flatMap((id) => modifierGroups.filter((group) => group.id === id)), ...modifierGroups.filter((group) => !attached.includes(group.id))]
    : [];

  function toggleGroup(id: string, on: boolean) {
    setValues((current) => {
      const ids = current.modifierGroupIds ?? [];
      return { ...current, modifierGroupIds: on ? [...ids.filter((entry) => entry !== id), id] : ids.filter((entry) => entry !== id) };
    });
  }

  function moveGroup(id: string, direction: -1 | 1) {
    setValues((current) => {
      const ids = [...(current.modifierGroupIds ?? [])];
      const index = ids.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return current;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return { ...current, modifierGroupIds: ids };
    });
  }
```
- Immediately before the submit button's wrapping element (the block containing `{pending ? "Saving…" : values.id ? "Save product" : "Create product"}`), add:
```tsx
      {modifierGroups && (
        <section className="flex flex-col gap-3">
          <h2>Modifier groups</h2>
          {orderedGroups.length === 0 ? (
            <p className="text-subtle">
              No groups yet. <Link href="/products/modifiers" className="underline underline-offset-2">Create one</Link> to offer choices like milk or extras.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orderedGroups.map((group) => {
                const on = attached.includes(group.id);
                const position = attached.indexOf(group.id);
                return (
                  <li key={group.id} className="flex items-center gap-2">
                    <Checkbox id={`group-${group.id}`} checked={on} onCheckedChange={(checked) => toggleGroup(group.id, checked === true)} />
                    <Label htmlFor={`group-${group.id}`}>
                      {group.name} <span className="caption-style text-soft">{groupRule(group.min_choices, group.max_choices)}</span>
                    </Label>
                    {on && (
                      <span className="ml-auto flex gap-1">
                        <Button type="button" variant="ghost" size="sm" aria-label={`Move ${group.name} up`} disabled={position === 0} onClick={() => moveGroup(group.id, -1)}>↑</Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Move ${group.name} down`} disabled={position === attached.length - 1} onClick={() => moveGroup(group.id, 1)}>↓</Button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
```

`app/(app)/products/[id]/page.tsx`:
- In the `Promise.all`, add two queries:
  - `supabase.from("modifier_groups").select("id, name, min_choices, max_choices").eq("active", true).order("sort_order").order("name")`, as `{ data: modifierGroups }`;
  - `supabase.from("product_modifier_groups").select("group_id, sort_order").eq("product_id", id).order("sort_order")`, as `{ data: attachedGroups }`.
- Change `initial={toProductFormInput(product, variants ?? [], store.id, store.currency)}` to `initial={{ ...toProductFormInput(product, variants ?? [], store.id, store.currency), modifierGroupIds: (attachedGroups ?? []).map((entry) => entry.group_id) }}`.
- Add the prop `modifierGroups={modifierGroups ?? []}`.

`app/(app)/products/new/page.tsx`:
- Load `const { data: modifierGroups } = await supabase.from("modifier_groups").select("id, name, min_choices, max_choices").eq("active", true).order("sort_order").order("name");`, using the page's existing supabase client.
- Pass `modifierGroups={modifierGroups ?? []}` to `ProductForm`.

- [ ] **Step 3: Kitchen switch on categories**

`components/products/categories-dialog.tsx`:
- `type Category = { id: string; name: string; kitchen: boolean };`.
- Add the imports `import { useTransition } from "react";` (merge into the existing react import), `import { Checkbox } from "@/components/_ui/checkbox";`, and `setCategoryKitchen` from `@/lib/catalog/category-actions`.
- In `CategoryRow`, add:
```tsx
  const [kitchen, setKitchen] = useState(category.kitchen);
  const [kitchenError, setKitchenError] = useState<string | null>(null);
  const [, startKitchen] = useTransition();

  function changeKitchen(next: boolean) {
    setKitchen(next);
    setKitchenError(null);
    startKitchen(async () => {
      const result = await setCategoryKitchen(category.id, next);
      if (!result?.ok) {
        setKitchen(!next);
        setKitchenError(result && !result.ok ? result.error ?? "Something went wrong. Try again." : "Something went wrong. Try again.");
      }
    });
  }
```
- Inside the row's first `<div className="flex items-center gap-2">`, after the rename form, insert:
```tsx
        <label className="caption-style text-soft flex items-center gap-1.5">
          <Checkbox aria-label={`${category.name} goes to the kitchen`} checked={kitchen} onCheckedChange={(checked) => changeKitchen(checked === true)} />
          Kitchen
        </label>
```
- Change the `error` line so `kitchenError` is also shown: `const error = kitchenError ?? (…existing expression…);`.
- The dialog description becomes `The register groups products by category, in this order. Tick Kitchen for categories that print on kitchen tickets.`

- [ ] **Step 4: Typecheck, lint and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors in `components/products` or `app/(app)/products`. Register errors from Task 2 may remain until Task 4; if `tsc` fails only there, continue. The build may fail on those same files; Task 4 runs the full build.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/products" components/products
git commit -m "feat(catalog): modifier groups page, product attachments and kitchen categories"
```

### Task 4: Register — choosing modifiers, order name, tip, kitchen ticket button, cash tips

**Files:**
- Create: `components/register/modifier-dialog.tsx`
- Modify: `components/register/register-screen.tsx`, `components/register/cart-panel.tsx`, `components/register/pay-dialog.tsx`, `components/register/sale-done.tsx`, `components/register/close-till-dialog.tsx`, `lib/register/actions.ts` (`CloseTillState`)

**Interfaces:**
- Consumes: Task 2 cart/modifier/tip helpers; Task 1 `close_register.cash_tips`.
- Produces:
  - **Accessible names:**
    - the "Add to sale" / "Save choices" button, option buttons named by option, and "Edit choices for {label}";
    - fields "Name for the order" and "Custom tip"; tip buttons "No tip", "10%", "15%", "20%", "Custom";
    - texts "Due {money}" and "Tip {money}";
    - link "Print kitchen ticket", checkbox "Auto-print kitchen tickets on this device", text "Cash tips".

- [ ] **Step 1: Modifier dialog**

`components/register/modifier-dialog.tsx`:
```tsx
"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { checkSelection, groupRule, selectionDelta, toggleOption, type Selection } from "@/lib/modifiers";
import { variantLabel, type RegisterProduct, type RegisterVariant } from "@/lib/register/cart";

export type ModifierTarget = { product: RegisterProduct; variant: RegisterVariant; selection: Selection; editKey: string | null };

type ModifierDialogProps = {
  target: ModifierTarget | null;
  money: (minor: number) => string;
  onDone: (target: ModifierTarget, selection: Selection) => void;
  onClose: () => void;
};

function ModifierForm({ target, money, onDone }: { target: ModifierTarget; money: (minor: number) => string; onDone: ModifierDialogProps["onDone"] }) {
  const [selection, setSelection] = useState<Selection>(target.selection);
  const groups = target.product.modifierGroups;
  const label = variantLabel(target.product, target.variant);
  const problem = checkSelection(groups, selection, label);
  const each = target.variant.price + selectionDelta(groups, selection);

  return (
    <div className="flex flex-col gap-5 p-6">
      <DialogHeader>
        <DialogTitle>{label}</DialogTitle>
        <DialogDescription className="tabular-nums">{money(each)} each</DialogDescription>
      </DialogHeader>
      {groups.map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-2">
          <legend className="mb-2 flex items-baseline gap-2">
            <span className="lead-style">{group.name}</span>
            <span className="caption-style text-soft">
              {groupRule(group.min, group.max)}
              {group.min > 0 ? " · required" : ""}
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {group.options.map((option) => {
              const on = (selection[group.id] ?? []).includes(option.id);
              return (
                <Button
                  key={option.id}
                  variant="secondary"
                  size="md"
                  aria-pressed={on}
                  className="aria-pressed:bg-primary aria-pressed:text-primary-foreground min-h-11 justify-between"
                  onClick={() => setSelection((current) => toggleOption(group, current, option.id))}
                >
                  <span>{option.name}</span>
                  {option.priceDelta !== 0 && (
                    <span className="tabular-nums">
                      {option.priceDelta > 0 ? "+" : "−"}
                      {money(Math.abs(option.priceDelta))}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </fieldset>
      ))}
      {problem && <span role="status" className="caption-style text-soft">{problem}.</span>}
      <DialogFooter>
        <Button variant="primary" size="md" className="min-h-11" disabled={problem !== null} onClick={() => onDone(target, selection)}>
          {target.editKey ? "Save choices" : "Add to sale"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function ModifierDialog({ target, money, onDone, onClose }: ModifierDialogProps) {
  const open = target !== null;
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[32em]">{target && <ModifierForm key={openCount} target={target} money={money} onDone={onDone} />}</DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Cart panel**

`components/register/cart-panel.tsx`:
- Add `import { Input } from "@/components/_ui/input";`.
- In `CartPanelProps`, rename `onQuantity: (variantId: string, quantity: number) => void;` to `onQuantity: (key: string, quantity: number) => void;` and add:
```ts
  orderName: string;
  onOrderName: (value: string) => void;
  canEdit: (line: CartLine) => boolean;
  onEditChoices: (line: CartLine) => void;
```
- In the lines map:
  - `<li key={line.variantId}` becomes `<li key={line.key}`;
  - every `props.onQuantity(line.variantId, …)` becomes `props.onQuantity(line.key, …)`;
  - after `<span className="truncate">{line.label}</span>`, add `{line.modifierLabel && <span className="caption-style text-soft">{line.modifierLabel}</span>}`;
  - before the `Discount` button, add:
```tsx
                  {props.canEdit(line) && (
                    <Button variant="ghost" size="md" className="min-h-11" aria-label={`Edit choices for ${line.label}`} onClick={() => props.onEditChoices(line)}>Edit</Button>
                  )}
```
  - change the `Discount` button's `className="ml-auto min-h-11"` to `className={props.canEdit(line) ? "min-h-11" : "ml-auto min-h-11"}`, and give the new Edit button `ml-auto` by setting its className to `"ml-auto min-h-11"`.
- Before `{props.error && …}` in the footer, add:
```tsx
        <Input aria-label="Name for the order" placeholder="Name for the order (optional)" className="min-h-11" maxLength={40} value={props.orderName} onChange={(event) => props.onOrderName(event.target.value)} />
```

- [ ] **Step 3: Pay dialog with tips**

`components/register/pay-dialog.tsx`:
- Add the import `import { TIP_PRESETS, tipFor } from "@/lib/tips";`.
- `onComplete: (payments: PaymentInput[]) => Promise<string | null>;` becomes `onComplete: (payments: PaymentInput[], tip: number) => Promise<string | null>;`.
- In `PayForm`, after the existing state, add:
```tsx
  const [tipChoice, setTipChoice] = useState<number | "custom">(0);
  const [customTip, setCustomTip] = useState("");
  const customParsed = tipChoice === "custom" ? parseMoney(customTip, currency) : null;
  const tip = tipChoice === "custom" ? (customParsed !== null && customParsed >= 0 ? customParsed : 0) : tipFor(total, tipChoice);
  const due = total + tip;
```
- Directly after the `let parseError` declaration, add:
```tsx
  if (tipChoice === "custom" && customTip.trim() !== "" && (customParsed === null || customParsed < 0)) parseError = "Enter the tip, like 1.00";
```
- `const summary = summarisePayments(total, payments);` becomes `const summary = summarisePayments(due, payments);`.
- In `complete()`, `onComplete(payments)` becomes `onComplete(payments, tip)`.
- Replace `<DialogDescription>Total {money(total)}</DialogDescription>` with `<DialogDescription className="tabular-nums">Total {money(total)}</DialogDescription>`, and right after `</DialogHeader>` add:
```tsx
      <div role="group" aria-label="Tip" className="grid grid-cols-5 gap-2">
        {TIP_PRESETS.map((preset) => (
          <Button key={preset.bps} variant="secondary" size="md" aria-pressed={tipChoice === preset.bps} className="aria-pressed:bg-primary aria-pressed:text-primary-foreground min-h-11 px-1" onClick={() => setTipChoice(preset.bps)}>
            {preset.label}
          </Button>
        ))}
        <Button variant="secondary" size="md" aria-pressed={tipChoice === "custom"} className="aria-pressed:bg-primary aria-pressed:text-primary-foreground min-h-11 px-1" onClick={() => setTipChoice("custom")}>
          Custom
        </Button>
      </div>
      {tipChoice === "custom" && (
        <Input aria-label="Custom tip" inputMode="decimal" placeholder="0.00" className="min-h-11" value={customTip} onChange={(event) => setCustomTip(event.target.value)} />
      )}
      <div className="flex justify-between tabular-nums">
        <span>{tip > 0 ? `Tip ${money(tip)}` : "No tip"}</span>
        <span className="lead-style font-medium">Due {money(due)}</span>
      </div>
```

- [ ] **Step 4: Sale done and close till**

`components/register/sale-done.tsx` (replace the whole file):
```tsx
"use client";

import { useState } from "react";
import Button, { buttonVariants } from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import Card from "@/components/_common/card";
import { cn } from "@/lib/utils";

const AUTO_KITCHEN = "pos-auto-kitchen";

type SaleDoneProps = {
  orderId: string;
  receiptNumber: number;
  total: number;
  tip: number;
  change: number;
  kitchen: boolean;
  money: (minor: number) => string;
  onNewSale: () => void;
  onVoid: () => void;
};

function readAuto(): boolean {
  try {
    return window.localStorage.getItem(AUTO_KITCHEN) === "1";
  } catch {
    return false;
  }
}

export default function SaleDone({ orderId, receiptNumber, total, tip, change, kitchen, money, onNewSale, onVoid }: SaleDoneProps) {
  const [auto, setAuto] = useState(readAuto);
  const kitchenHref = `/receipts/${orderId}/kitchen?print=1`;

  function changeAuto(next: boolean) {
    setAuto(next);
    try {
      window.localStorage.setItem(AUTO_KITCHEN, next ? "1" : "0");
    } catch {}
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <Card className="flex w-full max-w-[24em] flex-col items-center gap-5 p-6">
        <div className="flex flex-col items-center gap-2">
          <h2>Sale complete</h2>
          <span className="caption-style text-soft">Receipt #{receiptNumber}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[28px] leading-none font-semibold tabular-nums">{money(total + tip)}</span>
          <span className="caption-style text-soft tabular-nums">{tip > 0 ? `Paid · Tip ${money(tip)}` : "Paid"}</span>
        </div>
        {change > 0 && <span className="h1-style text-warning tabular-nums">Change due {money(change)}</span>}
        <div className="flex w-full flex-wrap justify-center gap-2">
          <a href={`/receipts/${orderId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11 flex-1")}>
            Print receipt
          </a>
          <Button variant="primary" size="md" className="min-h-11 flex-1" onClick={onNewSale} autoFocus>
            New sale
          </Button>
        </div>
        {kitchen && (
          <div className="flex w-full flex-col items-center gap-2">
            <a href={kitchenHref} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11 w-full")}>
              Print kitchen ticket
            </a>
            <label className="caption-style text-soft flex items-center gap-2">
              <Checkbox aria-label="Auto-print kitchen tickets on this device" checked={auto} onCheckedChange={(checked) => changeAuto(checked === true)} />
              Auto-print kitchen tickets on this device
            </label>
          </div>
        )}
      </Card>
      <Button variant="ghost" size="md" className="min-h-11" onClick={onVoid}>
        Void sale
      </Button>
      {kitchen && auto && <iframe title="Kitchen ticket" src={kitchenHref} className="pointer-events-none fixed top-0 left-0 size-px opacity-0" />}
    </div>
  );
}
```

The existing e2e looks for "Tip $0.76". The caption reads `Paid · Tip $0.76`; the e2e in Task 6 matches it with a regular expression.

`lib/register/actions.ts`: `CloseTillState["summary"]` gains `cash_tips: number;`.

`components/register/close-till-dialog.tsx`: destructure `cash_tips` with the others, and before the `cash_refunds` row add:
```tsx
          {cash_tips > 0 && <div className="flex justify-between"><dt>Cash tips</dt><dd>{money(cash_tips)}</dd></div>}
```

- [ ] **Step 5: Register screen wiring**

`components/register/register-screen.tsx`:
- **Imports:** add `import ModifierDialog, { type ModifierTarget } from "./modifier-dialog";` and `import { selectionFromIds, type Selection } from "@/lib/modifiers";`. Add `changeSelection` to the `@/lib/register/cart` import.
- **`type Done`** becomes `{ orderId: string; receiptNumber: number; change: number; total: number; tip: number; kitchen: boolean }`.
- **New state:**
```tsx
  const [modifierTarget, setModifierTarget] = useState<ModifierTarget | null>(null);
  const [orderName, setOrderName] = useState("");
```
- **Replace `add` and `pick`** with:
```tsx
  function add(product: RegisterProduct, variant: RegisterVariant, selection: Selection = {}) {
    setLines((current) => addToCart(current, product, variant, selection));
    setNotice(null);
    searchRef.current?.focus();
  }

  function choose(product: RegisterProduct, variant: RegisterVariant) {
    if (product.modifierGroups.length > 0) setModifierTarget({ product, variant, selection: {}, editKey: null });
    else add(product, variant);
  }

  function pick(product: RegisterProduct) {
    if (product.variants.length === 1) choose(product, product.variants[0]);
    else setVariantProduct(product);
  }

  function editChoices(line: CartLine) {
    const product = props.products.find((entry) => entry.variants.some((variant) => variant.id === line.variantId));
    const variant = product?.variants.find((entry) => entry.id === line.variantId);
    if (!product || !variant) return;
    setModifierTarget({ product, variant, selection: selectionFromIds(product.modifierGroups, line.optionIds), editKey: line.key });
  }
```
- **`onSearchKey`:** the two `add(…)` calls become `choose(…)`.
- **`reset()`:** add `setOrderName("");`.
- **`complete`** becomes `async function complete(payments: PaymentInput[], tip: number): Promise<string | null> {`:
  - in the `completeSale` call, each mapped line adds `optionIds: line.optionIds`, and the call adds `tip,` and `orderName: orderName.trim() || undefined,`;
  - on success, `setDone({ orderId: result.orderId, receiptNumber: result.receiptNumber, change: result.change, total: result.total, tip, kitchen: lines.some((line) => line.kitchen) });`.
- **The `<CartPanel …>` props:**
  - `onQuantity={(key, quantity) => setLines((current) => setQuantity(current, key, quantity))}`;
  - add `orderName={orderName}`, `onOrderName={setOrderName}`, `canEdit={(line) => line.optionIds.length > 0 || props.products.some((product) => product.modifierGroups.length > 0 && product.variants.some((variant) => variant.id === line.variantId))}`, `onEditChoices={editChoices}`.
- **`VariantDialog onPick`:** `add(product, variant); setVariantProduct(null);` becomes `setVariantProduct(null); choose(product, variant);`.
- **`DiscountDialog onApply`:** `discountTarget.line.variantId` becomes `discountTarget.line.key`.
- **`<SaleDone …>`:** add `tip={done.tip} kitchen={done.kitchen}`.
- **After `<VariantDialog … />`**, add:
```tsx
      <ModifierDialog
        target={modifierTarget}
        money={money}
        onClose={() => setModifierTarget(null)}
        onDone={(target, selection) => {
          if (target.editKey) {
            const key = target.editKey;
            setLines((current) => changeSelection(current, key, target.product, selection));
          } else {
            add(target.product, target.variant, selection);
          }
          setModifierTarget(null);
        }}
      />
```

- [ ] **Step 6: Typecheck, lint, test, build, and the existing register e2e**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build && npx supabase db reset >/dev/null && npx playwright test e2e/register.spec.ts e2e/sales-history.spec.ts`
Expected:
- no type, lint or unit failures; the build succeeds;
- the 12 register and sales-history tests PASS. The tip defaults to "No tip", so totals are unchanged, and lines without modifiers keep `key === variantId`.

- [ ] **Step 7: Commit**

```bash
git add components/register lib/register/actions.ts
git commit -m "feat(register): modifier choices, order name, tips and kitchen ticket button"
```

### Task 5: Receipts, kitchen ticket, a sale's page and reports show modifiers and tips

**Files:**
- Create: `app/receipts/[orderId]/kitchen/page.tsx`
- Modify:
  - `app/receipts/[orderId]/page.tsx`, `app/(app)/orders/[id]/page.tsx`;
  - `lib/orders/detail.ts`, `lib/orders/queries.ts`, `lib/orders/detail.test.ts`;
  - `lib/reports/types.ts`, `lib/reports/csv.ts`, `lib/reports/csv.test.ts`, `lib/reports/flags.test.ts`;
  - `components/reports/summary-view.tsx`, `components/reports/staff-view.tsx`, `components/reports/cashups-view.tsx`.

**Interfaces:**
- Consumes: Task 1 columns (`orders.tip`, `orders.order_name`, `order_item_modifiers`, `report_* tips/cash_tips`).
- Produces:
  - `OrderDetailRow` gains `tip: number`, `order_name: string | null`, and `order_items[].order_item_modifiers: { option_name: string; sort_order: number }[]`;
  - `SummaryReport.tips`, `StaffReportRow.tips`, `CashupRow.cash_tips`;
  - **CSV columns:** Summary `tips`; Staff `tips` (before `flags`); Cash-ups `cash_tips` (after `cash_sales`).

- [ ] **Step 1: Update the report and detail tests first (they fail)**

`lib/reports/csv.test.ts`:
- In the summary fixture, add `tips: 76,` after `sales_total: 1897,`, and add `expect(rows).toContainEqual(["tips", "0.76"]);` after the `net_sales` expectation.
- In the staff fixture, add `tips: 76` after `discounts: 125`. The expected row becomes `["Casey", 1, "12.37", 0, "0.00", 1, "3.30", 1, "1.25", "0.76", "Voided a cash sale"]`.
- In the cash-ups fixture, add `cash_tips: 76,` after `cash_sales: 660,`. The expected row becomes `["Till 2", "2026-10-14 09:00", "2026-10-14 21:00", "Manager", "", "50.00", "6.60", "0.76", "3.30", "53.30", "49.00", "-4.30", ""]`.

`lib/reports/flags.test.ts`: in `base`, add `tips: 0,` after `discounts: 0,`.

`lib/orders/detail.test.ts`:
- In the `order` fixture, add `tip: 0,` and `order_name: null,` after `voided_at: null,`.
- On each `order_items` entry, add `order_item_modifiers: []`. For example, the Mug line becomes `{ id: "i2", line_number: 2, name: "Mug", sku: "MUG", unit_price: 300, quantity: 1, discount: 0, tax: 30, line_total: 330, order_item_modifiers: [] }`.

Run: `npx vitest run lib/reports lib/orders && npx tsc --noEmit`
Expected: FAIL. The CSV expectations don't match (no tips columns yet), and `tsc` reports unknown properties `tips`, `cash_tips`, `tip`, `order_name` and `order_item_modifiers`.

- [ ] **Step 2: Types, queries and CSV**

`lib/reports/types.ts`:
- `SummaryReport` gains `tips: number;`;
- `StaffReportRow` gains `tips: number;`;
- `CashupRow` gains `cash_tips: number;`.

`lib/reports/csv.ts`:
- In `summaryCsv`, after `["sales_total", …]`, add `["tips", amount(summary.tips)],`.
- In `staffCsv`, the header becomes `["staff", "sales", "sales_value", "refunds", "refunds_value", "voids", "voids_value", "cash_voids", "discounts", "tips", "flags"]`, and in each row `amount(row.tips),` goes between `amount(row.discounts),` and the flags.
- In `cashupsCsv`, the header becomes `["register", "opened_at", "closed_at", "opened_by", "closed_by", "float", "cash_sales", "cash_tips", "cash_refunds", "expected", "counted", "difference", "note"]`, and in each row `amount(row.cash_tips),` goes after `amount(row.cash_sales),`.

`lib/orders/detail.ts`, `OrderDetailRow`:
- after `voided_at: string | null;`, add `tip: number;` and `order_name: string | null;`;
- in `order_items`, the element type gains `order_item_modifiers: { option_name: string; sort_order: number }[];`.

`lib/orders/queries.ts`, `DETAIL_FIELDS`:
- the first entry ends `…, void_reason, voided_at, tip, order_name`;
- the `order_items(…)` entry becomes `"order_items(id, line_number, name, sku, unit_price, quantity, discount, tax, line_total, order_item_modifiers(option_name, sort_order))"`.

- [ ] **Step 3: Screens**

`components/reports/summary-view.tsx`: after `<Stat label="Tax" value={money(summary.net_tax)} />`, add `<Stat label="Tips" value={money(summary.tips)} />`.

`components/reports/staff-view.tsx`:
- after the Discounts header, add `<TableHead className="hidden text-right md:table-cell">Tips</TableHead>`;
- after the Discounts cell, add `<TableCell className="hidden text-right tabular-nums md:table-cell">{money(row.tips)}</TableCell>`.

`components/reports/cashups-view.tsx`:
- after the "Cash sales" header, add `<TableHead className="hidden text-right md:table-cell">Cash tips</TableHead>`;
- after the cash sales cell, add `<TableCell className="hidden text-right tabular-nums md:table-cell">{money(row.cash_tips)}</TableCell>`.

`app/receipts/[orderId]/page.tsx`:
- **Select:** after `total`, add `, tip, order_name`. In `order_items(…)`, add `, order_item_modifiers(option_name, sort_order)` before the closing parenthesis.
- **`ReceiptOrder`:** gains `tip: number; order_name: string | null;`, and the order item type gains `order_item_modifiers: { option_name: string; sort_order: number }[];`.
- **Items:** after `<span>{item.name}</span>`, add:
```tsx
              {item.order_item_modifiers.length > 0 && (
                <span className="pl-2">{[...item.order_item_modifiers].sort((a, b) => a.sort_order - b.sort_order).map((modifier) => modifier.option_name).join(", ")}</span>
              )}
```
- **Totals:** after the Total row, add:
```tsx
          {order.tip > 0 && (
            <>
              <div className="flex justify-between"><dt>Tip</dt><dd>{money(order.tip)}</dd></div>
              <div className="flex justify-between font-bold"><dt>Paid</dt><dd>{money(order.total + order.tip)}</dd></div>
            </>
          )}
```

`app/(app)/orders/[id]/page.tsx`:
- **Item cell:** `<TableCell>{item.name}<span className="caption-style text-subtle mt-1 block">{item.sku}</span></TableCell>` becomes:
```tsx
                    <TableCell>
                      {item.name}
                      {item.order_item_modifiers.length > 0 && (
                        <span className="caption-style text-soft mt-1 block">
                          {[...item.order_item_modifiers].sort((a, b) => a.sort_order - b.sort_order).map((modifier) => modifier.option_name).join(" · ")}
                        </span>
                      )}
                      <span className="caption-style text-subtle mt-1 block">{item.sku}</span>
                    </TableCell>
```
- **Summary line:** in `{when(order.created_at)} · {order.register?.name ?? "—"} · {order.staff?.name ?? "—"}`, append `{order.order_name ? ` · for ${order.order_name}` : ""}`.
- **Totals:** after the Total row, add:
```tsx
              {order.tip > 0 && (
                <>
                  <div className="flex justify-between"><dt className="text-soft">Tip</dt><dd>{money(order.tip)}</dd></div>
                  <div className="flex justify-between font-semibold"><dt>Paid</dt><dd>{money(order.total + order.tip)}</dd></div>
                </>
              )}
```

`app/receipts/[orderId]/kitchen/page.tsx`:
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/register/print-on-load";
import PrintButton from "@/components/register/print-button";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kitchen ticket" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type KitchenOrder = {
  receipt_number: number;
  created_at: string;
  status: string;
  order_name: string | null;
  store: { timezone: string } | null;
  order_items: {
    id: string;
    line_number: number | null;
    name: string;
    quantity: number;
    variant: { product: { category: { kitchen: boolean } | null } | null } | null;
    order_item_modifiers: { option_name: string; sort_order: number }[];
  }[];
};

type KitchenPageProps = { params: Promise<{ orderId: string }>; searchParams: Promise<{ print?: string }> };

export default async function KitchenTicketPage({ params, searchParams }: KitchenPageProps) {
  await requireStaff();
  const { orderId } = await params;
  const { print } = await searchParams;
  if (!GUID.test(orderId)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "receipt_number, created_at, status, order_name, store:stores(timezone), order_items(id, line_number, name, quantity, variant:product_variants(product:products(category:categories(kitchen))), order_item_modifiers(option_name, sort_order))",
    )
    .eq("id", orderId)
    .maybeSingle();
  const order = data as unknown as KitchenOrder | null;
  if (!order) notFound();

  const time = new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone: order.store?.timezone ?? "UTC" }).format(new Date(order.created_at));
  const lines = [...order.order_items]
    .filter((item) => item.variant === null || item.variant.product?.category?.kitchen === true)
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));

  return (
    <main className="bg-background flex min-h-dvh justify-center p-4 print:bg-white print:p-0 print:text-black">
      {print === "1" && <PrintOnLoad />}
      <article className="flex w-full max-w-[80mm] flex-col gap-3 font-mono text-[14px] leading-snug">
        {order.status === "voided" && <p className="border-2 border-current py-1 text-center text-[24px] font-bold">VOID</p>}
        <header className="flex flex-col items-center gap-1 border-b border-dashed border-current pb-2 text-center">
          <span className="text-[40px] leading-none font-bold">#{order.receipt_number}</span>
          <span>{time}</span>
          {order.order_name && <span className="text-[20px] font-bold">For {order.order_name}</span>}
        </header>
        {lines.length === 0 ? (
          <p className="text-center">Nothing for the kitchen on this sale.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lines.map((item) => (
              <li key={item.id} className="flex flex-col">
                <span className="text-[18px]">
                  {item.quantity} × {item.name}
                </span>
                {[...item.order_item_modifiers]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((modifier) => (
                    <span key={`${item.id}-${modifier.sort_order}`} className="pl-4 font-bold">
                      {modifier.option_name}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        )}
        <PrintButton />
      </article>
    </main>
  );
}
```

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run lib && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS. The build lists `/receipts/[orderId]/kitchen`.

- [ ] **Step 5: Commit**

```bash
git add "app/receipts" "app/(app)/orders" lib/orders lib/reports components/reports
git commit -m "feat(counter): modifiers and tips on receipts, sales and reports; kitchen ticket"
```

### Task 6: End-to-end tests and README

**Files:**
- Create: `e2e/zz-service.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes the accessible names from Tasks 3–5.
- **Demo data:** Latte Small is $4.20 with 8.25% tax added, and Coffee is a kitchen category (seed). With oat milk (+$0.50) a Latte Small is $4.70 + tax $0.39 = $5.09. A 15% tip is $0.76, so $5.85 is due.

- [ ] **Step 1: Write the e2e spec**

`e2e/zz-service.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { openRegister, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

async function asManagerAtMainStreet(page: Page) {
  await signIn(page, "manager@demo.test");
  const store = page.getByRole("combobox", { name: "Current store" });
  await expect(store).toBeVisible();
  if ((await store.textContent())?.trim() !== "Main Street") {
    await store.click();
    await page.getByRole("option", { name: "Main Street" }).click();
    await expect(store).toHaveText("Main Street");
  }
}

test("a manager sets up a milk choice for lattes", async ({ page }) => {
  await asManagerAtMainStreet(page);
  await page.goto("/products/modifiers");
  await page.getByRole("button", { name: "New group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Milk");
  await dialog.getByLabel("Min choices").fill("1");
  await dialog.getByLabel("Max choices").fill("1");
  await dialog.getByLabel("Option name 1").fill("Whole");
  await dialog.getByLabel("Option name 2").fill("Oat");
  await dialog.getByLabel("Price change 2").fill("0.50");
  await dialog.getByRole("button", { name: "Save group" }).click();
  await expect(page.getByRole("cell", { name: "Milk", exact: true })).toBeVisible();

  await page.goto("/products?q=Latte");
  await page.getByRole("link", { name: "Latte", exact: true }).click();
  await page.getByRole("checkbox", { name: /^Milk/ }).click();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
});

test("a cashier must pick a milk, adds a tip and prints a kitchen ticket", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Latte" }).click();
  await page.getByRole("button", { name: /^Small/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Add to sale" })).toBeDisabled();
  await dialog.getByRole("button", { name: /^Oat/ }).click();
  await expect(dialog.getByText("$4.70 each")).toBeVisible();
  await dialog.getByRole("button", { name: "Add to sale" }).click();
  await expect(page.getByText("Oat", { exact: true })).toBeVisible();
  await page.getByLabel("Name for the order").fill("Sam");

  await page.getByRole("button", { name: "Pay $5.09" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "15%" }).click();
  await expect(page.getByText("Due $5.85")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByLabel("Cash received").fill("10");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/Tip \$0\.76/)).toBeVisible();

  const receipt = await page.getByRole("link", { name: "Print receipt" }).getAttribute("href");
  const kitchen = await page.getByRole("link", { name: "Print kitchen ticket" }).getAttribute("href");
  await page.goto(receipt!.replace("?print=1", ""));
  await expect(page.getByText("Oat")).toBeVisible();
  await expect(page.getByText("Tip", { exact: true })).toBeVisible();
  await page.goto(kitchen!.replace("?print=1", ""));
  await expect(page.getByText("For Sam")).toBeVisible();
  await expect(page.getByText("Oat")).toBeVisible();
  await expect(page.getByText(/\$/)).toHaveCount(0);
});

test("closing the till counts the cash tip", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Close till" }).click();
  await page.getByLabel(/Counted cash/).fill("105.85");
  await page.getByRole("dialog").getByRole("button", { name: "Close till" }).click();
  await expect(page.getByText("Cash tips")).toBeVisible();
  await expect(page.getByText("None")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
});

test("the reports show tips", async ({ page }) => {
  await asManagerAtMainStreet(page);
  await page.goto("/reports");
  await expect(page.getByText("Tips", { exact: true }).first()).toBeVisible();
});
```

Run: `npx supabase db reset >/dev/null && npx playwright test e2e/register.spec.ts e2e/sales-history.spec.ts e2e/zz-reports.spec.ts e2e/zz-service.spec.ts`
Expected: all PASS. If a test fails, fix the code it points to. The amounts above come from the demo prices; don't change them.

- [ ] **Step 2: README**

Insert before `## Scripts`:
```markdown
## Cafés & counters

- **Modifiers:** set up groups like "Milk (pick 1): whole, oat +$0.50" or "Extras (up to 3)" under Products → Modifiers, then tick them on each product. The register asks for required choices, shows the price as you go, and prices everything in the database.
- **Tips:** add No tip, 10%, 15%, 20% or a custom amount when taking payment. Tips are never taxed, discounted or counted as sales. Cash tips count in the drawer, and reports show tips separately.
- **Kitchen tickets:** tick "Kitchen" on categories that the kitchen makes. After a sale, **Print kitchen ticket** prints an 80mm ticket with the order number, an optional name and each item's choices, without prices. Turn on **Auto-print kitchen tickets** to print one after every kitchen sale on that device. For no print dialog at all, run the browser in kiosk printing mode (for example Chrome's `--kiosk-printing`).
```

- [ ] **Step 3: Full verification**

Run each and read the output:
- `npm run lint`: expected clean;
- `npm test`: expected all pass;
- `npx supabase db reset >/dev/null && npm run test:db`: expected `Result: PASS`;
- `npm run test:race`: expected `PASS`;
- `npm run test:e2e`: expected all pass;
- `npm run build`: expected success.

- [ ] **Step 4: Commit**

```bash
git add e2e/zz-service.spec.ts README.md
git commit -m "test(e2e): modifiers, tips, kitchen ticket and cash tips; README"
```
