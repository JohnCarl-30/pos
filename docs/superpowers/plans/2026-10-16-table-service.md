# Table Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tables grouped by area, open tabs worked from servers' phones, kitchen tickets on a live screen, and tabs paid by item, evenly or by any amount at an open till.

**Architecture:**
- **Tabs are not orders.** `tabs` and `tab_items` hold what was ordered (variant, choices, quantity, note), written only by definer functions. Paying calls the existing `create_order` with those lines, so pricing, tax, tips, stock, receipts, refunds and reports are untouched.
- **Kitchen tickets** are snapshots (`kitchen_tickets` + `kitchen_ticket_items`) created by `send_tab`, by `pay_tab` for unsent kitchen lines, and by `create_order` for counter sales with kitchen items.
- **Live updates:** `tabs` and `kitchen_tickets` are in the Realtime publication; every function that changes a tab or ticket bumps its `updated_at`. Screens subscribe with a store filter and call `router.refresh()`, with a 30-second fallback.

**Tech Stack:** Next.js 16.4, React 19, Tailwind 4, Supabase Postgres (RLS, pgTAP, Realtime), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-table-service-design.md`

## Global Constraints

- **Money:** integer minor units. `splitEvenly` uses `allocate` (largest remainder, ties to earlier payments).
- **Prices:** never stored on a tab. The tab, floor and bill price from the current catalog with `priceCart`; the sale is priced by `create_order`.
- **Lockdown:** `tabs`, `tab_items`, `kitchen_tickets`, `kitchen_ticket_items` have no insert, update or delete for `authenticated`; only definer functions write them. `dining_areas` and `dining_tables` are written by managers and owners through RLS, never deleted.
- **Every tab function** locks the tab (`for update`), checks active staff + store access (42501 `'not allowed'`), and refuses a closed tab with 22023 `'this tab is closed'`.
- **Database messages (22023):**
  - `'{table} already has an open tab'`, `'this tab is closed'`, `'{table} has an open tab'`, `'{area} still has tables'`;
  - `'{item} has already been sent; void it instead'`, `'{item} hasn''t been sent; remove it instead'`;
  - `'give a reason for voiding {item}'`, `'{item} has been paid; refund it instead'`, `'{item} is already voided'`;
  - `'only {n} of {item} are left to pay'`, `'pick at least one item to pay'`;
  - `'a tab with sent items can''t be cancelled'`, `'this ticket is already done'`;
  - `'name the bar tab'`, `'guests must be between 1 and 99'`, `'keep the note under 100 characters'`.

  The screen capitalises them, turns `; x` into `. X`, and adds a full stop (`tabDbError`).
- **Touch:** controls on the floor, tab, register and kitchen screens are at least 44px (`min-h-11`).
- **Phone first:** `/tables` and `/tabs/[id]` must not scroll sideways at 375px.
- **Conventions:**
  - no comments;
  - Tailwind only;
  - explicit `Button` variants;
  - React 19 patterns (no setState in effects, dialogs remount per open);
  - `localStorage` only for the kitchen chime switch, wrapped in try/catch;
  - regenerate types with `npm run db:types` after the migration.

## Rulings made while planning

- **Tables setup lives at `/tables/setup`, not Settings.** Settings is owner-only (`requireRole("owner")` in its layout); the spec wants managers too. The floor page links to it for managers and owners. Cost if wrong: a route move.
- **Kitchen notes are set on an unsent line** (`note_tab_item`), not in the add dialog. Adding the same item again merges into an unsent line only when the variant, choices and note all match. Cost if wrong: one dialog field.
- **Only `tabs` and `kitchen_tickets` are in the Realtime publication**, each with `store_id` and `updated_at`. Line changes bump the parent's `updated_at`, so one store-filtered subscription per screen sees everything. Cost if wrong: two more tables in the publication.
- **`pay_tab` parts can carry a line discount** (`discount_bps` / `discount_amount`), passed to `create_order`, so the register's Discount button works on tab lines. Cost if wrong: none.
- **The sale's order name is the tab label** (cut to 40 characters), so receipts and the 6a kitchen ticket say "P1". Cost if wrong: one argument.
- **A fully voided tab can be cancelled:** `cancel_tab` refuses only when a line is sent and not voided, or anything is paid. Cost if wrong: one condition.
- **Splitting a line by quantity may differ by a cent from the bill.** Each sale is priced on its own (per-line tax rounding). Whole-line splits add up exactly. Cost if wrong: none; the bill shows what's left, re-priced each time.
- **Archiving an area with active tables fails** (`'{area} still has tables'`), so no table is ever hidden under an archived area. Cost if wrong: one trigger branch.
- **The bill is at `/bills/[tabId]`, not `/tabs/[id]/bill`.** Like `/receipts`, it sits outside the app shell so it prints without the sidebar; keeping it out of the `tabs/[id]` tree avoids two route trees sharing a dynamic segment. Cost if wrong: a route move.
- **The kitchen screen keeps the normal app shell.** The sidebar already collapses into the menu button below `lg`; a kiosk-style full screen can come later. Cost if wrong: one layout.
- **`create_order` accepts up to 20 payments (was 10)** so a 20-way even split fits. Cost if wrong: none.
- **No pgTAP test for "reports ignore unpaid tabs".** Tabs never write `orders` or `payments`, so there is nothing for a report to pick up; the existing report suites run unchanged in Task 1 Step 5. Cost if wrong: one test.
- **The new browser test is `e2e/zz-tables.spec.ts`:** it sorts after `zz-service.spec.ts` and reuses its Milk group on Latte. Cost if wrong: none.
- **Demo data:** the seed adds areas Inside (T1–T4) and Patio (P1–P2) at Main Street. The e2e test creates its own area "Garden" so it doesn't depend on the seed.

## Review Focus

1. **Two devices press Send on the same tab at once:** the second finds nothing unsent and makes no ticket. *Pinned in Task 1 pgTAP (`send_tab` twice).*
2. **A server adds an item while the cashier pays the rest:** the tab must stay open with the new unpaid line, not close. *Pinned in Task 1 pgTAP.*
3. **A product is archived mid-meal:** paying it fails with "item not available" and changes nothing; voiding it still works. *Pinned in Task 1 pgTAP.*
4. **A manager changes a price mid-meal:** the bill and the register show the new price, and the sale charges it. *Pinned in Task 2 (`tabCartLines` reads the catalog price).*
5. **Split evenly with an odd amount:** the payments add up to the due exactly, extra cents on the first payments. *Pinned in Task 2 (`splitEvenly(1001, 3)` → `[334, 334, 333]`).*

---

### Task 1: Database — areas, tables, tabs, kitchen tickets, pay_tab

**Files:**
- Create: `supabase/migrations/20261016000013_table_service.sql`, `supabase/tests/table_service.test.sql`
- Modify: `supabase/seed.sql` (areas and tables), `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces (SQL, all `security definer`, granted to `authenticated`):
  - `open_tab(p_store_id uuid, p_table_id uuid default null, p_name text default null, p_guests integer default null) returns uuid`
  - `move_tab(p_tab_id uuid, p_table_id uuid) returns void`
  - `update_tab(p_tab_id uuid, p_name text default null, p_guests integer default null) returns void`
  - `cancel_tab(p_tab_id uuid) returns void`
  - `add_tab_items(p_tab_id uuid, p_items jsonb) returns void` — items `[{ variant_id, option_ids, quantity }]`
  - `change_tab_item(p_item_id uuid, p_quantity integer) returns void`
  - `note_tab_item(p_item_id uuid, p_note text default null) returns void`
  - `void_tab_item(p_item_id uuid, p_reason text) returns void`
  - `send_tab(p_tab_id uuid) returns uuid` (ticket id or null)
  - `print_bill(p_tab_id uuid) returns void`
  - `pay_tab(p_tab_id uuid, p_session_id uuid, p_parts jsonb, p_order_discount jsonb, p_approval_id uuid, p_customer_id uuid, p_payments jsonb, p_tip bigint) returns jsonb` — parts `[{ tab_item_id, quantity, discount_bps?, discount_amount? }]`; returns `create_order`'s object plus `tab_paid boolean`
  - `create_order(..., p_tip bigint, p_order_name text, p_kitchen boolean default true)`
  - `finish_ticket(p_ticket_id uuid) returns void`, `recall_ticket(p_store_id uuid) returns uuid`
- Tables: `dining_areas`, `dining_tables`, `tabs`, `tab_items`, `kitchen_tickets`, `kitchen_ticket_items`, `orders.tab_id`, `stores.next_ticket_number`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/table_service.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;
truncate table public.modifier_groups cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'ts-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'ts-cashier@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'ts-other@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency, prices_include_tax, timezone) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD', false, 'UTC'),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD', false, 'UTC');
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'ts-manager@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'ts-cashier@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a4', 'Other', 'ts-other@test', 'cashier', true);
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b2');
insert into public.registers (id, store_id, name) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Till 1');
insert into public.register_sessions (id, register_id, opened_by, opening_cash) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3', 0);
insert into public.tax_classes (id, name, is_default) values ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);
insert into public.tax_rates (store_id, tax_class_id, name, rate_bps) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 'Tax', 1000);
insert into public.categories (id, name, kitchen) values
  ('00000000-0000-0000-0000-0000000000e2', 'Food', true),
  ('00000000-0000-0000-0000-0000000000e3', 'Drinks', false);
insert into public.products (id, name, category_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'Burger', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000f2', 'Beer', '00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-0000000000f5', 'Soup', '00000000-0000-0000-0000-0000000000e2');
insert into public.product_variants (id, product_id, name, sku, price) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'Default', 'BUR', 1200),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 'Default', 'BEER', 600),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f5', 'Default', 'SOUP', 800);
update public.stock_levels set track = false;
insert into public.modifier_groups (id, name, min_choices, max_choices, sort_order, active) values
  ('00000000-0000-0000-0000-000000000101', 'Cook', 1, 1, 0, true);
insert into public.modifier_options (id, group_id, name, price_delta, sort_order, active) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Medium', 0, 0, true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Well done', 100, 1, true);
insert into public.product_modifier_groups (product_id, group_id, sort_order) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000101', 0);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

insert into public.dining_areas (id, store_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-0000000000b1', 'Patio', 0);
insert into public.dining_tables (id, store_id, area_id, name, seats, sort_order) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000301', 'P1', 4, 0),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000301', 'P2', 2, 1);
select is((select count(*) from public.dining_tables)::integer, 2, 'managers add tables');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select throws_ok(
  $$ insert into public.dining_areas (store_id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Bar') $$,
  '42501', null, 'cashiers can''t add areas'
);
select throws_ok(
  $$ insert into public.tabs (store_id, name, opened_by) values ('00000000-0000-0000-0000-0000000000b1', 'Sneaky', '00000000-0000-0000-0000-0000000000c3') $$,
  '42501', null, 'direct tab inserts fail'
);

create temp table t (key text primary key, id uuid) on commit drop;
grant all on t to authenticated;

insert into t values ('p1', public.open_tab('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000401', null, 3));
select is((select status::text from public.tabs where id = (select id from t where key = 'p1')), 'open', 'opens a table tab');
select throws_ok(
  $$ select public.open_tab('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000401', null, 2) $$,
  '22023', 'P1 already has an open tab', 'one open tab per table'
);
select throws_ok(
  $$ select public.open_tab('00000000-0000-0000-0000-0000000000b1', null, '  ', null) $$,
  '22023', 'name the bar tab', 'bar tabs need a name'
);
select throws_ok(
  $$ select public.open_tab('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000402', null, 0) $$,
  '22023', 'guests must be between 1 and 99', 'guests are checked'
);

select throws_ok(
  format($$ select public.add_tab_items(%L, '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]') $$, (select id from t where key = 'p1')),
  '22023', 'pick Cook for Burger', 'adding checks modifier choices'
);
select lives_ok(
  format($$ select public.add_tab_items(%L, '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1,"option_ids":["00000000-0000-0000-0000-000000000202"]},{"variant_id":"00000000-0000-0000-0000-0000000000f4","quantity":2}]') $$, (select id from t where key = 'p1')),
  'adds a burger and two beers'
);
select lives_ok(
  format($$ select public.add_tab_items(%L, '[{"variant_id":"00000000-0000-0000-0000-0000000000f4","quantity":1}]') $$, (select id from t where key = 'p1')),
  'adds another beer'
);
select is(
  (select quantity from public.tab_items where tab_id = (select id from t where key = 'p1') and variant_id = '00000000-0000-0000-0000-0000000000f4'),
  3, 'the same unsent item merges'
);
insert into t select 'beer', id from public.tab_items where tab_id = (select id from t where key = 'p1') and variant_id = '00000000-0000-0000-0000-0000000000f4';
insert into t select 'burger', id from public.tab_items where tab_id = (select id from t where key = 'p1') and variant_id = '00000000-0000-0000-0000-0000000000f3';

select lives_ok(format($$ select public.note_tab_item(%L, 'no onions') $$, (select id from t where key = 'burger')), 'notes an unsent line');
select is((select name from public.tab_items where id = (select id from t where key = 'burger')), 'Burger', 'the line keeps a name');
select throws_ok(
  format($$ select public.void_tab_item(%L, 'mistake') $$, (select id from t where key = 'beer')),
  '22023', 'Beer hasn''t been sent; remove it instead', 'unsent lines are removed, not voided'
);

insert into t values ('ticket1', public.send_tab((select id from t where key = 'p1')));
select isnt((select id from t where key = 'ticket1'), null, 'send makes a ticket for kitchen lines');
select is(
  (select string_agg(quantity || 'x ' || name || ' [' || coalesce(choices, '') || '] ' || coalesce(note, ''), ', ') from public.kitchen_ticket_items where ticket_id = (select id from t where key = 'ticket1')),
  '1x Burger [Well done] no onions', 'the ticket has only the kitchen line, with choices and note'
);
select is((select label from public.kitchen_tickets where id = (select id from t where key = 'ticket1')), 'P1', 'the ticket is labelled with the table');
select is(public.send_tab((select id from t where key = 'p1')), null, 'sending again makes no ticket');
select is((select count(*) from public.tab_items where tab_id = (select id from t where key = 'p1') and sent_at is null)::integer, 0, 'every line is sent');

select throws_ok(
  format($$ select public.change_tab_item(%L, 1) $$, (select id from t where key = 'beer')),
  '22023', 'Beer has already been sent; void it instead', 'sent lines can''t change'
);
select throws_ok(
  format($$ select public.void_tab_item(%L, '  ') $$, (select id from t where key = 'burger')),
  '22023', 'give a reason for voiding Burger', 'voiding needs a reason'
);
select throws_ok(
  format($$ select public.cancel_tab(%L) $$, (select id from t where key = 'p1')),
  '22023', 'a tab with sent items can''t be cancelled', 'sent tabs can''t be cancelled'
);

select throws_ok(
  format($$ select public.pay_tab(%L, '00000000-0000-0000-0000-000000000011', %L, null, null, null, '[{"method":"card","amount":100}]', 0) $$,
    (select id from t where key = 'p1'), jsonb_build_array(jsonb_build_object('tab_item_id', (select id from t where key = 'beer'), 'quantity', 4))),
  '22023', 'only 3 of Beer are left to pay', 'can''t pay more than is left'
);
select throws_ok(
  format($$ select public.pay_tab(%L, '00000000-0000-0000-0000-000000000011', '[]', null, null, null, '[]', 0) $$, (select id from t where key = 'p1')),
  '22023', 'pick at least one item to pay', 'a part needs items'
);

select is(
  (public.pay_tab((select id from t where key = 'p1'), '00000000-0000-0000-0000-000000000011',
    jsonb_build_array(jsonb_build_object('tab_item_id', (select id from t where key = 'beer'), 'quantity', 1)),
    null, null, null, '[{"method":"card","amount":660}]', 0) ->> 'tab_paid'),
  'false', 'pays one beer; the tab stays open'
);
select is((select paid_quantity from public.tab_items where id = (select id from t where key = 'beer')), 1, 'paid quantity goes up');
select is((select order_name from public.orders where tab_id = (select id from t where key = 'p1')), 'P1', 'the sale carries the tab label');
select is((select count(*) from public.kitchen_tickets where order_id is not null)::integer, 0, 'paying a tab makes no counter ticket');

select throws_ok(
  format($$ select public.void_tab_item(%L, 'spilled') $$, (select id from t where key = 'beer')),
  '22023', 'Beer has been paid; refund it instead', 'paid lines can''t be voided'
);
select lives_ok(format($$ select public.void_tab_item(%L, 'sent back') $$, (select id from t where key = 'burger')), 'voids the burger');
select is((select bool_and(voided) from public.kitchen_ticket_items where ticket_id = (select id from t where key = 'ticket1')), true, 'the kitchen line shows VOID');

select lives_ok(
  format($$ select public.add_tab_items(%L, '[{"variant_id":"00000000-0000-0000-0000-0000000000f6","quantity":1}]') $$, (select id from t where key = 'p1')),
  'a server adds soup while the bill is being paid'
);
insert into t select 'soup', id from public.tab_items where tab_id = (select id from t where key = 'p1') and variant_id = '00000000-0000-0000-0000-0000000000f6';
select is(
  (public.pay_tab((select id from t where key = 'p1'), '00000000-0000-0000-0000-000000000011',
    jsonb_build_array(jsonb_build_object('tab_item_id', (select id from t where key = 'beer'), 'quantity', 2)),
    null, null, null, '[{"method":"cash","amount":1320}]', 0) ->> 'tab_paid'),
  'false', 'paying the beers leaves the soup unpaid'
);

reset role;
update public.products set active = false where id = '00000000-0000-0000-0000-0000000000f5';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok(
  format($$ select public.pay_tab(%L, '00000000-0000-0000-0000-000000000011', %L, null, null, null, '[{"method":"card","amount":880}]', 0) $$,
    (select id from t where key = 'p1'), jsonb_build_array(jsonb_build_object('tab_item_id', (select id from t where key = 'soup'), 'quantity', 1))),
  'P0002', 'item not available', 'an archived item can''t be paid'
);
select is((select sent_at from public.tab_items where id = (select id from t where key = 'soup')), null, 'a failed payment changes nothing');
reset role;
update public.products set active = true where id = '00000000-0000-0000-0000-0000000000f5';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is(
  (public.pay_tab((select id from t where key = 'p1'), '00000000-0000-0000-0000-000000000011',
    jsonb_build_array(jsonb_build_object('tab_item_id', (select id from t where key = 'soup'), 'quantity', 1)),
    null, null, null, '[{"method":"card","amount":880}]', 0) ->> 'tab_paid'),
  'true', 'paying the last line closes the tab'
);
select is((select count(*) from public.kitchen_tickets where tab_id = (select id from t where key = 'p1'))::integer, 2, 'the unsent soup went to the kitchen when paid');
select is((select status::text from public.tabs where id = (select id from t where key = 'p1')), 'paid', 'the tab is paid');
select is(
  (select sum(total) from public.orders where tab_id = (select id from t where key = 'p1'))::bigint,
  2860::bigint, 'the tab''s sales add up: 3 beers 1980 + soup 880'
);
select throws_ok(
  format($$ select public.add_tab_items(%L, '[{"variant_id":"00000000-0000-0000-0000-0000000000f4","quantity":1}]') $$, (select id from t where key = 'p1')),
  '22023', 'this tab is closed', 'a paid tab is closed'
);

insert into t values ('bar', public.open_tab('00000000-0000-0000-0000-0000000000b1', null, 'Sam', null));
select lives_ok(format($$ select public.move_tab(%L, '00000000-0000-0000-0000-000000000401') $$, (select id from t where key = 'bar')), 'a bar tab moves to a free table');
select lives_ok(format($$ select public.cancel_tab(%L) $$, (select id from t where key = 'bar')), 'an empty tab cancels');

select is(
  (public.create_order('00000000-0000-0000-0000-000000000011',
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f6","quantity":1}]', null, null, null, '[{"method":"card","amount":880}]', 0, 'Jo') ->> 'total'),
  '880', 'a counter sale'
);
select is((select label from public.kitchen_tickets where order_id is not null), 'Jo', 'a counter sale with kitchen items makes a ticket');
select lives_ok(format($$ select public.finish_ticket(%L) $$, (select id from t where key = 'ticket1')), 'finishes a ticket');
select throws_ok(
  format($$ select public.finish_ticket(%L) $$, (select id from t where key = 'ticket1')),
  '22023', 'this ticket is already done', 'a done ticket can''t finish again'
);
select is(public.recall_ticket('00000000-0000-0000-0000-0000000000b1'), (select id from t where key = 'ticket1'), 'recall brings back the last finished ticket');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select is((select count(*) from public.tabs)::integer, 0, 'other stores'' tabs are hidden');
select is((select count(*) from public.kitchen_tickets)::integer, 0, 'other stores'' tickets are hidden');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase test db supabase/tests/table_service.test.sql`
Expected: FAIL — `relation "public.dining_areas" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261016000013_table_service.sql`:

```sql
create type public.tab_status as enum ('open', 'paid', 'cancelled');

alter table public.stores add column next_ticket_number integer not null default 1;

create table public.dining_areas (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index dining_areas_active_name_idx on public.dining_areas (store_id, lower(name)) where active;

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  area_id uuid not null references public.dining_areas (id) on delete restrict,
  name text not null check (length(name) between 1 and 20),
  seats integer not null check (seats between 1 and 50),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index dining_tables_active_name_idx on public.dining_tables (store_id, lower(name)) where active;
create index dining_tables_area_id_idx on public.dining_tables (area_id);

create table public.tabs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  table_id uuid references public.dining_tables (id) on delete restrict,
  name text check (length(name) between 1 and 40),
  guests integer check (guests between 1 and 99),
  opened_by uuid not null references public.staff (id),
  opened_at timestamptz not null default now(),
  bill_printed_at timestamptz,
  status public.tab_status not null default 'open',
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (table_id is not null or name is not null)
);
create unique index tabs_one_open_per_table_idx on public.tabs (table_id) where status = 'open';
create index tabs_store_status_idx on public.tabs (store_id, status);

create table public.tab_items (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  option_ids uuid[] not null default '{}',
  name text not null,
  quantity integer not null check (quantity between 1 and 999),
  paid_quantity integer not null default 0 check (paid_quantity >= 0 and paid_quantity <= quantity),
  note text check (length(note) between 1 and 100),
  added_by uuid not null references public.staff (id),
  added_at timestamptz not null default now(),
  sent_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.staff (id),
  void_reason text check (length(void_reason) between 1 and 200),
  check (voided_at is null or (sent_at is not null and paid_quantity = 0 and void_reason is not null))
);
create index tab_items_tab_id_idx on public.tab_items (tab_id);
create index tab_items_variant_id_idx on public.tab_items (variant_id);

alter table public.orders add column tab_id uuid references public.tabs (id);
create index orders_tab_id_idx on public.orders (tab_id);

create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  number integer not null,
  tab_id uuid references public.tabs (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  label text not null,
  sent_by uuid not null references public.staff (id),
  sent_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references public.staff (id),
  updated_at timestamptz not null default now(),
  check ((tab_id is null) <> (order_id is null))
);
create index kitchen_tickets_store_done_idx on public.kitchen_tickets (store_id, done_at);
create index kitchen_tickets_tab_id_idx on public.kitchen_tickets (tab_id);
create index kitchen_tickets_order_id_idx on public.kitchen_tickets (order_id);

create table public.kitchen_ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.kitchen_tickets (id) on delete cascade,
  tab_item_id uuid references public.tab_items (id) on delete set null,
  quantity integer not null check (quantity > 0),
  name text not null,
  choices text,
  note text,
  voided boolean not null default false,
  sort_order integer not null default 0
);
create index kitchen_ticket_items_ticket_id_idx on public.kitchen_ticket_items (ticket_id);
create index kitchen_ticket_items_tab_item_id_idx on public.kitchen_ticket_items (tab_item_id);

alter table public.dining_areas enable row level security;
alter table public.dining_tables enable row level security;
alter table public.tabs enable row level security;
alter table public.tab_items enable row level security;
alter table public.kitchen_tickets enable row level security;
alter table public.kitchen_ticket_items enable row level security;
revoke all on public.dining_areas, public.dining_tables, public.tabs, public.tab_items, public.kitchen_tickets, public.kitchen_ticket_items from anon;
revoke delete, truncate, references, trigger on public.dining_areas, public.dining_tables from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.tabs, public.tab_items, public.kitchen_tickets, public.kitchen_ticket_items from authenticated;

create policy "staff read dining areas" on public.dining_areas
  for select to authenticated using (private.can_access_store(store_id));
create policy "managers add dining areas" on public.dining_areas
  for insert to authenticated
  with check ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id));
