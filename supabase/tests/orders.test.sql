begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

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
select throws_ok(
  $$insert into public.register_sessions (register_id, opened_by, opening_cash, closed_by, closed_at, counted_cash)
    values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3', 0, '00000000-0000-0000-0000-0000000000c1', now(), 999)$$,
  '42501', null, 'staff cannot insert an already-closed till session'
);
select throws_ok(
  $$insert into public.register_sessions (register_id, opened_by, opening_cash, opened_at)
    values ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c3', 0, now() - interval '30 days')$$,
  '42501', null, 'staff cannot back-date when a till was opened'
);

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
