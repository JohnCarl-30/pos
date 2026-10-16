begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

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

select lives_ok(
  format($$ select public.void_order(%L, 'wrong card') $$, (select o.id from public.orders o join public.order_items oi on oi.order_id = o.id where o.tab_id = (select id from t where key = 'p1') and oi.variant_id = '00000000-0000-0000-0000-0000000000f6')),
  'voids the sale that paid the soup'
);
select is((select status::text from public.tabs where id = (select id from t where key = 'p1')), 'open', 'voiding a tab sale reopens the tab');
select is((select paid_quantity from public.tab_items where id = (select id from t where key = 'soup')), 0, 'the soup is unpaid again');
select is((select table_id from public.tabs where id = (select id from t where key = 'p1')), '00000000-0000-0000-0000-000000000401'::uuid, 'a free table keeps its reopened tab');

insert into t values ('p2', public.open_tab('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000402', null, 2));
select public.add_tab_items((select id from t where key = 'p2'), '[{"variant_id":"00000000-0000-0000-0000-0000000000f4","quantity":1}]');
insert into t select 'p2sale', (public.pay_tab((select id from t where key = 'p2'), '00000000-0000-0000-0000-000000000011',
  jsonb_build_array(jsonb_build_object('tab_item_id', (select id from public.tab_items where tab_id = (select id from t where key = 'p2')), 'quantity', 1)),
  null, null, null, '[{"method":"card","amount":660}]', 0) ->> 'order_id')::uuid;
insert into t values ('p2next', public.open_tab('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000402', null, 4));
select public.void_order((select id from t where key = 'p2sale'), 'wrong table');
select is(
  (select status::text || ' ' || coalesce(table_id::text, 'no table') || ' ' || name from public.tabs where id = (select id from t where key = 'p2')),
  'open no table P2', 'a reopened tab whose table is taken becomes a bar tab named after it'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select is((select count(*) from public.tabs)::integer, 0, 'other stores'' tabs are hidden');
select is((select count(*) from public.kitchen_tickets)::integer, 0, 'other stores'' tickets are hidden');

select * from finish();
rollback;
