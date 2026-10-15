begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'rp-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'rp-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'rp-cashier@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'rp-manager-b@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'rp-gone@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency, prices_include_tax, timezone) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD', false, 'Asia/Manila'),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD', false, 'UTC');
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'rp-owner@test', 'owner', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'rp-manager@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'rp-cashier@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a4', 'Manager B', 'rp-manager-b@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a5', 'Gone', 'rp-gone@test', 'manager', false);
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b1');
insert into public.registers (id, store_id, name, next_receipt_number) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Till 1', 10),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', 'Till 2', 10);
insert into public.tax_classes (id, name, is_default) values ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);
insert into public.categories (id, name) values
  ('00000000-0000-0000-0000-0000000000e2', 'Drinks'),
  ('00000000-0000-0000-0000-0000000000e3', 'Merch');
insert into public.products (id, name, category_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'Tea', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000f2', 'Mug', '00000000-0000-0000-0000-0000000000e3');
insert into public.product_variants (id, product_id, name, sku, price) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'Default', 'TEA', 300),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 'Blue', 'MUG-BLUE', 1250);
insert into public.register_sessions (id, register_id, opened_by, opening_cash, opened_at, closed_by, closed_at, counted_cash) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3', 10000, '2026-10-13 08:00+08', '00000000-0000-0000-0000-0000000000c3', '2026-10-13 23:59+08', 10490),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 5000, '2026-10-14 09:00+08', '00000000-0000-0000-0000-0000000000c2', '2026-10-14 21:00+08', 4900),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3', 2000, '2026-10-14 00:30+08', null, null, null);
insert into public.orders (id, store_id, register_id, session_id, staff_id, receipt_number, status, subtotal, discount_total, tax_total, total, created_at, voided_at, voided_by, void_reason) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c3', 1, 'partially_refunded', 900, 0, 90, 990, '2026-10-13 10:00+08', null, null, null),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000c3', 2, 'completed', 1250, 125, 112, 1237, '2026-10-14 01:30+08', null, null, null),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000c3', 1, 'voided', 300, 0, 30, 330, '2026-10-14 10:00+08', '2026-10-14 10:05+08', '00000000-0000-0000-0000-0000000000c3', 'wrong item'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000c2', 2, 'completed', 600, 0, 60, 660, '2026-10-14 11:00+08', null, null, null);
insert into public.order_items (id, order_id, line_number, variant_id, name, sku, unit_price, quantity, discount, tax_rate_bps, tax, line_total) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 1, '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 3, 0, 1000, 90, 990),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000022', 1, '00000000-0000-0000-0000-0000000000f4', 'Mug – Blue', 'MUG-BLUE', 1250, 1, 125, 1000, 112, 1237),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000023', 1, '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 1, 0, 1000, 30, 330),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000024', 1, '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 2, 0, 1000, 60, 660);
insert into public.payments (order_id, method, amount) values
  ('00000000-0000-0000-0000-000000000021', 'card', 500),
  ('00000000-0000-0000-0000-000000000021', 'cash', 490),
  ('00000000-0000-0000-0000-000000000022', 'cash', 1237),
  ('00000000-0000-0000-0000-000000000023', 'cash', 330),
  ('00000000-0000-0000-0000-000000000024', 'cash', 660);
