begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

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

select throws_ok(
  $$select public.create_refund((select id from public.orders where tip > 0), '00000000-0000-0000-0000-000000000011',
    (select jsonb_build_array(jsonb_build_object('order_item_id', oi.id, 'quantity', 1, 'restock', true)) from public.order_items oi join public.orders o on o.id = oi.order_id where o.tip > 0),
    '[{"method":"card","amount":1000},{"method":"cash","amount":375}]')$$,
  '22023', 'card refunds can''t be more than 870', 'a card refund cannot hand back the card''s share of the tip'
);
select is(
  public.create_refund((select id from public.orders where tip > 0), '00000000-0000-0000-0000-000000000011',
    (select jsonb_build_array(jsonb_build_object('order_item_id', oi.id, 'quantity', 1, 'restock', true)) from public.order_items oi join public.orders o on o.id = oi.order_id where o.tip > 0),
    '[{"method":"card","amount":870},{"method":"cash","amount":505}]') ->> 'total',
  '1375',
  'a refund gives back the sale, never the tip'
);
select is(
  public.report_summary('00000000-0000-0000-0000-0000000000b1', now() - interval '1 day', now() + interval '1 day') -> 'methods',
  '{"cash":0,"card":605,"other":0}'::jsonb,
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
  public.close_register('00000000-0000-0000-0000-000000000011', 76),
  '{"opening_cash":0,"cash_sales":505,"cash_tips":76,"cash_refunds":505,"expected_cash":76,"counted_cash":76,"difference":0,"voided_count":0}'::jsonb,
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