create policy "managers change dining areas" on public.dining_areas
  for update to authenticated
  using ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id))
  with check ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id));
create policy "staff read dining tables" on public.dining_tables
  for select to authenticated using (private.can_access_store(store_id));
create policy "managers add dining tables" on public.dining_tables
  for insert to authenticated
  with check ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id));
create policy "managers change dining tables" on public.dining_tables
  for update to authenticated
  using ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id))
  with check ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id));
create policy "staff read tabs" on public.tabs
  for select to authenticated using (private.can_access_store(store_id));
create policy "staff read tab items" on public.tab_items
  for select to authenticated using (exists (select 1 from public.tabs t where t.id = tab_id and private.can_access_store(t.store_id)));
create policy "staff read kitchen tickets" on public.kitchen_tickets
  for select to authenticated using (private.can_access_store(store_id));
create policy "staff read kitchen ticket items" on public.kitchen_ticket_items
  for select to authenticated using (exists (select 1 from public.kitchen_tickets k where k.id = ticket_id and private.can_access_store(k.store_id)));

create function private.check_dining_table()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.dining_areas a where a.id = new.area_id and a.store_id = new.store_id) then
    raise exception 'pick an area in this store' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.active and not new.active
    and exists (select 1 from public.tabs t where t.table_id = old.id and t.status = 'open') then
    raise exception '%', format('%s has an open tab', old.name) using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger dining_tables_check before insert or update on public.dining_tables
  for each row execute function private.check_dining_table();

create function private.check_dining_area()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active and not new.active and exists (select 1 from public.dining_tables d where d.area_id = old.id and d.active) then
    raise exception '%', format('%s still has tables', old.name) using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger dining_areas_check before update on public.dining_areas
  for each row execute function private.check_dining_area();

create function private.lock_open_tab(p_tab_id uuid)
returns public.tabs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs;
begin
  if private.staff_id() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_tab from public.tabs where id = p_tab_id for update;
  if not found or not private.can_access_store(v_tab.store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_tab.status <> 'open' then
    raise exception 'this tab is closed' using errcode = '22023';
  end if;
  return v_tab;
end;
$$;

create function private.tab_label(p_tab public.tabs)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select d.name from public.dining_tables d where d.id = p_tab.table_id), p_tab.name)
$$;

create function private.lock_tab_item(p_item_id uuid)
returns public.tab_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab_id uuid;
  v_item public.tab_items;
begin
  select tab_id into v_tab_id from public.tab_items where id = p_item_id;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.lock_open_tab(v_tab_id);
  select * into v_item from public.tab_items where id = p_item_id for update;
  return v_item;
end;
$$;

