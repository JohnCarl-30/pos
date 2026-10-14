begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'acc-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'acc-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'acc-cashier@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'acc-cashier-b@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'acc-inactive@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a6', 'acc-nostaff@test', 'authenticated', 'authenticated');

insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD'),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD');
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'acc-owner@test', 'owner', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'acc-manager@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'acc-cashier@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a4', 'Cashier B', 'acc-cashier-b@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a5', 'Gone', 'acc-inactive@test', 'cashier', false);
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b1');
insert into public.registers (id, store_id, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'R1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', 'R1'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b1', 'R2');
insert into public.tax_classes (id, name, is_default) values
  ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);
insert into public.tax_rates (store_id, tax_class_id, name, rate_bps) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 'Tax', 825),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e1', 'Tax', 700);
insert into public.categories (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Drinks');
insert into public.products (id, category_id, name) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'Tea');
insert into public.product_variants (id, product_id, sku, price) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', 'TEA', 300);
insert into public.stock_levels (variant_id, store_id, quantity) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000b1', 10),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000b2', 5);
insert into public.register_sessions (id, register_id, opened_by) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c4');
insert into public.orders (id, store_id, register_id, session_id, staff_id, receipt_number, subtotal, tax_total, total) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c3', 1, 300, 25, 325),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000c4', 1, 300, 21, 321);
insert into public.order_items (order_id, variant_id, name, sku, unit_price, quantity, tax_rate_bps, tax, line_total) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 1, 825, 25, 325),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 1, 700, 21, 321);
insert into public.payments (order_id, method, amount) values
  ('00000000-0000-0000-0000-000000000021', 'card', 325),
  ('00000000-0000-0000-0000-000000000022', 'card', 321);
insert into public.customers (id, name) values ('00000000-0000-0000-0000-000000000031', 'Ana');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is((select count(*) from public.stores), 1::bigint, 'cashier sees only their store');
select is((select count(*) from public.staff), 1::bigint, 'cashier sees only their own staff row');
select is((select count(*) from public.products), 1::bigint, 'cashier can read the catalog');
select is((select count(*) from public.business), 1::bigint, 'cashier can read the business');
select is((select count(*) from public.stock_levels), 1::bigint, 'cashier sees stock only for their store');
select is((select count(*) from public.orders), 1::bigint, 'cashier sees orders only for their store');
select is((select count(*) from public.order_items), 1::bigint, 'cashier sees order items only for their store');
select is((select count(*) from public.payments), 1::bigint, 'cashier sees payments only for their store');
select throws_ok($$insert into public.products (name) values ('Coffee')$$, '42501', null, 'cashier cannot add products');
select throws_ok($$insert into public.orders (store_id, register_id, session_id, staff_id, receipt_number, subtotal, tax_total, total) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000c3', 2, 100, 0, 100)$$, '42501', null, 'cashier cannot create an order on another store''s register');
select throws_ok($$insert into public.orders (store_id, register_id, session_id, staff_id, receipt_number, subtotal, tax_total, total) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c3', 2, 100, 0, 100)$$, '42501', null, 'cashier cannot create an order against another register''s session');
with u as (update public.product_variants set price = 1 returning 1) select is(count(*), 0::bigint, 'cashier cannot change prices') from u;
with u as (update public.orders set status = 'voided' returning 1) select is(count(*), 0::bigint, 'cashier cannot void orders') from u;
with u as (update public.stores set name = 'X' returning 1) select is(count(*), 0::bigint, 'cashier cannot edit stores') from u;
select throws_ok(
  $$insert into public.register_sessions (register_id, opened_by) values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c3')$$,
  '42501', null, 'cashier cannot open a register in another store'
);
select lives_ok(
  $$insert into public.register_sessions (register_id, opened_by) values ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c3')$$,
  'cashier can open a register in their store'
);
select lives_ok($$insert into public.customers (name) values ('Ben')$$, 'cashier can add customers');
with d as (delete from public.customers returning 1) select is(count(*), 0::bigint, 'cashier cannot delete customers') from d;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is((select count(*) from public.staff), 3::bigint, 'manager sees staff in their store');
select lives_ok($$insert into public.products (name) values ('Coffee')$$, 'manager can add products');
with u as (update public.orders set status = 'voided' where id = '00000000-0000-0000-0000-000000000021' returning 1) select is(count(*), 1::bigint, 'manager can void an order in their store') from u;
with u as (update public.orders set status = 'voided' where id = '00000000-0000-0000-0000-000000000022' returning 1) select is(count(*), 0::bigint, 'manager cannot void another store''s order') from u;
select throws_ok(
  $$insert into public.staff (user_id, name, email, role) values ('00000000-0000-0000-0000-0000000000a6', 'X', 'x@test', 'cashier')$$,
  '42501', null, 'manager cannot add staff'
);
with u as (update public.tax_rates set rate_bps = 1 returning 1) select is(count(*), 0::bigint, 'manager cannot change tax rates') from u;
with u as (update public.stock_levels set quantity = 9 where store_id = '00000000-0000-0000-0000-0000000000b1' returning 1) select is(count(*), 1::bigint, 'manager can adjust stock in their store') from u;
with u as (update public.stock_levels set quantity = 9 where store_id = '00000000-0000-0000-0000-0000000000b2' returning 1) select is(count(*), 0::bigint, 'manager cannot adjust stock in another store') from u;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is((select count(*) from public.stores), 2::bigint, 'owner sees every store');
select is((select count(*) from public.orders), 2::bigint, 'owner sees every order');
select lives_ok($$insert into public.stores (name, currency) values ('Store C', 'EUR')$$, 'owner can add stores');
with u as (update public.staff set role = 'manager' where id = '00000000-0000-0000-0000-0000000000c3' returning 1) select is(count(*), 1::bigint, 'owner can change staff roles') from u;
with d as (delete from public.business returning 1) select is(count(*), 0::bigint, 'owner cannot delete the business') from d;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';

select is((select count(*) from public.orders where id = '00000000-0000-0000-0000-000000000021'), 0::bigint, 'a cashier in store B cannot see store A orders');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';

select is((select count(*) from public.products), 0::bigint, 'inactive staff cannot read the catalog');
select is((select count(*) from public.stores), 0::bigint, 'inactive staff cannot read stores');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';

select is((select count(*) from public.products), 0::bigint, 'a login without a staff row cannot read the catalog');
select throws_ok($$insert into public.customers (name) values ('Eve')$$, '42501', null, 'a login without a staff row cannot add customers');

reset role;
set local role anon;
select throws_ok($$select * from public.products$$, '42501', null, 'anonymous visitors cannot read tables');

reset role;
select * from finish();
rollback;
