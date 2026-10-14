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
