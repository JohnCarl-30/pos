begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'rg-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'rg-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'rg-cashier@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'rg-cashier-b@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'rg-inactive@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency, prices_include_tax) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD', false),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD', true);
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'rg-owner@test', 'owner', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'rg-manager@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'rg-cashier@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a4', 'Cashier B', 'rg-cashier-b@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a5', 'Gone', 'rg-inactive@test', 'cashier', false);
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b2');
insert into public.registers (id, store_id, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Till A'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', 'Till B');
insert into public.tax_classes (id, name, is_default) values ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);
insert into public.tax_rates (store_id, tax_class_id, name, rate_bps) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 'Tax', 1000),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e1', 'Tax', 1000);
insert into public.products (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Tea'),
  ('00000000-0000-0000-0000-0000000000f2', 'Mug');
insert into public.product_variants (id, product_id, sku, price) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'TEA', 300),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 'MUG', 1250);
insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3', 10, 'received', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f3', 10, 'received', '00000000-0000-0000-0000-0000000000c1');
update public.stock_levels set track = false where variant_id = '00000000-0000-0000-0000-0000000000f4';
insert into public.discount_approvals (id, store_id, approved_by, requested_by, max_bps) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', 5000),
  ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c4', 5000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select lives_ok($$select public.open_register('00000000-0000-0000-0000-0000000000d1', 5000)$$, 'a cashier opens a till');
select throws_ok($$select public.open_register('00000000-0000-0000-0000-0000000000d1', 0)$$, '23505', null, 'a till cannot be opened twice');
select throws_ok($$select public.open_register('00000000-0000-0000-0000-0000000000d2', 0)$$, '42501', null, 'a cashier cannot open a till in another store');

select is(
  public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":2}]'::jsonb, null, null, null,
    '[{"method":"cash","amount":660,"tendered":1000}]'::jsonb
  )->>'receipt_number',
  '1',
  'the first sale gets receipt 1'
);
select is(
  (select row(subtotal, tax_total, total)::text from public.orders where register_id = '00000000-0000-0000-0000-0000000000d1' and receipt_number = 1),
  row(600::bigint, 60::bigint, 660::bigint)::text,
  'totals come from catalog prices'
);
select is(
  (select p.change from public.payments p join public.orders o on o.id = p.order_id where o.register_id = '00000000-0000-0000-0000-0000000000d1' and o.receipt_number = 1),
  340::bigint,
  'cash change is recorded'
);
select is((select quantity from public.stock_levels where store_id = '00000000-0000-0000-0000-0000000000b1' and variant_id = '00000000-0000-0000-0000-0000000000f3'), 8, 'a sale reduces tracked stock');
select is(
  public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f4","quantity":1,"discount_bps":1000}]'::jsonb, null, null, null,
    '[{"method":"card","amount":1237}]'::jsonb
  )->>'total',
  '1237',
  'a line discount is applied before tax'
);
select is((select count(*) from public.stock_movements where variant_id = '00000000-0000-0000-0000-0000000000f4'), 0::bigint, 'untracked items record no stock change');
select throws_ok(
  $$select public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, null, null, null,
    '[{"method":"card","amount":100}]'::jsonb)$$,
  '22023', null, 'payments must add up to the total'
);
select throws_ok(
  $$select public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, '{"bps":3000}'::jsonb, null, null,
    '[{"method":"card","amount":231}]'::jsonb)$$,
  'P0001', 'discount needs approval', 'a cashier needs approval above their limit'
);
select lives_ok(
  $$select public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, '{"bps":3000}'::jsonb, '00000000-0000-0000-0000-00000000aa01', null,
    '[{"method":"card","amount":231}]'::jsonb)$$,
  'an approval lets the discount through'
);
select is((select discount_by from public.orders where discount_approval_id = '00000000-0000-0000-0000-00000000aa01'), '00000000-0000-0000-0000-0000000000c2'::uuid, 'the approver is recorded');
select throws_ok(
  $$select public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, '{"bps":3000}'::jsonb, '00000000-0000-0000-0000-00000000aa01', null,
    '[{"method":"card","amount":231}]'::jsonb)$$,
  'P0001', 'discount needs approval', 'an approval works once'
);
select throws_ok(
  $$select public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, '{"bps":3000}'::jsonb, '00000000-0000-0000-0000-00000000aa02', null,
    '[{"method":"card","amount":231}]'::jsonb)$$,
  'P0001', 'discount needs approval', 'another store''s approval does not count'
);
select throws_ok(
  $$insert into public.orders (store_id, register_id, session_id, staff_id, receipt_number, subtotal, tax_total, total)
    select '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', id, '00000000-0000-0000-0000-0000000000c3', 99, 1, 0, 1
    from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null$$,
  '42501', null, 'sales cannot be inserted directly'
);
select is(
  public.close_register((select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' and closed_at is null), 5700, 'Shift end'),
  '{"opening_cash":5000,"cash_sales":660,"expected_cash":5660,"counted_cash":5700,"difference":40}'::jsonb,
  'closing reports expected and counted cash'
);
select throws_ok(
  $$select public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' order by opened_at desc limit 1),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, null, null, null,
    '[{"method":"card","amount":330}]'::jsonb)$$,
  'P0001', 'till is closed', 'a closed till cannot sell'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';

select lives_ok($$select public.open_register('00000000-0000-0000-0000-0000000000d2', 0)$$, 'a cashier opens a till in their own store');
select is(
  public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d2' and closed_at is null),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, null, null, null,
    '[{"method":"cash","amount":300}]'::jsonb
  )->>'total',
  '300',
  'prices that include tax keep the shelf price as the total'
);
select is((select tax_total from public.orders where register_id = '00000000-0000-0000-0000-0000000000d2'), 27::bigint, 'included tax is extracted');
select throws_ok(
  $$select public.create_order(
    (select id from public.register_sessions where register_id = '00000000-0000-0000-0000-0000000000d1' order by opened_at desc limit 1),
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, null, null, null,
    '[{"method":"card","amount":330}]'::jsonb)$$,
  '42501', null, 'a cashier cannot sell on another store''s till'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
select throws_ok(
  $$select public.create_order(
    '00000000-0000-0000-0000-000000000000',
    '[{"variant_id":"00000000-0000-0000-0000-0000000000f3","quantity":1}]'::jsonb, null, null, null,
    '[{"method":"card","amount":300}]'::jsonb)$$,
  '42501', null, 'inactive staff cannot sell'
);

reset role;
select ok(not has_function_privilege('anon', 'public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb)', 'execute'), 'anonymous visitors cannot sell');
select is(
  (select array_agg(receipt_number order by receipt_number) from public.orders where register_id = '00000000-0000-0000-0000-0000000000d1'),
  array[1, 2, 3],
  'receipt numbers count up per register with no gaps'
);

select * from finish();
rollback;
