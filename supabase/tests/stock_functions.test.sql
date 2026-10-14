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