insert into public.refunds (id, order_id, store_id, register_id, session_id, receipt_number, staff_id, approved_by, reason, subtotal, tax_total, total, created_at) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000012', 3, '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'changed_mind', 300, 30, 330, '2026-10-14 12:00+08');
insert into public.refund_items (refund_id, order_item_id, quantity, restock, amount, tax) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000031', 1, true, 330, 30);
insert into public.refund_payments (refund_id, method, amount) values
  ('00000000-0000-0000-0000-000000000041', 'cash', 330);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(
  public.report_summary('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08'),
  '{"sales_count":2,"gross":1850,"discounts":125,"tax":172,"sales_total":1897,"refund_count":1,"refunds_total":330,"refund_tax":30,"net_sales":1567,"net_tax":142,"average_sale":948,"void_count":1,"void_total":330,"methods":{"cash":1567,"card":0,"other":0}}'::jsonb,
  'the summary adds up a local day to the cent'
);
select is(
  public.report_summary('00000000-0000-0000-0000-0000000000b1', '2026-10-13 00:00+08', '2026-10-14 00:00+08') ->> 'net_sales',
  '990',
  'a refund on a later day does not change the earlier day'
);
select is(
  (select array_agg(row(bucket, sales_count, sales_total, refunds_total, net_sales)::text order by bucket)
   from public.report_trend('00000000-0000-0000-0000-0000000000b1', '2026-10-13 00:00+08', '2026-10-15 00:00+08', 'day')),
  array['(2026-10-13,1,990,0,990)', '(2026-10-14,2,1897,330,1567)'],
  'daily buckets follow the store''s local days'
);
select is(
  (select count(*) from public.report_trend('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08', 'hour')),
  24::bigint,
  'every hour of the day is present, even empty ones'
);
select is(
  (select sales_total from public.report_trend('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08', 'hour') where bucket = '2026-10-14 01:00'),
  1237::bigint,
  'a 01:30 local sale lands in the 01:00 local hour'
);
select is(
  (select array_agg(row(name, category, units_sold, units_refunded, net_units, revenue, refunded, net_revenue)::text order by net_revenue desc)
   from public.report_products('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08')),
  array['("Mug – Blue",Merch,1,0,1,1237,0,1237)', '(Tea,Drinks,2,1,1,660,330,330)'],
  'products net out refunds on the refund day and leave out voided sales'
);
select is(
  (select array_agg(row(name, sales_count, sales_total, refund_count, refunds_total, void_count, void_total, cash_void_count, discounts)::text order by name)
   from public.report_staff('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08')),
  array['(Cashier,1,1237,0,0,1,330,1,125)', '(Manager,1,660,1,330,0,0,0,0)'],
  'staff totals: refunds by who processed them, voids by who rang them up'
);
select is(
  (select row(register, opening_cash, cash_sales, cash_refunds, expected_cash, counted_cash, difference)::text
   from public.report_cashups('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08')),
  row('Till 2', 5000::bigint, 660::bigint, 330::bigint, 5330::bigint, 4900::bigint, -430::bigint)::text,
  'a cash-up leaves out voided cash and takes off cash refunds'
);
select is(
  (select difference from public.report_cashups('00000000-0000-0000-0000-0000000000b1', '2026-10-13 00:00+08', '2026-10-14 00:00+08')),
  0::bigint,
  'a balanced till shows no difference'
);
select is(
  (select expected_cash from private.session_cash('00000000-0000-0000-0000-000000000013')),
  (public.close_register('00000000-0000-0000-0000-000000000013', 0) ->> 'expected_cash')::bigint,
  'the cash-up formula is the same one close till uses'
);
select throws_ok(
  $$select public.report_summary('00000000-0000-0000-0000-0000000000b1', '2025-01-01 00:00+08', '2026-01-05 00:00+08')$$,
  '22023', 'pick a range of up to 366 days', 'ranges over 366 days are refused'
);
select throws_ok(
  $$select public.report_summary('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-14 00:00+08')$$,
  '22023', 'pick a range of up to 366 days', 'an empty range is refused'
);
select throws_ok(
  $$select * from public.report_trend('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08', 'week')$$,
  '22023', 'bucket must be hour or day', 'only hour and day buckets'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$select public.report_summary('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08')$$,
  'the owner can run reports'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok(
  $$select public.report_summary('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08')$$,
  '42501', 'not allowed', 'cashiers cannot run reports'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_staff('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08')$$,
  '42501', 'not allowed', 'another store''s manager cannot run this store''s reports'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_cashups('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08')$$,
  '42501', 'not allowed', 'inactive staff cannot run reports'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.report_summary('00000000-0000-0000-0000-0000000000b1', '2026-10-14 00:00+08', '2026-10-15 00:00+08')$$,
  '42501', null, 'anonymous visitors cannot run reports'
);

select * from finish();
rollback;