create function private.check_options(p_product_id uuid, p_option_ids uuid[], p_label text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bad text;
  v_group record;
  v_delta bigint;
begin
  if cardinality(p_option_ids) > 50 or cardinality(p_option_ids) <> (select count(distinct x) from unnest(p_option_ids) x) then
    raise exception 'list each choice once' using errcode = '22023';
  end if;

  select coalesce(mo.name, 'A choice') into v_bad
  from unnest(p_option_ids) as chosen(id)
  left join public.modifier_options mo on mo.id = chosen.id
  left join public.modifier_groups mg on mg.id = mo.group_id
  left join public.product_modifier_groups pmg on pmg.group_id = mg.id and pmg.product_id = p_product_id
  where mo.id is null or not mo.active or not mg.active or pmg.product_id is null
  limit 1;
  if found then
    raise exception '%', format('%s isn''t available for %s any more', v_bad, p_label) using errcode = '22023';
  end if;

  for v_group in
    select mg.name, mg.min_choices, mg.max_choices,
      (select count(*) from unnest(p_option_ids) c(id) join public.modifier_options mo on mo.id = c.id where mo.group_id = mg.id)::integer as chosen
    from public.product_modifier_groups pmg
    join public.modifier_groups mg on mg.id = pmg.group_id
    where pmg.product_id = p_product_id and mg.active
    order by pmg.sort_order, mg.name
  loop
    if v_group.chosen < v_group.min_choices then
      raise exception '%', format('pick %s for %s', v_group.name, p_label) using errcode = '22023';
    end if;
    if v_group.chosen > v_group.max_choices then
      raise exception '%', format('pick up to %s %s for %s', v_group.max_choices, v_group.name, p_label) using errcode = '22023';
    end if;
  end loop;

  select coalesce(sum(mo.price_delta), 0) into v_delta from public.modifier_options mo where mo.id = any(p_option_ids);
  return v_delta;
end;
$$;

create function private.choices_label(p_product_id uuid, p_option_ids uuid[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(string_agg(mo.name, ' · ' order by pmg.sort_order, mg.name, mo.sort_order, mo.name), '')
  from unnest(p_option_ids) as chosen(id)
  join public.modifier_options mo on mo.id = chosen.id
  join public.modifier_groups mg on mg.id = mo.group_id
  left join public.product_modifier_groups pmg on pmg.group_id = mg.id and pmg.product_id = p_product_id
$$;

create function private.new_ticket(p_store_id uuid, p_tab_id uuid, p_order_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
  v_ticket_id uuid;
begin
  update public.stores set next_ticket_number = next_ticket_number + 1
  where id = p_store_id
  returning next_ticket_number - 1 into v_number;
  insert into public.kitchen_tickets (store_id, number, tab_id, order_id, label, sent_by)
  values (p_store_id, v_number, p_tab_id, p_order_id, coalesce(nullif(p_label, ''), 'Order'), private.staff_id())
  returning id into v_ticket_id;
  return v_ticket_id;
end;
$$;

create function private.send_lines(p_tab public.tabs, p_item_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent uuid[];
  v_ticket_id uuid;
begin
  with sent as (
    update public.tab_items set sent_at = now()
    where tab_id = p_tab.id and sent_at is null and (p_item_ids is null or id = any(p_item_ids))
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_sent from sent;

  if not exists (
    select 1 from public.tab_items ti
    join public.product_variants v on v.id = ti.variant_id
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    where ti.id = any(v_sent) and c.kitchen
  ) then
    return null;
  end if;

  v_ticket_id := private.new_ticket(p_tab.store_id, p_tab.id, null, private.tab_label(p_tab));
  insert into public.kitchen_ticket_items (ticket_id, tab_item_id, quantity, name, choices, note, sort_order)
  select v_ticket_id, ti.id, ti.quantity, ti.name, private.choices_label(v.product_id, ti.option_ids), ti.note,
    (row_number() over (order by ti.added_at, ti.id))::integer
  from public.tab_items ti
  join public.product_variants v on v.id = ti.variant_id
  join public.products p on p.id = v.product_id
  join public.categories c on c.id = p.category_id
  where ti.id = any(v_sent) and c.kitchen;
  return v_ticket_id;
end;
$$;

create function private.settle_tab(p_tab_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tab_items where tab_id = p_tab_id and voided_at is null and paid_quantity < quantity) then
    return false;
  end if;
  if not exists (select 1 from public.tab_items where tab_id = p_tab_id and paid_quantity > 0) then
    return false;
  end if;
  update public.tabs set status = 'paid', closed_at = now(), updated_at = now() where id = p_tab_id;
  return true;
end;
$$;

revoke execute on function private.check_dining_table(), private.check_dining_area(), private.lock_open_tab(uuid), private.tab_label(public.tabs),
  private.lock_tab_item(uuid), private.check_options(uuid, uuid[], text), private.choices_label(uuid, uuid[]),
  private.new_ticket(uuid, uuid, uuid, text), private.send_lines(public.tabs, uuid[]), private.settle_tab(uuid)
  from public, anon, authenticated;

create function public.open_tab(p_store_id uuid, p_table_id uuid default null, p_name text default null, p_guests integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := private.staff_id();
  v_table record;
  v_name text := nullif(trim(p_name), '');
  v_tab_id uuid;
begin
  if v_staff_id is null or not private.can_access_store(p_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_guests is not null and (p_guests < 1 or p_guests > 99) then
    raise exception 'guests must be between 1 and 99' using errcode = '22023';
  end if;
  if length(v_name) > 40 then
    raise exception 'keep the tab name under 40 characters' using errcode = '22023';
  end if;
  if p_table_id is null then
    if v_name is null then
      raise exception 'name the bar tab' using errcode = '22023';
    end if;
  else
    select d.id, d.name into v_table from public.dining_tables d where d.id = p_table_id and d.store_id = p_store_id and d.active for update;
    if not found then
      raise exception 'pick a table in this store' using errcode = '22023';
    end if;
    if exists (select 1 from public.tabs t where t.table_id = p_table_id and t.status = 'open') then
      raise exception '%', format('%s already has an open tab', v_table.name) using errcode = '22023';
    end if;
  end if;
  insert into public.tabs (store_id, table_id, name, guests, opened_by)
  values (p_store_id, p_table_id, v_name, p_guests, v_staff_id)
  returning id into v_tab_id;
  return v_tab_id;
end;
$$;

create function public.move_tab(p_tab_id uuid, p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_table record;
begin
  select d.id, d.name into v_table from public.dining_tables d where d.id = p_table_id and d.store_id = v_tab.store_id and d.active for update;
  if not found then
    raise exception 'pick a table in this store' using errcode = '22023';
  end if;
  if exists (select 1 from public.tabs t where t.table_id = p_table_id and t.status = 'open' and t.id <> p_tab_id) then
    raise exception '%', format('%s already has an open tab', v_table.name) using errcode = '22023';
  end if;
  update public.tabs set table_id = p_table_id, updated_at = now() where id = p_tab_id;
end;
$$;

create function public.update_tab(p_tab_id uuid, p_name text default null, p_guests integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_name text := nullif(trim(p_name), '');
begin
  if p_guests is not null and (p_guests < 1 or p_guests > 99) then
    raise exception 'guests must be between 1 and 99' using errcode = '22023';
  end if;
  if length(v_name) > 40 then
    raise exception 'keep the tab name under 40 characters' using errcode = '22023';
  end if;
  if v_tab.table_id is null and v_name is null then
    raise exception 'name the bar tab' using errcode = '22023';
  end if;
  update public.tabs set name = v_name, guests = p_guests, updated_at = now() where id = p_tab_id;
end;
$$;

create function public.cancel_tab(p_tab_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
begin
  if exists (
    select 1 from public.tab_items
    where tab_id = p_tab_id and ((sent_at is not null and voided_at is null) or paid_quantity > 0)
  ) then
    raise exception 'a tab with sent items can''t be cancelled' using errcode = '22023';
  end if;
  update public.tabs set status = 'cancelled', closed_at = now(), updated_at = now() where id = v_tab.id;
end;
$$;

create function public.add_tab_items(p_tab_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_item jsonb;
  v_variant record;
  v_quantity integer;
  v_option_ids uuid[];
  v_existing uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'add at least one item' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity < 1 or v_quantity > 999 then
      raise exception 'quantity must be between 1 and 999' using errcode = '22023';
    end if;
    select v.id, v.product_id,
      case when v.name = 'Default' then p.name else p.name || ' – ' || v.name end as label
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (v_item ->> 'variant_id')::uuid and v.active and p.active;
    if not found then
      raise exception 'item not available' using errcode = 'P0002';
    end if;
    v_option_ids := array(select (jsonb_array_elements_text(coalesce(v_item -> 'option_ids', '[]'::jsonb)))::uuid order by 1);
    perform private.check_options(v_variant.product_id, v_option_ids, v_variant.label);

    select ti.id into v_existing from public.tab_items ti
    where ti.tab_id = p_tab_id and ti.sent_at is null and ti.variant_id = v_variant.id
      and ti.option_ids = v_option_ids and ti.note is null
    limit 1;
    if found then
      update public.tab_items set quantity = least(999, quantity + v_quantity) where id = v_existing;
    else
      insert into public.tab_items (tab_id, variant_id, option_ids, name, quantity, added_by)
      values (p_tab_id, v_variant.id, v_option_ids, v_variant.label, v_quantity, private.staff_id());
    end if;
  end loop;
  update public.tabs set updated_at = now() where id = v_tab.id;
end;
$$;

create function public.change_tab_item(p_item_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.tab_items := private.lock_tab_item(p_item_id);
begin
  if v_item.sent_at is not null then
    raise exception '%', format('%s has already been sent; void it instead', v_item.name) using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 999 then
    raise exception 'quantity must be between 1 and 999' using errcode = '22023';
  end if;
  if p_quantity = 0 then
    delete from public.tab_items where id = p_item_id;
  else
    update public.tab_items set quantity = p_quantity where id = p_item_id;
  end if;
  update public.tabs set updated_at = now() where id = v_item.tab_id;
end;
$$;

create function public.note_tab_item(p_item_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.tab_items := private.lock_tab_item(p_item_id);
  v_note text := nullif(trim(p_note), '');
begin
  if v_item.sent_at is not null then
    raise exception '%', format('%s has already been sent; void it instead', v_item.name) using errcode = '22023';
  end if;
  if length(v_note) > 100 then
    raise exception 'keep the note under 100 characters' using errcode = '22023';
  end if;
  update public.tab_items set note = v_note where id = p_item_id;
  update public.tabs set updated_at = now() where id = v_item.tab_id;
end;
$$;

create function public.void_tab_item(p_item_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.tab_items := private.lock_tab_item(p_item_id);
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_item.voided_at is not null then
    raise exception '%', format('%s is already voided', v_item.name) using errcode = '22023';
  end if;
  if v_item.sent_at is null then
    raise exception '%', format('%s hasn''t been sent; remove it instead', v_item.name) using errcode = '22023';
  end if;
  if v_item.paid_quantity > 0 then
    raise exception '%', format('%s has been paid; refund it instead', v_item.name) using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception '%', format('give a reason for voiding %s', v_item.name) using errcode = '22023';
  end if;
  if length(v_reason) > 200 then
    raise exception 'keep the reason under 200 characters' using errcode = '22023';
  end if;
  update public.tab_items set voided_at = now(), voided_by = private.staff_id(), void_reason = v_reason where id = p_item_id;
  update public.kitchen_ticket_items set voided = true where tab_item_id = p_item_id;
  update public.kitchen_tickets k set updated_at = now()
  where exists (select 1 from public.kitchen_ticket_items i where i.ticket_id = k.id and i.tab_item_id = p_item_id);
  update public.tabs set updated_at = now() where id = v_item.tab_id;
  perform private.settle_tab(v_item.tab_id);
end;
$$;

create function public.send_tab(p_tab_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_ticket_id uuid;
begin
  v_ticket_id := private.send_lines(v_tab, null);
  update public.tabs set updated_at = now() where id = v_tab.id;
  return v_ticket_id;
end;
$$;

create function public.print_bill(p_tab_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
begin
  update public.tabs set bill_printed_at = now(), updated_at = now() where id = v_tab.id;
end;
$$;
```

Continue the same file with the rebuilt `create_order`. It is the 6a function with the option checks replaced by `private.check_options` and a kitchen ticket at the end:

```sql
drop function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text);

create function public.create_order(
  p_session_id uuid,
  p_lines jsonb,
  p_order_discount jsonb default null,
  p_approval_id uuid default null,
  p_customer_id uuid default null,
  p_payments jsonb default '[]'::jsonb,
  p_tip bigint default 0,
  p_order_name text default null,
  p_kitchen boolean default true
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
  v_option_ids uuid[];
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
  v_ticket_id uuid;
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
    v_delta := private.check_options(v_variant.product_id, v_option_ids, v_variant.label);
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

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 20 then
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

  if coalesce(p_kitchen, true) and exists (
    select 1 from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    where oi.order_id = v_order_id and c.kitchen
  ) then
    v_ticket_id := private.new_ticket(v_store_id, null, v_order_id, coalesce(v_order_name, '#' || v_receipt));
    insert into public.kitchen_ticket_items (ticket_id, quantity, name, choices, sort_order)
    select v_ticket_id, oi.quantity, oi.name,
      (select nullif(string_agg(m.option_name, ' · ' order by m.sort_order), '') from public.order_item_modifiers m where m.order_item_id = oi.id),
      oi.line_number
    from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    where oi.order_id = v_order_id and c.kitchen;
  end if;

  return jsonb_build_object('order_id', v_order_id, 'receipt_number', v_receipt, 'total', v_total, 'change', v_change);
end;
$$;

revoke execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text, boolean) from public, anon;
grant execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text, boolean) to authenticated;
```

Note the payments cap rises from 10 to 20 so a 20-way even split fits. Finish the file with `pay_tab`, the kitchen functions, grants and Realtime:

```sql
create function public.pay_tab(
  p_tab_id uuid,
  p_session_id uuid,
  p_parts jsonb,
  p_order_discount jsonb default null,
  p_approval_id uuid default null,
  p_customer_id uuid default null,
  p_payments jsonb default '[]'::jsonb,
  p_tip bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_part jsonb;
  v_item public.tab_items;
  v_quantity integer;
  v_left integer;
  v_ids uuid[] := '{}';
  v_lines jsonb := '[]'::jsonb;
  v_result jsonb;
  v_done boolean;
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'pick at least one item to pay' using errcode = '22023';
  end if;
  for v_part in select value from jsonb_array_elements(p_parts) loop
    select * into v_item from public.tab_items where id = (v_part ->> 'tab_item_id')::uuid and tab_id = p_tab_id for update;
    if not found or (v_part ->> 'tab_item_id')::uuid = any(v_ids) then
      raise exception 'pick each item once' using errcode = '22023';
    end if;
    v_quantity := (v_part ->> 'quantity')::integer;
    v_left := case when v_item.voided_at is null then v_item.quantity - v_item.paid_quantity else 0 end;
    if v_quantity is null or v_quantity < 1 then
      raise exception 'pick at least one item to pay' using errcode = '22023';
    end if;
    if v_quantity > v_left then
      raise exception '%', format('only %s of %s are left to pay', v_left, v_item.name) using errcode = '22023';
    end if;
    if v_item.variant_id is null then
      raise exception 'item not available' using errcode = 'P0002';
    end if;
    v_ids := v_ids || v_item.id;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'variant_id', v_item.variant_id,
      'quantity', v_quantity,
      'option_ids', to_jsonb(v_item.option_ids),
      'discount_bps', v_part -> 'discount_bps',
      'discount_amount', v_part -> 'discount_amount'
    ));
  end loop;

  perform private.send_lines(v_tab, v_ids);

  v_result := public.create_order(p_session_id, v_lines, p_order_discount, p_approval_id, p_customer_id, p_payments, p_tip, left(private.tab_label(v_tab), 40), false);

  for v_part in select value from jsonb_array_elements(p_parts) loop
    update public.tab_items set paid_quantity = paid_quantity + (v_part ->> 'quantity')::integer
    where id = (v_part ->> 'tab_item_id')::uuid;
  end loop;
  update public.orders set tab_id = p_tab_id where id = (v_result ->> 'order_id')::uuid;
  update public.tabs set updated_at = now() where id = p_tab_id;
  v_done := private.settle_tab(p_tab_id);
  return v_result || jsonb_build_object('tab_paid', v_done);
end;
$$;

create function public.finish_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.kitchen_tickets;
begin
  select * into v_ticket from public.kitchen_tickets where id = p_ticket_id for update;
  if not found or private.staff_id() is null or not private.can_access_store(v_ticket.store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_ticket.done_at is not null then
    raise exception 'this ticket is already done' using errcode = '22023';
  end if;
  update public.kitchen_tickets set done_at = now(), done_by = private.staff_id(), updated_at = now() where id = p_ticket_id;
end;
$$;

create function public.recall_ticket(p_store_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket_id uuid;
begin
  if private.staff_id() is null or not private.can_access_store(p_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into v_ticket_id from public.kitchen_tickets
  where store_id = p_store_id and done_at is not null and done_at > now() - interval '12 hours'
  order by done_at desc
  limit 1
  for update;
  if v_ticket_id is null then
    return null;
  end if;
  update public.kitchen_tickets set done_at = null, done_by = null, updated_at = now() where id = v_ticket_id;
  return v_ticket_id;
end;
$$;

revoke execute on function public.open_tab(uuid, uuid, text, integer), public.move_tab(uuid, uuid), public.update_tab(uuid, text, integer),
  public.cancel_tab(uuid), public.add_tab_items(uuid, jsonb), public.change_tab_item(uuid, integer), public.note_tab_item(uuid, text),
  public.void_tab_item(uuid, text), public.send_tab(uuid), public.print_bill(uuid),
  public.pay_tab(uuid, uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint), public.finish_ticket(uuid), public.recall_ticket(uuid)
  from public, anon;
grant execute on function public.open_tab(uuid, uuid, text, integer), public.move_tab(uuid, uuid), public.update_tab(uuid, text, integer),
  public.cancel_tab(uuid), public.add_tab_items(uuid, jsonb), public.change_tab_item(uuid, integer), public.note_tab_item(uuid, text),
  public.void_tab_item(uuid, text), public.send_tab(uuid), public.print_bill(uuid),
  public.pay_tab(uuid, uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint), public.finish_ticket(uuid), public.recall_ticket(uuid)
  to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.tabs, public.kitchen_tickets;
end;
$$;
```

- [ ] **Step 4: Apply and run the new test**

Run: `npx supabase db reset && npx supabase test db supabase/tests/table_service.test.sql`
Expected: PASS, 49 tests.

If `private.lock_open_tab` raises "this tab is closed" inside `pay_tab`'s `send_lines` call, check that `send_lines` takes the already-locked row and never calls `lock_open_tab` itself.

- [ ] **Step 5: Run every database suite**

Run: `npx supabase test db`
Expected: all pass. `counter_service.test.sql` and `register.test.sql` call `create_order` without `p_kitchen` and keep working. If a test counts rows in a table that now gets kitchen tickets, update only that count.

- [ ] **Step 6: Seed areas and tables, regenerate types**

Append to `supabase/seed.sql`:

```sql
insert into public.dining_areas (id, store_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', 'Inside', 0),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', 'Patio', 1);
insert into public.dining_tables (store_id, area_id, name, seats, sort_order) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000501', 'T1', 2, 0),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000501', 'T2', 2, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000501', 'T3', 4, 2),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000501', 'T4', 6, 3),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000502', 'P1', 4, 0),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000502', 'P2', 4, 1);
```

Run: `npx supabase db reset && npm run db:types && npx tsc --noEmit`
Expected: reset succeeds; types regenerate; no type errors (the `create_order` args gain an optional `p_kitchen`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261016000013_table_service.sql supabase/tests/table_service.test.sql supabase/seed.sql lib/supabase/database.types.ts
git commit -m "feat(tables): areas, tables, tabs, kitchen tickets and pay_tab in the database"
```

### Task 2: Shared logic — tab lines, splitting, kitchen timer, schemas, errors, nav

**Files:**
- Create: `lib/tabs/lines.ts`, `lib/tabs/lines.test.ts`, `lib/tabs/schemas.ts`, `lib/tabs/schemas.test.ts`, `lib/tabs/errors.ts`, `lib/tabs/errors.test.ts`, `lib/kitchen/tone.ts`, `lib/kitchen/tone.test.ts`
- Modify: `lib/checkout.ts`, `lib/checkout.test.ts`, `lib/register/cart.ts`, `lib/register/sale-schema.ts`, `lib/nav.ts`, `lib/nav.test.ts`, `components/_common/sidebar/nav-icons.ts`
- Create: `public/assets/images/_common/nav/tables.svg`, `public/assets/images/_common/nav/kitchen.svg`

**Interfaces:**
- Consumes: `RegisterProduct`, `CartLine`, `Discount`, `variantLabel` from `lib/register/cart.ts`; `priceCart`, `allocate` from `lib/checkout.ts`; `selectionFromIds` from `lib/modifiers.ts`; `registerDbError` from `lib/register/errors.ts`.
- Produces:
  - `lib/register/cart.ts`: `cartLineFor(product, variant, optionIds: string[], quantity: number, key: string): CartLine`
  - `lib/checkout.ts`: `splitEvenly(due: number, people: number): number[]`
  - `lib/tabs/lines.ts`:
    - `type TabLine = { id: string; variantId: string | null; optionIds: string[]; name: string; quantity: number; paidQuantity: number; note: string | null; sentAt: string | null; voidedAt: string | null; voidReason: string | null }`
    - `type TabLineRow` (the database row shape) and `toTabLine(row: TabLineRow): TabLine`
    - `type PayPick = Record<string, number>`
    - `leftToPay(line): number`, `pickAll(lines): PayPick`, `setPick(pick, line, quantity): PayPick`, `partsFrom(pick, discounts): PayPart[]`
    - `tabCartLines(lines, products, pick, discounts): { lines: CartLine[]; missing: string[] }`
    - `tabTotal(lines, products, pricesIncludeTax): number`
    - `tabLabel(tableName: string | null, name: string | null): string`
    - `TAB_LINE_SELECT` (the PostgREST select string for tab lines)
  - `lib/tabs/schemas.ts`: `areaSchema`, `tableSchema`, `openTabSchema`, `reasonSchema`, `noteSchema`, `payTabSchema`, `type PayTabInput`
  - `lib/tabs/errors.ts`: `tabDbError(error): string`
  - `lib/kitchen/tone.ts`: `ticketMinutes(sentAt: string, now: number): number`, `ticketTone(minutes: number): "normal" | "late" | "overdue"`
  - `lib/nav.ts`: `NavKey` gains `"tables" | "kitchen"`; both `minRole: "cashier"`, right after Register.

- [ ] **Step 1: Write the failing tests**

`lib/tabs/lines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RegisterProduct } from "@/lib/register/cart";
import { leftToPay, partsFrom, pickAll, setPick, tabCartLines, tabLabel, tabTotal, toTabLine, type TabLine } from "./lines";

const latte: RegisterProduct = {
  id: "p-latte",
  name: "Latte",
  categoryId: "c1",
  kitchen: true,
  modifierGroups: [{ id: "g-milk", name: "Milk", min: 1, max: 1, options: [{ id: "o-oat", name: "Oat", priceDelta: 50 }] }],
  variants: [{ id: "v-latte", name: "Default", sku: "LAT", barcode: null, price: 420, rateBps: 1000, track: false, quantity: 0 }],
};
const beer: RegisterProduct = {
  id: "p-beer",
  name: "Beer",
  categoryId: null,
  kitchen: false,
  modifierGroups: [],
  variants: [{ id: "v-beer", name: "Default", sku: "BEER", barcode: null, price: 600, rateBps: 1000, track: false, quantity: 0 }],
};

function line(patch: Partial<TabLine>): TabLine {
  return { id: "l1", variantId: "v-beer", optionIds: [], name: "Beer", quantity: 3, paidQuantity: 0, note: null, sentAt: "2026-10-16T10:00:00Z", voidedAt: null, voidReason: null, ...patch };
}

describe("tab lines", () => {
  it("maps a database row", () => {
    expect(
      toTabLine({ id: "l1", variant_id: "v-beer", option_ids: ["o"], name: "Beer", quantity: 2, paid_quantity: 1, note: "cold", sent_at: null, voided_at: null, void_reason: null }),
    ).toEqual({ id: "l1", variantId: "v-beer", optionIds: ["o"], name: "Beer", quantity: 2, paidQuantity: 1, note: "cold", sentAt: null, voidedAt: null, voidReason: null });
  });

  it("knows what's left to pay", () => {
    expect(leftToPay(line({ quantity: 3, paidQuantity: 1 }))).toBe(2);
    expect(leftToPay(line({ voidedAt: "2026-10-16T10:05:00Z" }))).toBe(0);
  });

  it("picks everything left and clamps a pick", () => {
    const lines = [line({ id: "a", paidQuantity: 1 }), line({ id: "b", voidedAt: "x", voidReason: "spilled" }), line({ id: "c", quantity: 1, paidQuantity: 1 })];
    expect(pickAll(lines)).toEqual({ a: 2 });
    expect(setPick({ a: 2 }, lines[0], 5)).toEqual({ a: 2 });
    expect(setPick({ a: 2 }, lines[0], 0)).toEqual({});
  });

  it("turns a pick into pay_tab parts with line discounts", () => {
    expect(partsFrom({ a: 2, b: 1 }, { b: { bps: 1000 } })).toEqual([
      { tabItemId: "a", quantity: 2, discountBps: null, discountAmount: null },
      { tabItemId: "b", quantity: 1, discountBps: 1000, discountAmount: null },
    ]);
  });

  it("builds cart lines from the current catalog price, keyed by tab line", () => {
    const lines = [line({ id: "a", variantId: "v-latte", optionIds: ["o-oat"], name: "Latte", quantity: 2 }), line({ id: "b" }), line({ id: "gone", variantId: null, name: "Old pie" })];
    const result = tabCartLines(lines, [latte, beer], { a: 1, b: 3, gone: 1 }, {});
    expect(result.lines.map((entry) => [entry.key, entry.price, entry.quantity, entry.modifierLabel])).toEqual([
      ["a", 470, 1, "Oat"],
      ["b", 600, 3, ""],
    ]);
    expect(result.missing).toEqual(["Old pie"]);
  });

  it("follows a price change", () => {
    const repriced = { ...beer, variants: [{ ...beer.variants[0], price: 650 }] };
    expect(tabCartLines([line({ id: "b", quantity: 1 })], [repriced], { b: 1 }, {}).lines[0].price).toBe(650);
  });

  it("totals what's left on the tab", () => {
    expect(tabTotal([line({ id: "b", quantity: 3, paidQuantity: 1 })], [beer], false)).toBe(1320);
    expect(tabTotal([], [beer], false)).toBe(0);
  });

  it("labels a tab", () => {
    expect(tabLabel("P1", null)).toBe("P1");
    expect(tabLabel(null, "Sam")).toBe("Sam");
    expect(tabLabel("P1", "Sam")).toBe("P1 · Sam");
  });
});
```

Add to `lib/checkout.test.ts`:

```ts
describe("splitEvenly", () => {
  it("adds up exactly with extra cents first", () => {
    expect(splitEvenly(1001, 3)).toEqual([334, 334, 333]);
    expect(splitEvenly(1000, 2)).toEqual([500, 500]);
    expect(splitEvenly(2, 3)).toEqual([1, 1, 0]);
  });
  it("refuses fewer than 1 or more than 20 people", () => {
    expect(() => splitEvenly(100, 0)).toThrow(CartError);
    expect(() => splitEvenly(100, 21)).toThrow(CartError);
  });
});
```

and add `splitEvenly` to that file's import from `./checkout`.

`lib/kitchen/tone.test.ts`:

```ts
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
```

`lib/tabs/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { areaSchema, openTabSchema, payTabSchema, reasonSchema, tableSchema } from "./schemas";

const ID = "00000000-0000-0000-0000-000000000001";

describe("tab schemas", () => {
  it("checks areas and tables", () => {
    expect(areaSchema.safeParse({ id: "", name: " Patio " }).data).toEqual({ id: undefined, name: "Patio" });
    expect(areaSchema.safeParse({ name: "" }).success).toBe(false);
    expect(tableSchema.safeParse({ areaId: ID, name: "P1", seats: "4" }).data).toEqual({ id: undefined, areaId: ID, name: "P1", seats: 4 });
    expect(tableSchema.safeParse({ areaId: ID, name: "P1", seats: "0" }).error?.issues[0].message).toBe("Seats must be between 1 and 50");
  });

  it("opens a table tab or a named bar tab", () => {
    expect(openTabSchema.safeParse({ tableId: ID, name: "", guests: "3" }).data).toEqual({ tableId: ID, name: "", guests: 3 });
    expect(openTabSchema.safeParse({ tableId: "", name: "Sam", guests: "" }).data).toEqual({ tableId: null, name: "Sam", guests: null });
    expect(openTabSchema.safeParse({ tableId: "", name: " ", guests: "" }).error?.issues[0].message).toBe("Name the bar tab");
  });

  it("needs a reason", () => {
    expect(reasonSchema.safeParse({ reason: "  " }).error?.issues[0].message).toBe("Give a reason");
  });

  it("allows up to 20 payments on a tab part", () => {
    const payments = Array.from({ length: 20 }, () => ({ method: "cash" as const, amount: 1 }));
    const input = { tabId: ID, sessionId: ID, parts: [{ tabItemId: ID, quantity: 1 }], orderDiscount: null, approvalId: null, customerId: null, payments, tip: 0 };
    expect(payTabSchema.safeParse(input).success).toBe(true);
    expect(payTabSchema.safeParse({ ...input, parts: [] }).success).toBe(false);
  });
});
```

`lib/tabs/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tabDbError } from "./errors";

describe("tabDbError", () => {
  it("writes database messages as sentences", () => {
    expect(tabDbError({ code: "22023", message: "Beer has already been sent; void it instead" })).toBe("Beer has already been sent. Void it instead.");
    expect(tabDbError({ code: "22023", message: "only 2 of Beer are left to pay" })).toBe("Only 2 of Beer are left to pay.");
    expect(tabDbError({ code: "22023", message: "this tab is closed" })).toBe("This tab is closed.");
  });
  it("explains a lost race for a table", () => {
    expect(tabDbError({ code: "23505", message: 'duplicate key value violates unique constraint "tabs_one_open_per_table_idx"' })).toBe("That table already has an open tab.");
  });
});
```

In `lib/nav.test.ts`, replace the three expectations:

```ts
  it("gives cashiers the selling sections", () => {
    expect(keys("cashier")).toEqual(["register", "tables", "kitchen", "orders", "customers"]);
  });
  it("adds products and reports for managers", () => {
    expect(keys("manager")).toEqual(["register", "tables", "kitchen", "products", "orders", "customers", "reports"]);
  });
  it("adds settings for owners", () => {
    expect(keys("owner")).toEqual(["register", "tables", "kitchen", "products", "orders", "customers", "reports", "settings"]);
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run lib/tabs lib/kitchen lib/checkout.test.ts lib/nav.test.ts`
Expected: FAIL — cannot resolve `./lines`, `./schemas`, `./errors`, `./tone`; `splitEvenly` is not exported; nav keys differ.

- [ ] **Step 3: Implement**

Add to `lib/register/cart.ts`, after `buildLine`:

```ts
export function cartLineFor(product: RegisterProduct, variant: RegisterVariant, optionIds: string[], quantity: number, key: string): CartLine {
  return { ...buildLine(product, variant, selectionFromIds(product.modifierGroups, optionIds), quantity, null, null), key };
}
```

and add `selectionFromIds` to its import from `@/lib/modifiers`.

In `lib/register/sale-schema.ts`, change the payments array's `.max(10)` to `.max(20)`.

Add to `lib/checkout.ts`:

```ts
export function splitEvenly(due: number, people: number): number[] {
  if (!Number.isInteger(people) || people < 1 || people > 20) throw new CartError("Split between 1 and 20 people");
  return allocate(due, Array.from({ length: people }, () => 1));
}
```

`lib/tabs/lines.ts`:

```ts
import { priceCart } from "@/lib/checkout";
import { cartInputs, cartLineFor, type CartLine, type Discount, type RegisterProduct } from "@/lib/register/cart";

export type TabLine = {
  id: string;
  variantId: string | null;
  optionIds: string[];
  name: string;
  quantity: number;
  paidQuantity: number;
  note: string | null;
  sentAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

export type TabLineRow = {
  id: string;
  variant_id: string | null;
  option_ids: string[];
  name: string;
  quantity: number;
  paid_quantity: number;
  note: string | null;
  sent_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type PayPick = Record<string, number>;
export type PayPart = { tabItemId: string; quantity: number; discountBps: number | null; discountAmount: number | null };

export const TAB_LINE_SELECT = "id, variant_id, option_ids, name, quantity, paid_quantity, note, sent_at, voided_at, void_reason, added_at";

export function toTabLine(row: TabLineRow): TabLine {
  return {
    id: row.id,
    variantId: row.variant_id,
    optionIds: row.option_ids,
    name: row.name,
    quantity: row.quantity,
    paidQuantity: row.paid_quantity,
    note: row.note,
    sentAt: row.sent_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
  };
}

export function leftToPay(line: TabLine): number {
  return line.voidedAt ? 0 : line.quantity - line.paidQuantity;
}

export function pickAll(lines: TabLine[]): PayPick {
  return Object.fromEntries(lines.filter((line) => leftToPay(line) > 0).map((line) => [line.id, leftToPay(line)]));
}

export function setPick(pick: PayPick, line: TabLine, quantity: number): PayPick {
  const next = { ...pick };
  const clamped = Math.min(leftToPay(line), Math.max(0, Math.floor(quantity)));
  if (clamped === 0) delete next[line.id];
  else next[line.id] = clamped;
  return next;
}

export function partsFrom(pick: PayPick, discounts: Record<string, Discount>): PayPart[] {
  return Object.entries(pick)
    .filter(([, quantity]) => quantity > 0)
    .map(([tabItemId, quantity]) => {
      const discount = discounts[tabItemId] ?? null;
      return {
        tabItemId,
        quantity,
        discountBps: discount && "bps" in discount ? discount.bps : null,
        discountAmount: discount && "amount" in discount ? discount.amount : null,
      };
    });
}

export function tabCartLines(lines: TabLine[], products: RegisterProduct[], pick: PayPick, discounts: Record<string, Discount>): { lines: CartLine[]; missing: string[] } {
  const result: CartLine[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    const quantity = pick[line.id] ?? 0;
    if (quantity <= 0) continue;
    const product = products.find((entry) => entry.variants.some((variant) => variant.id === line.variantId));
    const variant = product?.variants.find((entry) => entry.id === line.variantId);
    if (!product || !variant) {
      missing.push(line.name);
      continue;
    }
    const discount = discounts[line.id] ?? null;
    result.push({
      ...cartLineFor(product, variant, line.optionIds, quantity, line.id),
      discountBps: discount && "bps" in discount ? discount.bps : null,
      discountAmount: discount && "amount" in discount ? discount.amount : null,
    });
  }
  return { lines: result, missing };
}

export function tabTotal(lines: TabLine[], products: RegisterProduct[], pricesIncludeTax: boolean): number {
  const cart = tabCartLines(lines, products, pickAll(lines), {}).lines;
  if (cart.length === 0) return 0;
  try {
    return priceCart(cartInputs(cart), null, pricesIncludeTax).total;
  } catch {
    return 0;
  }
}

export function tabLabel(tableName: string | null, name: string | null): string {
  if (tableName && name) return `${tableName} · ${name}`;
  return tableName ?? name ?? "Tab";
}
```

`lib/tabs/schemas.ts`:

```ts
import { z } from "zod";

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalId = z.preprocess((value) => (value === "" ? undefined : value), z.guid().optional());

export const areaSchema = z.object({
  id: optionalId,
  name: z.string().trim().min(1, "Enter an area name").max(40, "Keep it under 40 characters"),
});

export const tableSchema = z.object({
  id: optionalId,
  areaId: z.guid("Pick an area"),
  name: z.string().trim().min(1, "Enter a table name").max(20, "Keep it under 20 characters"),
  seats: z.coerce.number().int("Seats must be between 1 and 50").min(1, "Seats must be between 1 and 50").max(50, "Seats must be between 1 and 50"),
});

export const openTabSchema = z
  .object({
    tableId: z.preprocess((value) => (value === "" ? null : value), z.guid().nullable()),
    name: z.string().max(40, "Keep the name under 40 characters"),
    guests: z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
      z.number().int("Guests must be between 1 and 99").min(1, "Guests must be between 1 and 99").max(99, "Guests must be between 1 and 99").nullable(),
    ),
  })
  .refine((value) => value.tableId !== null || value.name.trim() !== "", { message: "Name the bar tab", path: ["name"] });

export const reasonSchema = z.object({ reason: z.string().trim().min(1, "Give a reason").max(200, "Keep it under 200 characters") });

export const noteSchema = z.object({ note: z.string().trim().max(100, "Keep the note under 100 characters") });

export const payTabSchema = z.object({
  tabId: z.guid(),
  sessionId: z.guid(),
  parts: z
    .array(
      z.object({
        tabItemId: z.guid(),
        quantity: z.number().int().min(1).max(999),
        discountBps: z.number().int().min(0).max(10_000).nullable().optional(),
        discountAmount: money.nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
  orderDiscount: z.object({ bps: z.number().int().min(0).max(10_000).nullable().optional(), amount: money.nullable().optional() }).nullable(),
  approvalId: z.guid().nullable(),
  customerId: z.guid().nullable(),
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "card", "other"]),
        amount: money,
        tendered: money.nullable().optional(),
        reference: z.string().max(100).nullable().optional(),
      }),
    )
    .max(20),
  tip: money.optional(),
});

export type PayTabInput = z.infer<typeof payTabSchema>;
```

`lib/tabs/errors.ts`:

```ts
import { registerDbError } from "@/lib/register/errors";

export function tabDbError(error: { code?: string; message?: string } | null): string {
  if (error?.code === "23505" && error.message?.includes("tabs_one_open_per_table_idx")) return "That table already has an open tab.";
  return registerDbError(error).replace(/; (\p{L})/u, (_, letter: string) => `. ${letter.toUpperCase()}`);
}
```

`lib/kitchen/tone.ts`:

```ts
export function ticketMinutes(sentAt: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(sentAt)) / 60_000));
}

export function ticketTone(minutes: number): "normal" | "late" | "overdue" {
  if (minutes >= 20) return "overdue";
  if (minutes >= 10) return "late";
  return "normal";
}
```

`lib/nav.ts`: change the key type and list:

```ts
export type NavKey = "register" | "tables" | "kitchen" | "products" | "orders" | "customers" | "reports" | "settings";

export const NAV_ITEMS: NavItem[] = [
  { key: "register", label: "Register", href: "/register", minRole: "cashier" },
  { key: "tables", label: "Tables", href: "/tables", minRole: "cashier" },
  { key: "kitchen", label: "Kitchen", href: "/kitchen", minRole: "cashier" },
  { key: "products", label: "Products", href: "/products", minRole: "manager" },
  { key: "orders", label: "Orders", href: "/orders", minRole: "cashier" },
  { key: "customers", label: "Customers", href: "/customers", minRole: "cashier" },
  { key: "reports", label: "Reports", href: "/reports", minRole: "manager" },
  { key: "settings", label: "Settings", href: "/settings", minRole: "owner" },
];
```

`public/assets/images/_common/nav/tables.svg` (same 14px stroke style as the other nav icons):

```svg
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="table">
<path id="Icon" d="M1.75 4.66667H12.25M3.5 4.66667V11.6667M10.5 4.66667V11.6667M2.33333 2.33333H11.6667M5.25 8.16667H8.75" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</svg>
```

`public/assets/images/_common/nav/kitchen.svg`:

```svg
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="flame">
<path id="Icon" d="M7 12.8333C9.25516 12.8333 11.0833 11.0052 11.0833 8.75C11.0833 6.41667 9.33333 4.66667 8.16667 1.16667C6.41667 2.91667 5.83333 4.66667 5.83333 5.83333C5.25 5.25 4.66667 4.66667 4.66667 3.5C3.5 4.66667 2.91667 6.41667 2.91667 8.75C2.91667 11.0052 4.74484 12.8333 7 12.8333Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</svg>
```

`components/_common/sidebar/nav-icons.ts`: import both and add them to the map:

```ts
import TablesIcon from "@/public/assets/images/_common/nav/tables.svg";
import KitchenIcon from "@/public/assets/images/_common/nav/kitchen.svg";
```

```ts
export const NAV_ICONS: Record<NavKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  register: RegisterIcon,
  tables: TablesIcon,
  kitchen: KitchenIcon,
  products: ProductsIcon,
  orders: OrdersIcon,
  customers: CustomersIcon,
  reports: ReportsIcon,
  settings: SettingsIcon,
};
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors. `e2e/roles.spec.ts` checks nav labels in the browser; update its expected lists in Task 6 when the e2e suite runs.

- [ ] **Step 5: Commit**

```bash
git add lib public/assets/images/_common/nav components/_common/sidebar/nav-icons.ts
git commit -m "feat(tables): tab lines, even splits, kitchen timer, schemas and nav"
```

### Task 3: Floor, table setup, opening tabs, live updates

**Files:**
- Create: `hooks/use-live-refresh.ts`, `hooks/use-now.ts`
- Create: `lib/tables/queries.ts`, `lib/tables/actions.ts`, `lib/tabs/actions.ts`
- Create: `app/(app)/tables/page.tsx`, `app/(app)/tables/setup/page.tsx`
- Create: `components/tables/floor.tsx`, `components/tables/table-tile.tsx`, `components/tables/open-tab-dialog.tsx`, `components/tables/areas-editor.tsx`

**Interfaces:**
- Consumes: `open_tab` and the setup tables from Task 1; `tabTotal`, `leftToPay`, `toTabLine`, `TAB_LINE_SELECT`, `tabLabel`, `openTabSchema`, `areaSchema`, `tableSchema`, `tabDbError` from Task 2; `loadRegisterCatalog` from `lib/register/queries.ts`; `moveInOrder` from `lib/catalog/category-order.ts`.
- Produces:
  - `useLiveRefresh(table: "tabs" | "kitchen_tickets", storeId: string): void`
  - `useNow(): number | null` (ticks every 15 seconds; null during server render)
  - `lib/tables/queries.ts`: `type AreaWithTables`, `loadAreas(supabase, storeId)`, `type FloorTab`, `loadOpenTabs(supabase, storeId, products, pricesIncludeTax)`
  - `lib/tabs/actions.ts`: `openTab(input: { tableId: string | null; name: string; guests: string }): Promise<{ ok: true; tabId: string } | { ok: false; error: string }>` (Task 4 adds the rest of the tab actions to this file)
  - `OpenTabDialog` with `target: { tableId: string; tableName: string } | { bar: true } | null`

- [ ] **Step 1: Hooks**

`hooks/use-live-refresh.ts`:

```ts
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function useLiveRefresh(table: "tabs" | "kitchen_tickets", storeId: string) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    const channel = supabase
      .channel(`live-${table}-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `store_id=eq.${storeId}` }, refresh);
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    const fallback = setInterval(() => router.refresh(), 30_000);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [router, table, storeId]);
}
```

`hooks/use-now.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

const STEP = 15_000;

function subscribe(callback: () => void) {
  const id = setInterval(callback, STEP);
  return () => clearInterval(id);
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / STEP) * STEP,
    () => null,
  );
}
```

- [ ] **Step 2: Queries and actions**

`lib/tables/queries.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { RegisterProduct } from "@/lib/register/cart";
import { leftToPay, tabTotal, toTabLine, TAB_LINE_SELECT, type TabLineRow } from "@/lib/tabs/lines";

type Client = SupabaseClient<Database>;

export type DiningTable = { id: string; name: string; seats: number; active: boolean };
export type AreaWithTables = { id: string; name: string; active: boolean; tables: DiningTable[] };
export type FloorTab = {
  id: string;
  tableId: string | null;
  name: string | null;
  guests: number | null;
  openedAt: string;
  openedBy: string;
  billPrinted: boolean;
  total: number;
  itemCount: number;
};

export async function loadAreas(supabase: Client, storeId: string): Promise<AreaWithTables[]> {
  const [{ data: areas }, { data: tables }] = await Promise.all([
    supabase.from("dining_areas").select("id, name, active, sort_order").eq("store_id", storeId).order("sort_order").order("name"),
    supabase.from("dining_tables").select("id, area_id, name, seats, active, sort_order").eq("store_id", storeId).order("sort_order").order("name"),
  ]);
  return (areas ?? []).map((area) => ({
    id: area.id,
    name: area.name,
    active: area.active,
    tables: (tables ?? [])
      .filter((table) => table.area_id === area.id)
      .map((table) => ({ id: table.id, name: table.name, seats: table.seats, active: table.active })),
  }));
}

type OpenTabRow = {
  id: string;
  table_id: string | null;
  name: string | null;
  guests: number | null;
  opened_at: string;
  bill_printed_at: string | null;
  opener: { name: string } | null;
  tab_items: TabLineRow[];
};

export async function loadOpenTabs(supabase: Client, storeId: string, products: RegisterProduct[], pricesIncludeTax: boolean): Promise<FloorTab[]> {
  const { data } = await supabase
    .from("tabs")
    .select(`id, table_id, name, guests, opened_at, bill_printed_at, opener:staff!tabs_opened_by_fkey(name), tab_items(${TAB_LINE_SELECT})`)
    .eq("store_id", storeId)
    .eq("status", "open")
    .order("opened_at");
  return ((data ?? []) as unknown as OpenTabRow[]).map((row) => {
    const lines = row.tab_items.map(toTabLine);
    return {
      id: row.id,
      tableId: row.table_id,
      name: row.name,
      guests: row.guests,
      openedAt: row.opened_at,
      openedBy: row.opener?.name ?? "",
      billPrinted: row.bill_printed_at !== null,
      total: tabTotal(lines, products, pricesIncludeTax),
      itemCount: lines.reduce((sum, line) => sum + leftToPay(line), 0),
    };
  });
}
```

`lib/tabs/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { openTabSchema } from "./schemas";
import { tabDbError } from "./errors";

export async function openTab(input: { tableId: string | null; name: string; guests: string }): Promise<{ ok: true; tabId: string } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = openTabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the tab's details." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_tab", {
    p_store_id: store.id,
    p_table_id: parsed.data.tableId ?? undefined,
    p_name: parsed.data.name.trim() || undefined,
    p_guests: parsed.data.guests ?? undefined,
  });
  if (error || !data) return { ok: false, error: tabDbError(error) };
  revalidatePath("/tables");
  return { ok: true, tabId: data };
}
```

`lib/tables/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { moveInOrder } from "@/lib/catalog/category-order";
import { areaSchema, tableSchema } from "@/lib/tabs/schemas";
import { tabDbError } from "@/lib/tabs/errors";

const GONE = "That no longer exists. Reload the page and try again.";

async function context() {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  return { store, supabase: await createClient() };
}

function done(): ActionResult {
  revalidatePath("/tables", "layout");
  return { ok: true };
}

export async function saveArea(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { store, supabase } = await context();
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = areaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { id, name } = parsed.data;
  if (id) {
    const { data, error } = await supabase.from("dining_areas").update({ name }).eq("id", id).select("id");
    if (error) return { ok: false, error: tabDbError(error) };
    if (!data?.length) return { ok: false, error: GONE };
  } else {
    const { count } = await supabase.from("dining_areas").select("id", { count: "exact", head: true }).eq("store_id", store.id);
    const { error } = await supabase.from("dining_areas").insert({ store_id: store.id, name, sort_order: count ?? 0 });
    if (error) return { ok: false, error: tabDbError(error) };
  }
  return done();
}

export async function saveTable(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { store, supabase } = await context();
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = tableSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { id, areaId, name, seats } = parsed.data;
  if (id) {
    const { data, error } = await supabase.from("dining_tables").update({ name, seats }).eq("id", id).select("id");
    if (error) return { ok: false, error: tabDbError(error) };
    if (!data?.length) return { ok: false, error: GONE };
  } else {
    const { count } = await supabase.from("dining_tables").select("id", { count: "exact", head: true }).eq("area_id", areaId);
    const { error } = await supabase.from("dining_tables").insert({ store_id: store.id, area_id: areaId, name, seats, sort_order: count ?? 0 });
    if (error) return { ok: false, error: tabDbError(error) };
  }
  return done();
}

export async function setActive(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { supabase } = await context();
  const parsed = z.object({ kind: z.enum(["area", "table"]), id: z.guid(), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: GONE };
  const table = parsed.data.kind === "area" ? "dining_areas" : "dining_tables";
  const { data, error } = await supabase.from(table).update({ active: parsed.data.active === "true" }).eq("id", parsed.data.id).select("id");
  if (error) return { ok: false, error: tabDbError(error) };
  if (!data?.length) return { ok: false, error: GONE };
  return done();
}

export async function move(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { store, supabase } = await context();
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const parsed = z.object({ kind: z.enum(["area", "table"]), id: z.guid(), direction: z.enum(["-1", "1"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: GONE };
  const direction = Number(parsed.data.direction) as -1 | 1;
  if (parsed.data.kind === "area") {
    const { data } = await supabase.from("dining_areas").select("id").eq("store_id", store.id).order("sort_order").order("name");
    for (const [index, id] of moveInOrder((data ?? []).map((row) => row.id), parsed.data.id, direction).entries()) {
      const { error } = await supabase.from("dining_areas").update({ sort_order: index }).eq("id", id);
      if (error) return { ok: false, error: tabDbError(error) };
    }
  } else {
    const { data: row } = await supabase.from("dining_tables").select("area_id").eq("id", parsed.data.id).maybeSingle();
    if (!row) return { ok: false, error: GONE };
    const { data } = await supabase.from("dining_tables").select("id").eq("area_id", row.area_id).order("sort_order").order("name");
    for (const [index, id] of moveInOrder((data ?? []).map((entry) => entry.id), parsed.data.id, direction).entries()) {
      const { error } = await supabase.from("dining_tables").update({ sort_order: index }).eq("id", id);
      if (error) return { ok: false, error: tabDbError(error) };
    }
  }
  return done();
}
```

- [ ] **Step 3: Setup page**

`app/(app)/tables/setup/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { ScrollArea } from "@/components/_ui/scroll-area";
import Button from "@/components/_ui/button";
import AreasEditor from "@/components/tables/areas-editor";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadAreas } from "@/lib/tables/queries";

export const metadata: Metadata = { title: "Set up tables" };

export default async function TablesSetupPage() {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="tables-setup" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Set up tables" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }
  const supabase = await createClient();
  const areas = await loadAreas(supabase, store.id);
  return (
    <section id="tables-setup" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={`Set up tables · ${store.name}`} actions={<Button href="/tables" variant="ghost" size="md">Back to tables</Button>} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-[48em] flex-col gap-6 p-4">
          <AreasEditor areas={areas} />
        </div>
      </ScrollArea>
    </section>
  );
}
```

`components/tables/areas-editor.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import Card from "@/components/_common/card";
import type { ActionResult } from "@/lib/action-result";
import { move, saveArea, saveTable, setActive } from "@/lib/tables/actions";
import type { AreaWithTables, DiningTable } from "@/lib/tables/queries";
import { cn } from "@/lib/utils";

function errorOf(...states: ActionResult[]): string | undefined {
  for (const state of states) {
    if (state && !state.ok) return state.error ?? Object.values(state.fieldErrors ?? {})[0];
  }
  return undefined;
}

function MoveButtons({ kind, id, label, first, last }: { kind: "area" | "table"; id: string; label: string; first: boolean; last: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(move, null);
  return (
    <>
      {(["-1", "1"] as const).map((direction) => (
        <form key={direction} action={action}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="direction" value={direction} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending || (direction === "-1" ? first : last)} aria-label={`Move ${label} ${direction === "-1" ? "up" : "down"}`}>
            {direction === "-1" ? "↑" : "↓"}
          </Button>
        </form>
      ))}
      {state && !state.ok && <span role="alert" className="caption-style text-danger basis-full">{state.error}</span>}
    </>
  );
}

function ActiveButton({ kind, id, label, active }: { kind: "area" | "table"; id: string; label: string; active: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(setActive, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label={`${active ? "Archive" : "Restore"} ${label}`}>
        {active ? "Archive" : "Restore"}
      </Button>
      {state && !state.ok && <span role="alert" className="caption-style text-danger">{state.error}</span>}
    </form>
  );
}

function TableRow({ table, areaId, first, last }: { table: DiningTable; areaId: string; first: boolean; last: boolean }) {
  const [name, setName] = useState(table.name);
  const [seats, setSeats] = useState(String(table.seats));
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTable, null);
  return (
    <li className={cn("flex flex-wrap items-center gap-2 py-2", !table.active && "opacity-60")}>
      <form action={action} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={table.id} />
        <input type="hidden" name="areaId" value={areaId} />
        <Input name="name" aria-label={`Name for table ${table.name}`} className="w-[8em]" value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
        <Input name="seats" aria-label={`Seats at ${table.name}`} inputMode="numeric" className="w-[5em]" value={seats} onChange={(event) => setSeats(event.target.value)} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending || (name.trim() === table.name && seats === String(table.seats))}>Save</Button>
      </form>
      <MoveButtons kind="table" id={table.id} label={table.name} first={first} last={last} />
      <ActiveButton kind="table" id={table.id} label={table.name} active={table.active} />
      {errorOf(state) && <span role="alert" className="caption-style text-danger basis-full">{errorOf(state)}</span>}
    </li>
  );
}

function AddTableForm({ area }: { area: AreaWithTables }) {
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("4");
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await saveTable(prev, formData);
    if (result?.ok) setName("");
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 pt-2">
      <input type="hidden" name="areaId" value={area.id} />
      <Input name="name" aria-label={`New table name in ${area.name}`} placeholder="Table name" className="w-[8em]" value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
      <Input name="seats" aria-label={`Seats for the new table in ${area.name}`} inputMode="numeric" className="w-[5em]" value={seats} onChange={(event) => setSeats(event.target.value)} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending || name.trim() === ""}>Add table</Button>
      {errorOf(state) && <span role="alert" className="caption-style text-danger basis-full">{errorOf(state)}</span>}
    </form>
  );
}

function AreaCard({ area, first, last }: { area: AreaWithTables; first: boolean; last: boolean }) {
  const [name, setName] = useState(area.name);
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveArea, null);
  const active = area.tables.filter((table) => table.active);
  const archived = area.tables.filter((table) => !table.active);
  return (
    <Card className={cn("flex flex-col gap-3", !area.active && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="id" value={area.id} />
          <Input name="name" aria-label={`Name for area ${area.name}`} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" variant="secondary" size="sm" disabled={pending || name.trim() === area.name}>Rename</Button>
        </form>
        <MoveButtons kind="area" id={area.id} label={area.name} first={first} last={last} />
        <ActiveButton kind="area" id={area.id} label={area.name} active={area.active} />
        {errorOf(state) && <span role="alert" className="caption-style text-danger basis-full">{errorOf(state)}</span>}
      </div>
      {area.active && (
        <>
          <ul className="divide-line-strong flex flex-col divide-y">
            {[...active, ...archived].map((table, index) => (
              <TableRow key={table.id} table={table} areaId={area.id} first={index === 0} last={index === active.length - 1 || !table.active} />
            ))}
          </ul>
          <AddTableForm area={area} />
        </>
      )}
    </Card>
  );
}

function AddAreaForm() {
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await saveArea(prev, formData);
    if (result?.ok) setName("");
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Input name="name" aria-label="New area name" placeholder="Area name, like Patio" className="max-w-[20em]" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
      <Button type="submit" variant="primary" size="md" disabled={pending || name.trim() === ""}>Add area</Button>
      {errorOf(state) && <span role="alert" className="caption-style text-danger basis-full">{errorOf(state)}</span>}
    </form>
  );
}

export default function AreasEditor({ areas }: { areas: AreaWithTables[] }) {
  const active = areas.filter((area) => area.active);
  const archived = areas.filter((area) => !area.active);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-subtle">Group tables into areas, like Inside and Patio. Servers see them in this order on the Tables screen.</p>
      {[...active, ...archived].map((area, index) => (
        <AreaCard key={area.id} area={area} first={index === 0} last={index === active.length - 1 || !area.active} />
      ))}
      <AddAreaForm />
    </div>
  );
}
```

- [ ] **Step 4: Floor page and components**

`app/(app)/tables/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Floor from "@/components/tables/floor";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { roleAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { loadRegisterCatalog } from "@/lib/register/queries";
import { loadAreas, loadOpenTabs } from "@/lib/tables/queries";

export const metadata: Metadata = { title: "Tables" };

export default async function TablesPage() {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="tables" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Tables" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }
  const supabase = await createClient();
  const products = await loadRegisterCatalog(supabase, store.id);
  const [areas, tabs] = await Promise.all([loadAreas(supabase, store.id), loadOpenTabs(supabase, store.id, products, store.pricesIncludeTax)]);
  return (
    <Floor
      storeId={store.id}
      currency={store.currency}
      canSetUp={roleAtLeast(staff.role, "manager")}
      areas={areas.filter((area) => area.active).map((area) => ({ ...area, tables: area.tables.filter((table) => table.active) }))}
      tabs={tabs}
    />
  );
}
```

`components/tables/table-tile.tsx`:

```tsx
import Link from "next/link";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import type { FloorTab } from "@/lib/tables/queries";
import { cn } from "@/lib/utils";

type TableTileProps = {
  label: string;
  seats: number | null;
  tab: FloorTab | null;
  now: number | null;
  money: (minor: number) => string;
  onOpen: () => void;
};

const TILE = "flex h-28 w-full flex-col items-start justify-between gap-1 rounded-xl p-3 text-left whitespace-normal";

export default function TableTile({ label, seats, tab, now, money, onOpen }: TableTileProps) {
  if (!tab) {
    return (
      <Button variant="ghost" size="none" aria-label={`Open ${label}`} className={cn(TILE, "text-foreground bg-white/4 hover:bg-white/8")} onClick={onOpen}>
        <span className="lead-style">{label}</span>
        <span className="caption-style text-soft">{seats ? `${seats} seats · Free` : "Free"}</span>
      </Button>
    );
  }
  const minutes = now === null ? null : Math.max(0, Math.floor((now - Date.parse(tab.openedAt)) / 60_000));
  return (
    <Link
      href={`/tabs/${tab.id}`}
      aria-label={`${label}, ${tab.itemCount} items, ${money(tab.total)}${tab.billPrinted ? ", bill printed" : ""}`}
      className={cn(TILE, "bg-primary/15 hover:bg-primary/25 transition-colors duration-150", tab.billPrinted && "ring-primary ring-2")}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="lead-style truncate">{label}</span>
        {tab.billPrinted && <Tag tone="purple" size="sm">Bill</Tag>}
      </span>
      <span className="text-[18px] leading-none font-semibold tabular-nums">{money(tab.total)}</span>
      <span className="caption-style text-soft w-full truncate tabular-nums">
        {[tab.guests ? `${tab.guests} guests` : null, minutes === null ? null : `${minutes} min`, tab.openedBy.split(" ")[0] || null].filter(Boolean).join(" · ")}
      </span>
    </Link>
  );
}
```

`components/tables/open-tab-dialog.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { openTab } from "@/lib/tabs/actions";

export type OpenTabTarget = { tableId: string; tableName: string } | { bar: true };

function OpenTabForm({ target }: { target: OpenTabTarget }) {
  const router = useRouter();
  const bar = "bar" in target;
  const [guests, setGuests] = useState(bar ? "" : "2");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await openTab({ tableId: bar ? null : target.tableId, name, guests });
    if (result.ok) router.push(`/tabs/${result.tabId}`);
    else {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>{bar ? "New bar tab" : `Open ${target.tableName}`}</DialogTitle>
        <DialogDescription>{bar ? "Name the tab so the bar can find it later." : "How many guests are at the table?"}</DialogDescription>
      </DialogHeader>
      {bar ? (
        <Field label="Name" htmlFor="tab-name">
          <Input id="tab-name" className="min-h-11" maxLength={40} value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </Field>
      ) : (
        <Field label="Guests" htmlFor="tab-guests">
          <Input id="tab-guests" className="min-h-11" inputMode="numeric" value={guests} autoFocus onChange={(event) => setGuests(event.target.value)} />
        </Field>
      )}
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>
          {pending ? "Opening…" : "Open tab"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function OpenTabDialog({ target, onClose }: { target: OpenTabTarget | null; onClose: () => void }) {
  const open = target !== null;
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>{target && <OpenTabForm key={openCount} target={target} />}</DialogContent>
    </Dialog>
  );
}
```

`components/tables/floor.tsx`:

```tsx
"use client";

import { useState } from "react";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import TableTile from "./table-tile";
import OpenTabDialog, { type OpenTabTarget } from "./open-tab-dialog";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { useNow } from "@/hooks/use-now";
import { formatMoney } from "@/lib/money";
import type { AreaWithTables, FloorTab } from "@/lib/tables/queries";

type FloorProps = { storeId: string; currency: string; canSetUp: boolean; areas: AreaWithTables[]; tabs: FloorTab[] };

const GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]";

export default function Floor({ storeId, currency, canSetUp, areas, tabs }: FloorProps) {
  useLiveRefresh("tabs", storeId);
  const now = useNow();
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const [areaId, setAreaId] = useState("");
  const [target, setTarget] = useState<OpenTabTarget | null>(null);
  const byTable = new Map(tabs.filter((tab) => tab.tableId).map((tab) => [tab.tableId!, tab]));
  const barTabs = tabs.filter((tab) => !tab.tableId);
  const shown = areas.filter((area) => !areaId || area.id === areaId);

  return (
    <section id="tables" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title="Tables"
        actions={
          <>
            {canSetUp && <Button href="/tables/setup" variant="ghost" size="md">Set up tables</Button>}
            <Button variant="secondary" size="md" onClick={() => setTarget({ bar: true })}>New bar tab</Button>
          </>
        }
      />
      {areas.length > 1 && (
        <div role="group" aria-label="Areas" className="border-line-strong flex gap-1 overflow-x-auto border-b px-3 py-2">
          {[{ id: "", name: "All" }, ...areas].map((area) => (
            <Button
              key={area.id || "all"}
              variant="ghost"
              size="md"
              aria-pressed={areaId === area.id}
              className="aria-pressed:text-foreground min-h-11 shrink-0 aria-pressed:bg-white/6"
              onClick={() => setAreaId(area.id)}
            >
              {area.name}
            </Button>
          ))}
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        {areas.length === 0 && barTabs.length === 0 ? (
          <EmptyState
            title="No tables yet"
            description={canSetUp ? "Add areas and tables to start taking orders at the table. Bar tabs work without them." : "Ask a manager to set up tables. Bar tabs work without them."}
            action={canSetUp ? <Button href="/tables/setup" variant="primary" size="md">Set up tables</Button> : undefined}
          />
        ) : (
          <div className="flex flex-col gap-6 p-3">
            {shown.map((area) => (
              <section key={area.id} aria-labelledby={`area-${area.id}`} className="flex flex-col gap-2">
                <h2 id={`area-${area.id}`} className="caption-style text-soft uppercase">{area.name}</h2>
                <ul className={GRID}>
                  {area.tables.map((table) => (
                    <li key={table.id}>
                      <TableTile label={table.name} seats={table.seats} tab={byTable.get(table.id) ?? null} now={now} money={money} onOpen={() => setTarget({ tableId: table.id, tableName: table.name })} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {barTabs.length > 0 && (
              <section aria-labelledby="bar-tabs" className="flex flex-col gap-2">
                <h2 id="bar-tabs" className="caption-style text-soft uppercase">Bar tabs</h2>
                <ul className={GRID}>
                  {barTabs.map((tab) => (
                    <li key={tab.id}>
                      <TableTile label={tab.name ?? "Tab"} seats={null} tab={tab} now={now} money={money} onOpen={() => undefined} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </ScrollArea>
      <OpenTabDialog target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
```

- [ ] **Step 5: Check it in the browser**

Run: `npx tsc --noEmit && npx eslint hooks lib/tables lib/tabs components/tables "app/(app)/tables"`
Expected: clean.

Start the app (`npm run dev`), sign in as `manager@demo.test`, pick Main Street, and check:
- **Floor:** `/tables` shows Inside (T1–T4) and Patio (P1–P2), two tiles per row at 375px with no sideways scroll.
- **Opening:** tapping T1, entering 3 guests, and Open tab lands on `/tabs/{id}` (a 404 until Task 4 is expected).
- **Live:** with `/tables` open in a second window, opening a tab in the first turns the tile within a second or two. If it only changes after 30 seconds, Realtime isn't authorised; check the browser console for the channel status and that the migration added `tabs` to `supabase_realtime`.
- **Setup:** `/tables/setup` adds an area and a table, renames, reorders and archives; archiving T1 while it has an open tab shows "T1 has an open tab."

- [ ] **Step 6: Commit**

```bash
git add hooks lib/tables lib/tabs/actions.ts components/tables "app/(app)/tables"
git commit -m "feat(tables): floor, table setup, opening tabs, live refresh"
```

### Task 4: The tab — adding, sending, notes, voids, moving, and the bill

**Files:**
- Modify: `lib/tabs/lines.ts`, `lib/tabs/lines.test.ts`, `lib/tabs/actions.ts`, `components/register/modifier-dialog.tsx`
- Create: `lib/tabs/queries.ts`
- Create: `app/(app)/tabs/[id]/page.tsx`, `app/bills/[tabId]/page.tsx`
- Create: `components/tabs/tab-screen.tsx`, `components/tabs/tab-lines.tsx`, `components/tabs/text-dialog.tsx`, `components/tabs/move-dialog.tsx`, `components/tabs/tab-details-dialog.tsx`

**Interfaces:**
- Consumes: the tab functions from Task 1; `TabLine`, `tabTotal`, `tabLabel`, `toTabLine`, `TAB_LINE_SELECT`, `noteSchema`, `reasonSchema`, `tabDbError`, `cartLineFor` from Task 2; `useLiveRefresh`, `loadAreas`, `loadOpenTabs` from Task 3; `ProductGrid`, `VariantDialog`, `ModifierDialog` from the register.
- Produces:
  - `lib/tabs/lines.ts`: `lineChoices(line, products): string`, `lineUnitPrice(line, products): number | null`, `unsentCount(lines): number`
  - `lib/tabs/queries.ts`: `type TabView`, `loadTab(supabase, tabId): Promise<TabView | null>`
  - `lib/tabs/actions.ts`: `type TabActionResult = { ok: true } | { ok: false; error: string }`, and `addTabItems`, `changeTabItem`, `noteTabItem`, `voidTabItem`, `sendTab`, `printBill`, `moveTab`, `updateTab`, `cancelTab`
  - `ModifierDialog` gains an optional `addLabel` prop (default `"Add to sale"`)
  - `/tabs/[id]` and `/bills/[tabId]`

- [ ] **Step 1: Write the failing tests**

Add to `lib/tabs/lines.test.ts` (and add `lineChoices, lineUnitPrice, unsentCount` to its import):

```ts
describe("showing a tab line", () => {
  it("names its choices and prices it from the catalog", () => {
    const latteLine = line({ id: "a", variantId: "v-latte", optionIds: ["o-oat"], name: "Latte", quantity: 2 });
    expect(lineChoices(latteLine, [latte, beer])).toBe("Oat");
    expect(lineUnitPrice(latteLine, [latte, beer])).toBe(470);
    expect(lineUnitPrice(line({ variantId: null }), [latte, beer])).toBeNull();
  });
  it("counts unsent lines", () => {
    expect(unsentCount([line({ sentAt: null, quantity: 2 }), line({ sentAt: null, quantity: 1 }), line({})])).toBe(3);
  });
});
```

Run: `npx vitest run lib/tabs/lines.test.ts`
Expected: FAIL — `lineChoices` is not exported.

- [ ] **Step 2: Implement the helpers**

Add to `lib/tabs/lines.ts` (import `selectionFromIds, selectionLabel` from `@/lib/modifiers`):

```ts
function find(line: TabLine, products: RegisterProduct[]) {
  const product = products.find((entry) => entry.variants.some((variant) => variant.id === line.variantId));
  const variant = product?.variants.find((entry) => entry.id === line.variantId);
  return product && variant ? { product, variant } : null;
}

export function lineChoices(line: TabLine, products: RegisterProduct[]): string {
  const found = find(line, products);
  return found ? selectionLabel(found.product.modifierGroups, selectionFromIds(found.product.modifierGroups, line.optionIds)) : "";
}

export function lineUnitPrice(line: TabLine, products: RegisterProduct[]): number | null {
  const found = find(line, products);
  return found ? cartLineFor(found.product, found.variant, line.optionIds, 1, line.id).price : null;
}

export function unsentCount(lines: TabLine[]): number {
  return lines.filter((line) => line.sentAt === null).reduce((sum, line) => sum + line.quantity, 0);
}
```

Run: `npx vitest run lib/tabs/lines.test.ts`
Expected: PASS.

- [ ] **Step 3: Query and actions**

`lib/tabs/queries.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { tabLabel, toTabLine, TAB_LINE_SELECT, type TabLine, type TabLineRow } from "./lines";

export type TabView = {
  id: string;
  storeId: string;
  status: "open" | "paid" | "cancelled";
  tableId: string | null;
  name: string | null;
  guests: number | null;
  label: string;
  openedAt: string;
  billPrintedAt: string | null;
  lines: TabLine[];
  sales: { id: string; receiptNumber: number; total: number; tip: number; status: string }[];
};

type TabRow = {
  id: string;
  store_id: string;
  status: TabView["status"];
  table_id: string | null;
  name: string | null;
  guests: number | null;
  opened_at: string;
  bill_printed_at: string | null;
  table: { name: string } | null;
  tab_items: TabLineRow[];
  orders: { id: string; receipt_number: number; total: number; tip: number; status: string }[];
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadTab(supabase: SupabaseClient<Database>, tabId: string): Promise<TabView | null> {
  if (!GUID.test(tabId)) return null;
  const { data } = await supabase
    .from("tabs")
    .select(`id, store_id, status, table_id, name, guests, opened_at, bill_printed_at, table:dining_tables(name), tab_items(${TAB_LINE_SELECT}), orders(id, receipt_number, total, tip, status)`)
    .eq("id", tabId)
    .order("added_at", { referencedTable: "tab_items" })
    .order("receipt_number", { referencedTable: "orders" })
    .maybeSingle();
  const row = data as unknown as TabRow | null;
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    status: row.status,
    tableId: row.table_id,
    name: row.name,
    guests: row.guests,
    label: tabLabel(row.table?.name ?? null, row.name),
    openedAt: row.opened_at,
    billPrintedAt: row.bill_printed_at,
    lines: row.tab_items.map(toTabLine),
    sales: row.orders.map((order) => ({ id: order.id, receiptNumber: order.receipt_number, total: order.total, tip: order.tip, status: order.status })),
  };
}
```

Add to `lib/tabs/actions.ts` (and add `z` from `zod`, `noteSchema`, `reasonSchema` to its imports):

```ts
export type TabActionResult = { ok: true } | { ok: false; error: string };

const id = z.guid();

async function call(tabId: string, run: (supabase: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { code?: string; message?: string } | null }>): Promise<TabActionResult> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await run(supabase);
  if (error) return { ok: false, error: tabDbError(error) };
  revalidatePath(`/tabs/${tabId}`);
  revalidatePath("/tables");
  return { ok: true };
}

export async function addTabItems(tabId: string, items: { variantId: string; optionIds: string[]; quantity: number }[]): Promise<TabActionResult> {
  const parsed = z
    .object({ tabId: id, items: z.array(z.object({ variantId: id, optionIds: z.array(id).max(50), quantity: z.number().int().min(1).max(999) })).min(1).max(50) })
    .safeParse({ tabId, items });
  if (!parsed.success) return { ok: false, error: "Something in that item isn't valid. Try again." };
  return call(tabId, (supabase) =>
    supabase.rpc("add_tab_items", {
      p_tab_id: tabId,
      p_items: parsed.data.items.map((item) => ({ variant_id: item.variantId, option_ids: item.optionIds, quantity: item.quantity })),
    }),
  );
}

export async function changeTabItem(tabId: string, itemId: string, quantity: number): Promise<TabActionResult> {
  if (!id.safeParse(itemId).success || !Number.isInteger(quantity) || quantity < 0 || quantity > 999) return { ok: false, error: "Enter a quantity between 0 and 999." };
  return call(tabId, (supabase) => supabase.rpc("change_tab_item", { p_item_id: itemId, p_quantity: quantity }));
}

export async function noteTabItem(tabId: string, itemId: string, note: string): Promise<TabActionResult> {
  const parsed = noteSchema.safeParse({ note });
  if (!parsed.success || !id.safeParse(itemId).success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "Pick a line first." };
  return call(tabId, (supabase) => supabase.rpc("note_tab_item", { p_item_id: itemId, p_note: parsed.data.note || undefined }));
}

export async function voidTabItem(tabId: string, itemId: string, reason: string): Promise<TabActionResult> {
  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success || !id.safeParse(itemId).success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "Pick a line first." };
  return call(tabId, (supabase) => supabase.rpc("void_tab_item", { p_item_id: itemId, p_reason: parsed.data.reason }));
}

export async function sendTab(tabId: string): Promise<TabActionResult> {
  if (!id.safeParse(tabId).success) return { ok: false, error: "This tab no longer exists." };
  return call(tabId, (supabase) => supabase.rpc("send_tab", { p_tab_id: tabId }));
}

export async function printBill(tabId: string): Promise<TabActionResult> {
  if (!id.safeParse(tabId).success) return { ok: false, error: "This tab no longer exists." };
  return call(tabId, (supabase) => supabase.rpc("print_bill", { p_tab_id: tabId }));
}

export async function moveTab(tabId: string, tableId: string): Promise<TabActionResult> {
  if (!id.safeParse(tabId).success || !id.safeParse(tableId).success) return { ok: false, error: "Pick a table." };
  return call(tabId, (supabase) => supabase.rpc("move_tab", { p_tab_id: tabId, p_table_id: tableId }));
}

export async function updateTab(tabId: string, name: string, guests: string): Promise<TabActionResult> {
  const parsed = z
    .object({
      name: z.string().trim().max(40, "Keep the name under 40 characters"),
      guests: z.preprocess((value) => (value === "" ? null : Number(value)), z.number().int().min(1, "Guests must be between 1 and 99").max(99, "Guests must be between 1 and 99").nullable()),
    })
    .safeParse({ name, guests });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  return call(tabId, (supabase) => supabase.rpc("update_tab", { p_tab_id: tabId, p_name: parsed.data.name || undefined, p_guests: parsed.data.guests ?? undefined }));
}

export async function cancelTab(tabId: string): Promise<TabActionResult> {
  if (!id.safeParse(tabId).success) return { ok: false, error: "This tab no longer exists." };
  return call(tabId, (supabase) => supabase.rpc("cancel_tab", { p_tab_id: tabId }));
}
```

- [ ] **Step 4: Let the modifier dialog say "Add to tab"**

In `components/register/modifier-dialog.tsx`:
- add `addLabel?: string` to `ModifierDialogProps`;
- pass it through `ModifierDialog` → `ModifierForm` (`addLabel = "Add to sale"` default in `ModifierDialog`'s destructuring);
- in `ModifierForm`, replace `{target.editKey ? "Save choices" : "Add to sale"}` with `{target.editKey ? "Save choices" : addLabel}`.

- [ ] **Step 5: Dialogs**

`components/tabs/text-dialog.tsx` (used for the void reason and the kitchen note):

```tsx
"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";

export type TextRequest = { title: string; description: string; label: string; submit: string; initial: string; maxLength: number; onSubmit: (value: string) => Promise<string | null> };

function TextForm({ request, onDone }: { request: TextRequest; onDone: () => void }) {
  const [value, setValue] = useState(request.initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await request.onSubmit(value);
    setPending(false);
    if (result) setError(result);
    else onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
        <DialogDescription>{request.description}</DialogDescription>
      </DialogHeader>
      <Field label={request.label} htmlFor="tab-text">
        <Input id="tab-text" className="min-h-11" maxLength={request.maxLength} value={value} autoFocus onChange={(event) => setValue(event.target.value)} />
      </Field>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>{request.submit}</Button>
      </DialogFooter>
    </form>
  );
}

export default function TextDialog({ request, onClose }: { request: TextRequest | null; onClose: () => void }) {
  const open = request !== null;
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>{request && <TextForm key={openCount} request={request} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}
```

`components/tabs/move-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/_ui/dialog";

export type FreeTable = { id: string; name: string; areaName: string };

type MoveDialogProps = { open: boolean; tables: FreeTable[]; onOpenChange: (open: boolean) => void; onMove: (tableId: string) => Promise<string | null> };

export default function MoveDialog({ open, tables, onOpenChange, onMove }: MoveDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function move(tableId: string) {
    setPending(true);
    const result = await onMove(tableId);
    setPending(false);
    setError(result);
    if (!result) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setError(null); onOpenChange(next); }}>
      <DialogContent>
        <div className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Move to another table</DialogTitle>
            <DialogDescription>Only free tables are listed.</DialogDescription>
          </DialogHeader>
          {tables.length === 0 ? (
            <p className="text-subtle">Every table has an open tab.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {tables.map((table) => (
                <li key={table.id}>
                  <Button variant="secondary" size="md" className="min-h-11 w-full flex-col gap-0" disabled={pending} onClick={() => move(table.id)}>
                    <span>{table.name}</span>
                    <span className="caption-style text-soft">{table.areaName}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {error && <span role="alert" className="caption-style text-danger">{error}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

`components/tabs/tab-details-dialog.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";

type Details = { name: string; guests: string };

function DetailsForm({ initial, onSave, onDone }: { initial: Details; onSave: (details: Details) => Promise<string | null>; onDone: () => void }) {
  const [name, setName] = useState(initial.name);
  const [guests, setGuests] = useState(initial.guests);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await onSave({ name, guests });
    setPending(false);
    if (result) setError(result);
    else onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Guests and name</DialogTitle>
        <DialogDescription>The name shows on the floor, the bill and the kitchen tickets.</DialogDescription>
      </DialogHeader>
      <Field label="Guests" htmlFor="details-guests">
        <Input id="details-guests" className="min-h-11" inputMode="numeric" value={guests} onChange={(event) => setGuests(event.target.value)} />
      </Field>
      <Field label="Name" htmlFor="details-name" hint="Optional for a table">
        <Input id="details-name" className="min-h-11" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>Save</Button>
      </DialogFooter>
    </form>
  );
}

export default function TabDetailsDialog({ open, initial, onOpenChange, onSave }: { open: boolean; initial: Details; onOpenChange: (open: boolean) => void; onSave: (details: Details) => Promise<string | null> }) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <DetailsForm key={openCount} initial={initial} onSave={onSave} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Tab lines and the tab screen**

`components/tabs/tab-lines.tsx`:

```tsx
"use client";

import Button from "@/components/_ui/button";
import { lineChoices, lineUnitPrice, type TabLine } from "@/lib/tabs/lines";
import type { RegisterProduct } from "@/lib/register/cart";
import { cn } from "@/lib/utils";

type TabLinesProps = {
  lines: TabLine[];
  products: RegisterProduct[];
  editable: boolean;
  pending: boolean;
  money: (minor: number) => string;
  time: (iso: string) => string;
  onQuantity: (line: TabLine, quantity: number) => void;
  onNote: (line: TabLine) => void;
  onVoid: (line: TabLine) => void;
};

function Line({ line, props }: { line: TabLine; props: TabLinesProps }) {
  const unit = lineUnitPrice(line, props.products);
  const choices = lineChoices(line, props.products);
  const sent = line.sentAt !== null;
  const voided = line.voidedAt !== null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex min-w-0 flex-col gap-1", voided && "text-subtle line-through")}>
          <span className="truncate">
            {line.quantity} × {line.name}
          </span>
          {choices && <span className="caption-style text-soft">{choices}</span>}
          {line.note && <span className="caption-style text-soft italic">{line.note}</span>}
        </div>
        <span className="tabular-nums">{unit === null ? "—" : props.money(unit * line.quantity)}</span>
      </div>
      {voided ? (
        <span className="caption-style text-danger">Voided · {line.voidReason}</span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {sent && <span className="caption-style text-soft">Sent {props.time(line.sentAt!)}</span>}
          {line.paidQuantity > 0 && <span className="caption-style text-soft">{line.paidQuantity} of {line.quantity} paid</span>}
          {props.editable && !sent && (
            <>
              <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`One less ${line.name}`} disabled={props.pending} onClick={() => props.onQuantity(line, line.quantity - 1)}>−</Button>
              <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`One more ${line.name}`} disabled={props.pending} onClick={() => props.onQuantity(line, line.quantity + 1)}>+</Button>
              <Button variant="ghost" size="md" className="ml-auto min-h-11" aria-label={`Note for ${line.name}`} onClick={() => props.onNote(line)}>Note</Button>
              <Button variant="ghost" size="md" className="min-h-11" aria-label={`Remove ${line.name}`} disabled={props.pending} onClick={() => props.onQuantity(line, 0)}>Remove</Button>
            </>
          )}
          {props.editable && sent && line.paidQuantity === 0 && (
            <Button variant="ghost" size="md" className="ml-auto min-h-11" aria-label={`Void ${line.name}`} onClick={() => props.onVoid(line)}>Void…</Button>
          )}
        </div>
      )}
    </li>
  );
}

export default function TabLines(props: TabLinesProps) {
  const unsent = props.lines.filter((line) => line.sentAt === null);
  const sent = props.lines.filter((line) => line.sentAt !== null);
  if (props.lines.length === 0) return <span className="caption-style text-subtle block p-4">Tap a product to add it to the tab.</span>;
  return (
    <div className="flex flex-col">
      {unsent.length > 0 && (
        <section aria-labelledby="unsent-heading">
          <h3 id="unsent-heading" className="caption-style text-soft px-4 pt-3 uppercase">Not sent yet</h3>
          <ul className="divide-line-strong divide-y">{unsent.map((line) => <Line key={line.id} line={line} props={props} />)}</ul>
        </section>
      )}
      {sent.length > 0 && (
        <section aria-labelledby="sent-heading">
          <h3 id="sent-heading" className="caption-style text-soft px-4 pt-3 uppercase">Sent</h3>
          <ul className="divide-line-strong divide-y">{sent.map((line) => <Line key={line.id} line={line} props={props} />)}</ul>
        </section>
      )}
    </div>
  );
}
```

`components/tabs/tab-screen.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button, { buttonVariants } from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/_ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/_ui/dropdown-menu";
import PageHeader from "@/components/_common/page-header";
import ProductGrid from "@/components/register/product-grid";
import VariantDialog from "@/components/register/variant-dialog";
import ModifierDialog, { type ModifierTarget } from "@/components/register/modifier-dialog";
import TabLines from "./tab-lines";
import TextDialog, { type TextRequest } from "./text-dialog";
import MoveDialog, { type FreeTable } from "./move-dialog";
import TabDetailsDialog from "./tab-details-dialog";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { formatMoney } from "@/lib/money";
import { selectionIds, type Selection } from "@/lib/modifiers";
import { searchProducts, type RegisterProduct, type RegisterVariant } from "@/lib/register/cart";
import { tabTotal, unsentCount, type TabLine } from "@/lib/tabs/lines";
import type { TabView } from "@/lib/tabs/queries";
import { addTabItems, cancelTab, changeTabItem, moveTab, noteTabItem, printBill, sendTab, updateTab, voidTabItem, type TabActionResult } from "@/lib/tabs/actions";
import { cn } from "@/lib/utils";

type TabScreenProps = {
  tab: TabView;
  currency: string;
  timeZone: string;
  pricesIncludeTax: boolean;
  products: RegisterProduct[];
  categories: { id: string; name: string }[];
  freeTables: FreeTable[];
};

export default function TabScreen({ tab, currency, timeZone, pricesIncludeTax, products, categories, freeTables }: TabScreenProps) {
  useLiveRefresh("tabs", tab.storeId);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const time = (iso: string) => new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone }).format(new Date(iso));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [variantProduct, setVariantProduct] = useState<RegisterProduct | null>(null);
  const [modifierTarget, setModifierTarget] = useState<ModifierTarget | null>(null);
  const [textRequest, setTextRequest] = useState<TextRequest | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const editable = tab.status === "open";
  const categoryIndex = useMemo(() => new Map(categories.map((entry, index) => [entry.id, index])), [categories]);
  const visible = useMemo(() => searchProducts(products, query, category), [products, query, category]);
  const total = tabTotal(tab.lines, products, pricesIncludeTax);
  const waiting = unsentCount(tab.lines);
  const itemCount = tab.lines.reduce((sum, line) => sum + (line.voidedAt ? 0 : line.quantity - line.paidQuantity), 0);
  const cancellable = !tab.lines.some((line) => (line.sentAt !== null && line.voidedAt === null) || line.paidQuantity > 0);

  function run(action: () => Promise<TabActionResult>, after?: () => void) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice(result.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  async function settle(action: () => Promise<TabActionResult>): Promise<string | null> {
    const result = await action();
    if (!result.ok) return result.error;
    router.refresh();
    return null;
  }

  function add(product: RegisterProduct, variant: RegisterVariant, selection: Selection = {}) {
    run(() => addTabItems(tab.id, [{ variantId: variant.id, optionIds: selectionIds(product.modifierGroups, selection), quantity: 1 }]));
  }

  function choose(product: RegisterProduct, variant: RegisterVariant) {
    if (product.modifierGroups.length > 0) setModifierTarget({ product, variant, selection: {}, editKey: null });
    else add(product, variant);
  }

  function pick(product: RegisterProduct) {
    if (product.variants.length === 1) choose(product, product.variants[0]);
    else setVariantProduct(product);
  }

  function askNote(line: TabLine) {
    setTextRequest({
      title: `Note for ${line.name}`,
      description: "The kitchen sees this under the item.",
      label: "Note",
      submit: "Save note",
      initial: line.note ?? "",
      maxLength: 100,
      onSubmit: (value) => settle(() => noteTabItem(tab.id, line.id, value)),
    });
  }

  function askVoid(line: TabLine) {
    setTextRequest({
      title: `Void ${line.name}`,
      description: "It's struck off the kitchen ticket and taken off the bill.",
      label: "Reason",
      submit: "Void item",
      initial: "",
      maxLength: 200,
      onSubmit: (value) => settle(() => voidTabItem(tab.id, line.id, value)),
    });
  }

  const linesPanel = (
    <TabLines
      lines={tab.lines}
      products={products}
      editable={editable}
      pending={pending}
      money={money}
      time={time}
      onQuantity={(line, quantity) => run(() => changeTabItem(tab.id, line.id, quantity))}
      onNote={askNote}
      onVoid={askVoid}
    />
  );

  const footer = editable ? (
    <div className="border-line-strong flex flex-col gap-3 border-t p-4">
      <div className="flex items-baseline justify-between tabular-nums">
        <span className="text-soft">To pay</span>
        <span className="text-[20px] leading-none font-semibold">{money(total)}</span>
      </div>
      {notice && <span role="alert" className="caption-style text-danger">{notice}</span>}
      <Button variant="primary" size="md" className="min-h-11" disabled={pending || waiting === 0} onClick={() => run(() => sendTab(tab.id))}>
        {waiting > 0 ? `Send ${waiting} to the kitchen` : "Everything's sent"}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`/bills/${tab.id}?print=1`}
          target="_blank"
          rel="noreferrer"
          aria-disabled={itemCount === 0}
          className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11", itemCount === 0 && "pointer-events-none opacity-50")}
          onClick={() => run(() => printBill(tab.id))}
        >
          Print bill
        </a>
        <Button href={`/register?tab=${tab.id}`} variant="secondary" size="md" className={cn("min-h-11", itemCount === 0 && "pointer-events-none opacity-50")}>
          Pay
        </Button>
      </div>
    </div>
  ) : (
    <div className="border-line-strong flex flex-col gap-2 border-t p-4">
      <span className="lead-style">{tab.status === "paid" ? "This tab is paid." : "This tab was cancelled."}</span>
      {tab.sales.map((sale) => (
        <a key={sale.id} href={`/orders/${sale.id}`} className="caption-style text-soft underline">
          Receipt #{sale.receiptNumber} · {money(sale.total + sale.tip)}
        </a>
      ))}
    </div>
  );

  return (
    <section id="tab" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={tab.label}
        actions={
          <>
            <Button href="/tables" variant="ghost" size="md">Tables</Button>
            {editable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="md" aria-label="Tab options">More</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setMoveOpen(true)}>Move table</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>Guests and name</DropdownMenuItem>
                  {cancellable && <DropdownMenuItem onSelect={() => run(() => cancelTab(tab.id), () => router.push("/tables"))}>Cancel tab</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {editable && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-line-strong flex flex-col gap-2 border-b p-3">
              <Input aria-label="Search products" placeholder="Search products" className="min-h-11" value={query} onChange={(event) => setQuery(event.target.value)} />
              <div role="tablist" aria-label="Categories" className="flex gap-1 overflow-x-auto">
                {[{ id: "", name: "All" }, ...categories].map((entry) => (
                  <Button key={entry.id || "all"} role="tab" aria-selected={category === entry.id} variant="ghost" size="md" className="aria-selected:text-foreground min-h-11 shrink-0 aria-selected:bg-white/6" onClick={() => setCategory(entry.id)}>
                    {entry.name}
                  </Button>
                ))}
              </div>
              {notice && <span role="alert" className="caption-style text-danger lg:hidden">{notice}</span>}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ProductGrid products={visible} categoryIndex={categoryIndex} money={money} onPick={pick} />
            </ScrollArea>
            <Button variant="primary" size="none" className="m-3 flex min-h-12 items-center justify-between rounded-xl px-4 lg:hidden" onClick={() => setSheetOpen(true)}>
              <span>Tab · {itemCount} items</span>
              <span className="tabular-nums">{money(total)}</span>
            </Button>
          </div>
        )}
        <aside aria-label="Tab" className={cn("border-line-strong min-h-0 flex-col lg:w-[24rem] lg:border-l", editable ? "hidden lg:flex" : "flex flex-1")}>
          <ScrollArea className="min-h-0 flex-1">{linesPanel}</ScrollArea>
          {footer}
        </aside>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="flex flex-col lg:hidden">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>{tab.label}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">{linesPanel}</ScrollArea>
          {footer}
        </SheetContent>
      </Sheet>
      <VariantDialog product={variantProduct} money={money} onPick={(product, variant) => { setVariantProduct(null); choose(product, variant); }} onClose={() => setVariantProduct(null)} />
      <ModifierDialog
        target={modifierTarget}
        money={money}
        addLabel="Add to tab"
        onClose={() => setModifierTarget(null)}
        onDone={(target, selection) => {
          add(target.product, target.variant, selection);
          setModifierTarget(null);
        }}
      />
      <TextDialog request={textRequest} onClose={() => setTextRequest(null)} />
      <MoveDialog open={moveOpen} tables={freeTables} onOpenChange={setMoveOpen} onMove={(tableId) => settle(() => moveTab(tab.id, tableId))} />
      <TabDetailsDialog
        open={detailsOpen}
        initial={{ name: tab.name ?? "", guests: tab.guests ? String(tab.guests) : "" }}
        onOpenChange={setDetailsOpen}
        onSave={(details) => settle(() => updateTab(tab.id, details.name, details.guests))}
      />
    </section>
  );
}
```

`app/(app)/tabs/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TabScreen from "@/components/tabs/tab-screen";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/catalog/queries";
import { loadRegisterCatalog } from "@/lib/register/queries";
import { loadAreas, loadOpenTabs } from "@/lib/tables/queries";
import { loadTab } from "@/lib/tabs/queries";

export const metadata: Metadata = { title: "Tab" };

export default async function TabPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  const { id } = await params;
  const supabase = await createClient();
  const tab = await loadTab(supabase, id);
  if (!tab || !store || tab.storeId !== store.id) notFound();

  const [products, categories, areas, { data: storeRow }] = await Promise.all([
    loadRegisterCatalog(supabase, store.id),
    loadCategories(supabase),
    loadAreas(supabase, store.id),
    supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle(),
  ]);
  const open = await loadOpenTabs(supabase, store.id, [], store.pricesIncludeTax);
  const taken = new Set(open.map((entry) => entry.tableId));
  const freeTables = areas
    .filter((area) => area.active)
    .flatMap((area) => area.tables.filter((table) => table.active && !taken.has(table.id)).map((table) => ({ id: table.id, name: table.name, areaName: area.name })));

  return (
    <TabScreen
      tab={tab}
      currency={store.currency}
      timeZone={storeRow?.timezone ?? "UTC"}
      pricesIncludeTax={store.pricesIncludeTax}
      products={products}
      categories={categories.map((entry) => ({ id: entry.id, name: entry.name }))}
      freeTables={freeTables}
    />
  );
}
```

`app/bills/[tabId]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/register/print-on-load";
import PrintButton from "@/components/register/print-button";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { priceCart } from "@/lib/checkout";
import { formatMoney } from "@/lib/money";
import { cartInputs } from "@/lib/register/cart";
import { loadRegisterCatalog } from "@/lib/register/queries";
import { pickAll, tabCartLines } from "@/lib/tabs/lines";
import { loadTab } from "@/lib/tabs/queries";

export const metadata: Metadata = { title: "Bill" };

export default async function BillPage({ params, searchParams }: { params: Promise<{ tabId: string }>; searchParams: Promise<{ print?: string }> }) {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  const { tabId } = await params;
  const { print } = await searchParams;
  const supabase = await createClient();
  const tab = await loadTab(supabase, tabId);
  if (!tab || !store || tab.storeId !== store.id) notFound();

  const [products, { data: storeRow }] = await Promise.all([
    loadRegisterCatalog(supabase, store.id),
    supabase.from("stores").select("name, timezone, receipt_footer").eq("id", store.id).maybeSingle(),
  ]);
  const money = (minor: number) => formatMoney(minor, store.currency, "en-US");
  const { lines } = tabCartLines(tab.lines, products, pickAll(tab.lines), {});
  const priced = lines.length > 0 ? priceCart(cartInputs(lines), null, store.pricesIncludeTax) : null;
  const paid = tab.sales.filter((sale) => sale.status !== "voided").reduce((sum, sale) => sum + sale.total, 0);
  const now = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: storeRow?.timezone ?? "UTC" }).format(new Date());

  return (
    <main className="bg-background flex min-h-dvh justify-center p-4 print:bg-white print:p-0 print:text-black">
      {print === "1" && <PrintOnLoad />}
      <article className="flex w-full max-w-[80mm] flex-col gap-3 font-mono text-[13px] leading-snug">
        <header className="flex flex-col items-center gap-1 border-b border-dashed border-current pb-2 text-center">
          <span className="text-[16px] font-bold">{storeRow?.name ?? store.name}</span>
          <span className="text-[20px] font-bold">{tab.label}</span>
          <span>{[tab.guests ? `${tab.guests} guests` : null, now].filter(Boolean).join(" · ")}</span>
        </header>
        <ul className="flex flex-col gap-2">
          {lines.map((line, index) => (
            <li key={line.key} className="flex flex-col">
              <span className="flex justify-between gap-2">
                <span>{line.quantity} × {line.label}</span>
                <span className="tabular-nums">{money(priced!.lines[index].lineTotal)}</span>
              </span>
              {line.modifierLabel && <span className="pl-4">{line.modifierLabel}</span>}
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1 border-t border-dashed border-current pt-2 tabular-nums">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(priced?.subtotal ?? 0)}</dd></div>
          <div className="flex justify-between"><dt>{store.pricesIncludeTax ? "Includes tax" : "Tax"}</dt><dd>{money(priced?.taxTotal ?? 0)}</dd></div>
          <div className="flex justify-between text-[16px] font-bold"><dt>Total</dt><dd>{money(priced?.total ?? 0)}</dd></div>
          {paid > 0 && <div className="flex justify-between"><dt>Already paid</dt><dd>{money(paid)}</dd></div>}
        </dl>
        {storeRow?.receipt_footer && <p className="text-center">{storeRow.receipt_footer}</p>}
        <PrintButton label="Print bill" />
      </article>
    </main>
  );
}
```

- [ ] **Step 7: Check it in the browser**

Run: `npx tsc --noEmit && npx eslint lib/tabs components/tabs "app/(app)/tabs" app/bills components/register/modifier-dialog.tsx && npx vitest run`
Expected: clean; all unit tests pass.

In the running app as `cashier@demo.test` at Main Street, at 375px and at desktop width:
- **Adding:** open T2 for 2; tap Latte → Small → Oat → **Add to tab**; tap Croissant. The bottom bar shows "Tab · 2 items" and the total.
- **Editing:** open the sheet; +, −, Note ("extra hot") and Remove work on unsent lines; adding another Latte with Oat makes a second line because the first has a note.
- **Sending:** **Send 2 to the kitchen** moves both lines under "Sent" with the time; − and + disappear; **Void…** asks for a reason and strikes the line through.
- **Bill:** **Print bill** opens `/bills/{id}?print=1` with the unpaid lines and total; back on `/tables`, T2 shows the Bill badge.
- **Menu:** Move table lists only free tables and moves the tab; Guests and name saves; Cancel tab only appears when nothing is sent (or everything sent was voided).
- **No sideways scroll** at 375px on `/tabs/{id}`.

- [ ] **Step 8: Commit**

```bash
git add lib/tabs components/tabs components/register/modifier-dialog.tsx "app/(app)/tabs" app/bills
git commit -m "feat(tables): the tab screen — add, send, notes, voids, move, and the bill"
```

### Task 5: Paying a tab at the till, and splitting evenly

**Files:**
- Modify: `lib/tabs/lines.ts`, `lib/tabs/lines.test.ts`, `lib/tabs/actions.ts`, `app/(app)/register/page.tsx`, `components/register/register-screen.tsx`, `components/register/cart-panel.tsx`, `components/register/pay-dialog.tsx`, `components/register/sale-done.tsx`
- Create: `components/register/tab-pay-picker.tsx`

**Interfaces:**
- Consumes: `pay_tab` from Task 1; `payTabSchema`, `partsFrom`, `pickAll`, `setPick`, `PayPick`, `leftToPay`, `tabCartLines`, `lineChoices`, `splitEvenly`, `tabDbError` from Tasks 2 and 4; `loadTab`, `TabView` from Task 4.
- Produces:
  - `lib/tabs/lines.ts`: `clampPick(pick: PayPick, lines: TabLine[]): PayPick`
  - `payTab(input: PayTabInput): Promise<{ ok: true; orderId: string; receiptNumber: number; total: number; change: number; tabPaid: boolean } | { ok: false; error: string; kind?: RegisterErrorKind | null }>`
  - `RegisterScreen` gains `tab: TabView | null`
  - `CartPanel` gains `showOrderName?: boolean` (default true)
  - `SaleDone` gains `tab?: { paid: boolean } | null`
  - `PayDialog` gains a **Split evenly** control

- [ ] **Step 1: Keep a pick within what's left**

A payment refreshes the tab, and "Pay the rest" can be tapped before the refresh lands, so every read of the pick is clamped to the current lines. Add to `lib/tabs/lines.test.ts` (and `clampPick` to its import):

```ts
describe("clampPick", () => {
  it("drops what was paid since the pick was made", () => {
    const lines = [line({ id: "a", quantity: 3, paidQuantity: 2 }), line({ id: "b", voidedAt: "x", voidReason: "spilled" })];
    expect(clampPick({ a: 3, b: 1, gone: 2 }, lines)).toEqual({ a: 1 });
  });
});
```

Run: `npx vitest run lib/tabs/lines.test.ts` — Expected: FAIL, `clampPick` is not exported. Then add to `lib/tabs/lines.ts`:

```ts
export function clampPick(pick: PayPick, lines: TabLine[]): PayPick {
  const next: PayPick = {};
  for (const line of lines) {
    const quantity = Math.min(pick[line.id] ?? 0, leftToPay(line));
    if (quantity > 0) next[line.id] = quantity;
  }
  return next;
}
```

Run it again — Expected: PASS.

- [ ] **Step 2: The action**

Add to `lib/tabs/actions.ts` (import `payTabSchema, type PayTabInput` from `./schemas` and `registerErrorKind, type RegisterErrorKind` from `@/lib/register/errors`):

```ts
export async function payTab(
  input: PayTabInput,
): Promise<{ ok: true; orderId: string; receiptNumber: number; total: number; change: number; tabPaid: boolean } | { ok: false; error: string; kind?: RegisterErrorKind | null }> {
  await requireStaff();
  const parsed = payTabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something in the payment isn't valid. Check it and try again." };
  const sale = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_tab", {
    p_tab_id: sale.tabId,
    p_session_id: sale.sessionId,
    p_parts: sale.parts.map((part) => ({
      tab_item_id: part.tabItemId,
      quantity: part.quantity,
      discount_bps: part.discountBps ?? null,
      discount_amount: part.discountAmount ?? null,
    })),
    p_order_discount: sale.orderDiscount ? { bps: sale.orderDiscount.bps ?? null, amount: sale.orderDiscount.amount ?? null } : undefined,
    p_approval_id: sale.approvalId ?? undefined,
    p_customer_id: sale.customerId ?? undefined,
    p_payments: sale.payments.map((payment) => ({ method: payment.method, amount: payment.amount, tendered: payment.tendered ?? null, reference: payment.reference ?? null })),
    p_tip: sale.tip ?? 0,
  });
  if (error || !data) return { ok: false, error: tabDbError(error), kind: registerErrorKind(error) };
  const result = data as { order_id: string; receipt_number: number; total: number; change: number; tab_paid: boolean };
  revalidatePath("/register");
  revalidatePath("/tables");
  revalidatePath(`/tabs/${sale.tabId}`);
  return { ok: true, orderId: result.order_id, receiptNumber: result.receipt_number, total: result.total, change: result.change, tabPaid: result.tab_paid };
}
```

- [ ] **Step 3: Load the tab on the register page**

In `app/(app)/register/page.tsx`:
- import `loadTab` from `@/lib/tabs/queries`;
- change the signature to `export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ tab?: string }> })`;
- after loading `products`, add:

```ts
  const { tab: tabId } = await searchParams;
  const loadedTab = tabId ? await loadTab(supabase, tabId) : null;
  const tab = loadedTab && loadedTab.storeId === store.id && loadedTab.status === "open" ? loadedTab : null;
```

- pass `tab={tab}` to `<RegisterScreen />`.

The Open till step needs no change: its form posts back to the same URL, so `?tab=` survives.

- [ ] **Step 4: The tab picker**

`components/register/tab-pay-picker.tsx`:

```tsx
"use client";

import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import type { RegisterProduct } from "@/lib/register/cart";
import { leftToPay, lineChoices, type PayPick, type TabLine } from "@/lib/tabs/lines";

type TabPayPickerProps = {
  label: string;
  lines: TabLine[];
  products: RegisterProduct[];
  pick: PayPick;
  missing: string[];
  onPick: (line: TabLine, quantity: number) => void;
  onAll: () => void;
  onNone: () => void;
};

export default function TabPayPicker({ label, lines, products, pick, missing, onPick, onAll, onNone }: TabPayPickerProps) {
  const open = lines.filter((line) => leftToPay(line) > 0);
  return (
    <div className="flex flex-col">
      <div className="border-line-strong flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <h2>Paying {label}</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" className="min-h-11" onClick={onAll}>Select all</Button>
          <Button variant="ghost" size="md" className="min-h-11" onClick={onNone}>Select none</Button>
        </div>
      </div>
      {missing.length > 0 && (
        <span role="status" className="caption-style text-warning px-3 pt-3">
          {missing.join(", ")} {missing.length === 1 ? "isn't" : "aren't"} for sale any more. Void {missing.length === 1 ? "it" : "them"} on the tab to finish paying.
        </span>
      )}
      {open.length === 0 ? (
        <span className="caption-style text-subtle block p-4">Nothing left to pay on this tab.</span>
      ) : (
        <ul className="divide-line-strong divide-y">
          {open.map((line) => {
            const left = leftToPay(line);
            const picked = pick[line.id] ?? 0;
            const choices = lineChoices(line, products);
            return (
              <li key={line.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Checkbox aria-label={`Pay ${line.name}`} checked={picked > 0} onCheckedChange={(checked) => onPick(line, checked === true ? left : 0)} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{line.name}</span>
                  {choices && <span className="caption-style text-soft">{choices}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`Pay one less ${line.name}`} disabled={picked === 0} onClick={() => onPick(line, picked - 1)}>−</Button>
                  <span className="min-w-14 text-center tabular-nums" aria-label={`Paying ${picked} of ${left} ${line.name}`}>{picked} of {left}</span>
                  <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`Pay one more ${line.name}`} disabled={picked >= left} onClick={() => onPick(line, picked + 1)}>+</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Tab mode in the register screen**

In `components/register/register-screen.tsx`:

1. Imports: add `TabPayPicker` from `./tab-pay-picker`; `payTab` from `@/lib/tabs/actions`; `clampPick, partsFrom, pickAll, setPick, tabCartLines, type PayPick` from `@/lib/tabs/lines`; `type TabView` from `@/lib/tabs/queries`; `Link` from `next/link`.
2. Props: add `tab: TabView | null;` to `RegisterScreenProps`.
3. `Done` type: add `tabPaid: boolean | null`.
4. State, after `const [lines, setLines] = …`:

```ts
  const [pick, setPickState] = useState<PayPick>(() => (props.tab ? pickAll(props.tab.lines) : {}));
  const [tabDiscounts, setTabDiscounts] = useState<Record<string, Discount>>({});
  const livePick = useMemo(() => (props.tab ? clampPick(pick, props.tab.lines) : {}), [props.tab, pick]);
  const tabCart = useMemo(() => (props.tab ? tabCartLines(props.tab.lines, props.products, livePick, tabDiscounts) : null), [props.tab, props.products, livePick, tabDiscounts]);
  const saleLines = tabCart ? tabCart.lines : lines;
```

5. Replace every read of `lines` below these lines with `saleLines` (the `pricing` memo, `canPay`, the `kitchen` flag in `complete`, and the `lines=` prop on `CartPanel`). Keep `setLines` calls as they are; they only run outside tab mode.
6. Add helpers after `reset`:

```ts
  function changeQuantity(key: string, quantity: number) {
    if (!props.tab) {
      setLines((current) => setQuantity(current, key, quantity));
      return;
    }
    const line = props.tab.lines.find((entry) => entry.id === key);
    if (line) setPickState((current) => setPick(clampPick(current, props.tab!.lines), line, quantity));
  }

  function changeLineDiscount(key: string, discount: Discount) {
    if (props.tab) setTabDiscounts((current) => ({ ...current, [key]: discount }));
    else setLines((current) => setLineDiscount(current, key, discount));
  }
```

   and extend `reset()` with `setPickState({}); setTabDiscounts({});`.
7. In `complete`, call `payTab` in tab mode:

```ts
    const common = {
      orderDiscount: discountInput(orderDiscount),
      approvalId: approved && approval ? approval.id : null,
      customerId: customer?.id ?? null,
      payments,
      tip,
    };
    const result = props.tab
      ? await payTab({ tabId: props.tab.id, sessionId: props.sessionId, parts: partsFrom(livePick, tabDiscounts), ...common })
      : await completeSale({
          sessionId: props.sessionId,
          lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, discountBps: line.discountBps, discountAmount: line.discountAmount, optionIds: line.optionIds })),
          ...common,
          orderName: orderName.trim() || undefined,
        });
```

   and set `tabPaid: "tabPaid" in result ? result.tabPaid : null` in `setDone`, with `kitchen: !props.tab && saleLines.some((line) => line.kitchen)` (tab kitchen lines were already sent). After `reset()`, add `if (props.tab) router.refresh();`.
8. Header: title `` props.tab ? `Register · ${props.registerName} · ${props.tab.label}` : `Register · ${props.registerName}` ``, and in tab mode put `<Button href={`/tabs/${props.tab.id}`} variant="ghost" size="md" className="min-h-11">Back to tab</Button>` first in `actions`.
9. Left panel: wrap the existing search + categories + product grid in `props.tab ? (…picker…) : (…existing…)`, where the picker is:

```tsx
            <ScrollArea className="min-h-0 flex-1">
              <TabPayPicker
                label={props.tab.label}
                lines={props.tab.lines}
                products={props.products}
                pick={livePick}
                missing={tabCart?.missing ?? []}
                onPick={(line, quantity) => setPickState((current) => setPick(clampPick(current, props.tab!.lines), line, quantity))}
                onAll={() => setPickState(pickAll(props.tab!.lines))}
                onNone={() => setPickState({})}
              />
            </ScrollArea>
```

10. `CartPanel`: pass `lines={saleLines}`, `onQuantity={changeQuantity}`, `showOrderName={!props.tab}`, and `canEdit={(line) => !props.tab && props.products.some(…existing…)}`. In `DiscountDialog`'s `onApply`, replace `setLines((current) => setLineDiscount(current, discountTarget.line.key, discount))` with `changeLineDiscount(discountTarget.line.key, discount)`.
11. `SaleDone`: pass `tab={props.tab ? { paid: done.tabPaid === true } : null}` and change `onNewSale` to `() => { setDone(null); if (props.tab) setPickState(pickAll(props.tab.lines)); }`.

- [ ] **Step 6: Cart panel, sale done, pay dialog**

`components/register/cart-panel.tsx`:
- add `showOrderName?: boolean;` to the props;
- render the "Name for the order" `Input` only when `props.showOrderName !== false`.

`components/register/sale-done.tsx`:
- add `tab?: { paid: boolean } | null;` to `SaleDoneProps` and destructure it;
- title: `{tab?.paid ? "Tab paid" : "Sale complete"}`;
- replace the **New sale** button with:

```tsx
          {tab?.paid ? (
            <Button href="/tables" variant="primary" size="md" className="min-h-11 flex-1" autoFocus>
              Back to tables
            </Button>
          ) : (
            <Button variant="primary" size="md" className="min-h-11 flex-1" onClick={onNewSale} autoFocus>
              {tab ? "Pay the rest" : "New sale"}
            </Button>
          )}
```

`components/register/pay-dialog.tsx`:
- import `splitEvenly` from `@/lib/checkout`;
- add state `const [people, setPeople] = useState("2");`;
- add this function after `update`:

```ts
  function split(method: PaymentMethod) {
    const count = Number(people);
    if (!Number.isInteger(count) || count < 2 || count > 20) {
      setError("Split between 2 and 20 people");
      return;
    }
    const amounts = splitEvenly(due, count);
    setRows(amounts.map((amount, index) => ({ key: nextKey + index, method, amount: formatAmount(amount, currency), tendered: "", reference: "" })));
    setNextKey((key) => key + count);
    setError(null);
  }
```

- render, right after the Cash / Card / Other grid:

```tsx
      <div role="group" aria-label="Split evenly" className="flex flex-wrap items-center gap-2">
        <span className="caption-style text-soft">Split evenly between</span>
        <Input aria-label="People" inputMode="numeric" className="min-h-11 w-[4em]" value={people} onChange={(event) => setPeople(event.target.value)} />
        <Button variant="secondary" size="md" className="min-h-11" onClick={() => split("cash")}>In cash</Button>
        <Button variant="secondary" size="md" className="min-h-11" onClick={() => split("card")}>By card</Button>
      </div>
```

- in each row's header, next to **Remove**, add a method switch for cash and card rows:

```tsx
              {row.method !== "other" && (
                <Button variant="ghost" size="md" className="min-h-11" onClick={() => update(row.key, { method: row.method === "cash" ? "card" : "cash", tendered: "" })}>
                  {row.method === "cash" ? "Make it card" : "Make it cash"}
                </Button>
              )}
```

- [ ] **Step 7: Check it**

Run: `npx tsc --noEmit && npx eslint components/register lib/tabs "app/(app)/register" && npx vitest run`
Expected: clean; all unit tests pass.

In the running app as `cashier@demo.test` with Counter 1 open:
- open a tab on T3, add 2 Lattes (Oat) and a Croissant, send;
- **Pay** opens `/register?tab=…` with everything selected; untick the Croissant and set Latte to 1 of 2; the cart shows one Latte; pay by card; the screen says **Sale complete** with **Pay the rest**;
- **Pay the rest** selects what's left; in the pay dialog, **Split evenly between 2 · In cash** fills two cash rows that add up to the due; **Make it card** switches one; complete;
- the screen says **Tab paid** with **Back to tables**; T3 is free; the tab page shows both receipts;
- a normal sale from `/register` still works, with the order name field.

- [ ] **Step 8: Commit**

```bash
git add lib/tabs components/register "app/(app)/register"
git commit -m "feat(tables): pay a tab at the till by item, evenly or by any amount"
```

### Task 6: Kitchen screen, end-to-end test, README

**Files:**
- Create: `lib/kitchen/queries.ts`, `lib/kitchen/actions.ts`, `app/(app)/kitchen/page.tsx`, `components/kitchen/kitchen-screen.tsx`, `components/kitchen/ticket-card.tsx`, `e2e/zz-tables.spec.ts`
- Modify: `e2e/roles.spec.ts`, `README.md`

**Interfaces:**
- Consumes: `finish_ticket`, `recall_ticket`, `kitchen_tickets`, `kitchen_ticket_items` from Task 1; `ticketMinutes`, `ticketTone`, `tabDbError` from Task 2; `useLiveRefresh`, `useNow` from Task 3; everything from Tasks 3–5 in the browser test.
- Produces: `/kitchen`; `loadTickets(supabase, storeId): Promise<KitchenTicket[]>`; `finishTicket(id)`, `recallTicket()`.

- [ ] **Step 1: Query and actions**

`lib/kitchen/queries.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type KitchenTicket = {
  id: string;
  number: number;
  label: string;
  sentAt: string;
  items: { id: string; quantity: number; name: string; choices: string | null; note: string | null; voided: boolean }[];
};

type TicketRow = {
  id: string;
  number: number;
  label: string;
  sent_at: string;
  kitchen_ticket_items: { id: string; quantity: number; name: string; choices: string | null; note: string | null; voided: boolean; sort_order: number }[];
};

export async function loadTickets(supabase: SupabaseClient<Database>, storeId: string): Promise<KitchenTicket[]> {
  const { data } = await supabase
    .from("kitchen_tickets")
    .select("id, number, label, sent_at, kitchen_ticket_items(id, quantity, name, choices, note, voided, sort_order)")
    .eq("store_id", storeId)
    .is("done_at", null)
    .order("sent_at")
    .order("sort_order", { referencedTable: "kitchen_ticket_items" })
    .limit(100);
  return ((data ?? []) as unknown as TicketRow[]).map((row) => ({
    id: row.id,
    number: row.number,
    label: row.label,
    sentAt: row.sent_at,
    items: row.kitchen_ticket_items.map((item) => ({ id: item.id, quantity: item.quantity, name: item.name, choices: item.choices, note: item.note, voided: item.voided })),
  }));
}
```

`lib/kitchen/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { tabDbError } from "@/lib/tabs/errors";

type Result = { ok: true } | { ok: false; error: string };

export async function finishTicket(ticketId: string): Promise<Result> {
  await requireStaff();
  if (!z.guid().safeParse(ticketId).success) return { ok: false, error: "That ticket no longer exists." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("finish_ticket", { p_ticket_id: ticketId });
  if (error) return { ok: false, error: tabDbError(error) };
  revalidatePath("/kitchen");
  return { ok: true };
}

export async function recallTicket(): Promise<Result> {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) return { ok: false, error: "Pick a store in the sidebar first." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recall_ticket", { p_store_id: store.id });
  if (error) return { ok: false, error: tabDbError(error) };
  if (!data) return { ok: false, error: "No ticket was finished in the last 12 hours." };
  revalidatePath("/kitchen");
  return { ok: true };
}
```

- [ ] **Step 2: The screen**

`components/kitchen/ticket-card.tsx`:

```tsx
"use client";

import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import Card from "@/components/_common/card";
import { ticketMinutes, ticketTone } from "@/lib/kitchen/tone";
import type { KitchenTicket } from "@/lib/kitchen/queries";
import { cn } from "@/lib/utils";

const TONE = { normal: "text-soft", late: "text-warning", overdue: "text-danger" } as const;

type TicketCardProps = { ticket: KitchenTicket; now: number | null; time: (iso: string) => string; pending: boolean; onDone: () => void };

export default function TicketCard({ ticket, now, time, pending, onDone }: TicketCardProps) {
  const minutes = now === null ? null : ticketMinutes(ticket.sentAt, now);
  const tone = minutes === null ? "normal" : ticketTone(minutes);
  return (
    <Card role="article" aria-label={`Ticket ${ticket.number}, ${ticket.label}`} className={cn("flex flex-col gap-3", tone === "overdue" && "ring-danger ring-2")}>
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-[24px] leading-none font-bold">{ticket.label}</span>
          <span className="caption-style text-soft">#{ticket.number} · {time(ticket.sentAt)}</span>
        </div>
        <span className={cn("text-[20px] leading-none font-semibold tabular-nums", TONE[tone])}>{minutes === null ? "" : `${minutes}m`}</span>
      </header>
      <ul className="flex flex-col gap-2">
        {ticket.items.map((item) => (
          <li key={item.id} className={cn("flex flex-col", item.voided && "text-subtle line-through")}>
            <span className="flex items-center gap-2 text-[18px]">
              {item.quantity} × {item.name}
              {item.voided && <Tag tone="red" size="sm" className="no-underline">VOID</Tag>}
            </span>
            {item.choices && <span className="pl-4 font-bold">{item.choices}</span>}
            {item.note && <span className="pl-4 italic">{item.note}</span>}
          </li>
        ))}
      </ul>
      <Button variant="primary" size="md" className="mt-auto min-h-12" disabled={pending} onClick={onDone}>
        Done
      </Button>
    </Card>
  );
}
```

`components/kitchen/kitchen-screen.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import { ScrollArea } from "@/components/_ui/scroll-area";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import TicketCard from "./ticket-card";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { useNow } from "@/hooks/use-now";
import { finishTicket, recallTicket } from "@/lib/kitchen/actions";
import type { KitchenTicket } from "@/lib/kitchen/queries";

const CHIME = "pos-kitchen-chime";

function readChime(): boolean {
  try {
    return window.localStorage.getItem(CHIME) === "1";
  } catch {
    return false;
  }
}

type KitchenScreenProps = { storeId: string; storeName: string; timeZone: string; tickets: KitchenTicket[] };

export default function KitchenScreen({ storeId, storeName, timeZone, tickets }: KitchenScreenProps) {
  useLiveRefresh("kitchen_tickets", storeId);
  const now = useNow();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [chime, setChime] = useState(readChime);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string>>(new Set(tickets.map((ticket) => ticket.id)));
  const time = (iso: string) => new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone }).format(new Date(iso));

  useEffect(() => {
    const fresh = tickets.some((ticket) => !seen.current.has(ticket.id));
    seen.current = new Set(tickets.map((ticket) => ticket.id));
    if (!fresh || !chime || !audio.current) return;
    const context = audio.current;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
    tone.connect(gain).connect(context.destination);
    tone.start();
    tone.stop(context.currentTime + 0.4);
  }, [tickets, chime]);

  function changeChime(next: boolean) {
    setChime(next);
    if (next && !audio.current) audio.current = new AudioContext();
    try {
      window.localStorage.setItem(CHIME, next ? "1" : "0");
    } catch {}
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice(result.error);
      else router.refresh();
    });
  }

  return (
    <section id="kitchen" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={`Kitchen · ${storeName}`}
        actions={
          <>
            <label className="caption-style text-soft flex min-h-11 items-center gap-2">
              <Checkbox aria-label="Chime on new ticket" checked={chime} onCheckedChange={(checked) => changeChime(checked === true)} />
              Chime
            </label>
            <Button variant="secondary" size="md" className="min-h-11" disabled={pending} onClick={() => run(recallTicket)}>Recall</Button>
          </>
        }
      />
      {notice && <span role="alert" className="caption-style text-danger px-4 pt-3">{notice}</span>}
      <ScrollArea className="min-h-0 flex-1">
        {tickets.length === 0 ? (
          <EmptyState title="No tickets" description="Tickets show up here when a server sends a tab or a counter sale has kitchen items." />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] items-start gap-3 p-3">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex">
                <TicketCard ticket={ticket} now={now} time={time} pending={pending} onDone={() => run(() => finishTicket(ticket.id))} />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
```

The chime's `AudioContext` is created when the switch is turned on, which counts as a user gesture. After a reload, the switch reads as on but stays silent until it's toggled again; that's the browser's autoplay rule, not a bug.

`app/(app)/kitchen/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import KitchenScreen from "@/components/kitchen/kitchen-screen";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadTickets } from "@/lib/kitchen/queries";

export const metadata: Metadata = { title: "Kitchen" };

export default async function KitchenPage() {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="kitchen" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Kitchen" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }
  const supabase = await createClient();
  const [tickets, { data: storeRow }] = await Promise.all([
    loadTickets(supabase, store.id),
    supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle(),
  ]);
  return <KitchenScreen storeId={store.id} storeName={store.name} timeZone={storeRow?.timezone ?? "UTC"} tickets={tickets} />;
}
```

Run: `npx tsc --noEmit && npx eslint lib/kitchen components/kitchen "app/(app)/kitchen"`
Expected: clean.

- [ ] **Step 3: Update the roles test**

In `e2e/roles.spec.ts`, the three nav expectations become:

```ts
  expect(await navLabels(page)).toEqual(["Register", "Tables", "Kitchen", "Products", "Orders", "Customers", "Reports", "Settings"]);
```

```ts
  expect(await navLabels(page)).toEqual(["Register", "Tables", "Kitchen", "Products", "Orders", "Customers", "Reports"]);
```

```ts
  expect(await navLabels(page)).toEqual(["Register", "Tables", "Kitchen", "Orders", "Customers"]);
```

- [ ] **Step 4: Write the browser test**

`e2e/zz-tables.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { openRegister, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

let tabUrl = "";

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

async function addLatteWithOat(page: Page) {
  await page.getByRole("button", { name: "Add Latte" }).click();
  await page.getByRole("button", { name: /^Small/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Oat/ }).click();
  await dialog.getByRole("button", { name: "Add to tab" }).click();
  await expect(dialog).toBeHidden();
}

test("a manager sets up the garden", async ({ page }) => {
  await asManagerAtMainStreet(page);
  await page.goto("/tables/setup");
  await page.getByLabel("New area name").fill("Garden");
  await page.getByRole("button", { name: "Add area" }).click();
  await page.getByLabel("New table name in Garden").fill("G1");
  await page.getByRole("button", { name: "Add table" }).last().click();
  await expect(page.getByLabel("Name for table G1")).toBeVisible();
  await page.getByLabel("New table name in Garden").fill("G2");
  await page.getByRole("button", { name: "Add table" }).last().click();
  await expect(page.getByLabel("Name for table G2")).toBeVisible();
});

test("a server on a phone opens G1, orders and sends", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "cashier@demo.test");
  await page.goto("/tables");
  await page.getByRole("button", { name: "Open G1" }).click();
  await page.getByLabel("Guests").fill("3");
  await page.getByRole("button", { name: "Open tab" }).click();
  await expect(page).toHaveURL(/\/tabs\//);
  tabUrl = new URL(page.url()).pathname;

  await addLatteWithOat(page);
  await page.getByRole("button", { name: /^Tab · 1 items/ }).click();
  await page.getByRole("button", { name: "Note for Latte – Small" }).click();
  await page.getByLabel("Note", { exact: true }).fill("extra hot");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("extra hot")).toBeVisible();
  await page.keyboard.press("Escape");

  await addLatteWithOat(page);
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.getByRole("button", { name: /^Tab · 3 items/ }).click();
  await page.getByRole("button", { name: "Send 3 to the kitchen" }).click();
  await expect(page.getByRole("button", { name: "Everything's sent" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("the kitchen sees the ticket and a void", async ({ page, context }) => {
  await signIn(page, "cashier@demo.test");
  await page.goto("/kitchen");
  const ticket = page.getByRole("article", { name: /G1/ });
  await expect(ticket.getByText("Oat").first()).toBeVisible();
  await expect(ticket.getByText("extra hot")).toBeVisible();

  const server = await context.newPage();
  await server.goto(tabUrl);
  await server.getByRole("button", { name: "Void Croissant" }).click();
  await server.getByLabel("Reason").fill("Out of croissants");
  await server.getByRole("button", { name: "Void item" }).click();
  await expect(server.getByText(/Voided · Out of croissants/)).toBeVisible();

  await page.reload();
  await expect(ticket.getByText("VOID")).toBeVisible();
});

test("the bill marks the table", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await page.goto(tabUrl);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Print bill" }).click();
  const bill = await popup;
  await expect(bill.getByText("G1", { exact: true })).toBeVisible();
  await bill.close();
  await page.goto("/tables");
  await expect(page.getByRole("link", { name: /^G1, .*bill printed/ })).toBeVisible();
});

test("the till takes one latte by card, then splits the rest in cash", async ({ page }) => {
  await openRegister(page);
  await page.goto(`/register?tab=${tabUrl.split("/").pop()}`);
  await expect(page.getByRole("heading", { name: "Paying G1" })).toBeVisible();
  await page.getByRole("button", { name: "Select none" }).click();
  await page.getByRole("checkbox", { name: "Pay Latte – Small" }).first().click();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Card", exact: true }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByRole("button", { name: "Pay the rest" })).toBeVisible();

  await page.getByRole("button", { name: "Pay the rest" }).click();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.getByRole("dialog").getByLabel("People").fill("2");
  await page.getByRole("dialog").getByRole("button", { name: "In cash" }).click();
  await expect(page.getByRole("dialog").getByText("Remaining")).toBeVisible();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText("Tab paid")).toBeVisible();

  await page.getByRole("link", { name: "Back to tables" }).click();
  await expect(page.getByRole("button", { name: "Open G1" })).toBeVisible();
});

test("the kitchen finishes and recalls a ticket, and sees counter sales", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  const receipt = (await page.getByText(/Receipt #\d+/).textContent())!.match(/#(\d+)/)![1];

  await page.goto("/kitchen");
  await expect(page.getByRole("article", { name: new RegExp(`#${receipt}$`) })).toBeVisible();
  const garden = page.getByRole("article", { name: /G1/ });
  await garden.getByRole("button", { name: "Done" }).click();
  await expect(garden).toBeHidden();
  await page.getByRole("button", { name: "Recall" }).click();
  await expect(page.getByRole("article", { name: /G1/ })).toBeVisible();
});
```

- [ ] **Step 5: Run every suite**

Run: `npm test && npx supabase test db && npm run test:e2e`
Expected: all pass. If `roles.spec.ts` still fails on nav labels, check that the sidebar renders `NAV_ITEMS` in order.

If the "kitchen sees counter sales" step can't find the article, confirm Croissant's category (Bakery) is a kitchen category in the seed (`update public.categories set kitchen = true where name in ('Coffee', 'Bakery')`).

- [ ] **Step 6: README**

In `README.md`, after the "Cafés & counters" section, add:

```markdown
## Restaurants & bars

- **Tables:** managers add areas (Inside, Patio) and tables under **Tables → Set up tables**. Servers see a grid of tables on their phone: free, open with the running total and time seated, or waiting with the bill printed.
- **Tabs:** tap a table, enter the guests, and add items. Notes like "no onions" go to the kitchen. **Send** sends everything new as one ticket; sent items are locked, and taking one off needs a void with a reason, which the kitchen sees. Bar tabs work the same with a name instead of a table.
- **Kitchen screen:** open **Kitchen** on a tablet. Tickets from tabs and from counter sales with kitchen items appear live, oldest first, with a timer that turns amber at 10 minutes and red at 20. **Done** clears a ticket; **Recall** brings back the last one.
- **Paying:** **Pay** opens the till with the tab's items. Pay everything, pick items for each guest, or use **Split evenly** in the payment step. Each payment is an ordinary sale with its own receipt, so refunds, reports and the cash drawer work as before.
```

- [ ] **Step 7: Commit**

```bash
git add lib/kitchen components/kitchen "app/(app)/kitchen" e2e/zz-tables.spec.ts e2e/roles.spec.ts README.md
git commit -m "feat(tables): live kitchen screen, browser test and README"
```
