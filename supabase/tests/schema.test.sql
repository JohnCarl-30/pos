begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

select tables_are('public', array[
  'business', 'stores', 'registers', 'staff', 'staff_stores', 'tax_classes', 'tax_rates',
  'categories', 'products', 'product_variants', 'stock_levels', 'stock_movements', 'customers', 'discount_approvals',
  'register_sessions', 'orders', 'order_items', 'payments'
], 'public has exactly the foundation tables');

select col_type_is('public', 'product_variants', 'price', 'bigint', 'variant price is bigint');
select col_type_is('public', 'product_variants', 'cost', 'bigint', 'variant cost is bigint');
select col_type_is('public', 'register_sessions', 'opening_cash', 'bigint', 'opening cash is bigint');
select col_type_is('public', 'register_sessions', 'counted_cash', 'bigint', 'counted cash is bigint');
select col_type_is('public', 'orders', 'subtotal', 'bigint', 'subtotal is bigint');
select col_type_is('public', 'orders', 'discount_total', 'bigint', 'discount total is bigint');
select col_type_is('public', 'orders', 'tax_total', 'bigint', 'tax total is bigint');
select col_type_is('public', 'orders', 'total', 'bigint', 'total is bigint');
select col_type_is('public', 'order_items', 'unit_price', 'bigint', 'unit price is bigint');
select col_type_is('public', 'order_items', 'discount', 'bigint', 'line discount is bigint');
select col_type_is('public', 'order_items', 'tax', 'bigint', 'line tax is bigint');
select col_type_is('public', 'order_items', 'line_total', 'bigint', 'line total is bigint');
select col_type_is('public', 'payments', 'amount', 'bigint', 'payment amount is bigint');
select col_type_is('public', 'payments', 'tendered', 'bigint', 'tendered is bigint');
select col_type_is('public', 'payments', 'change', 'bigint', 'change is bigint');

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'RLS is enabled on every public table'
);

select ok(not has_table_privilege('anon', 'public.stores', 'select'), 'anon has no table privileges');

insert into public.business (name) values ('First');
select throws_ok(
  $$insert into public.business (name) values ('Second')$$,
  '23505', null, 'only one business row can exist'
);

insert into public.tax_classes (name, is_default) values ('Standard', true);
select throws_ok(
  $$insert into public.tax_classes (name, is_default) values ('Food', true)$$,
  '23505', null, 'only one default tax class can exist'
);

insert into public.products (name) values ('Tea');
select is(
  (select t.name from public.products p join public.tax_classes t on t.id = p.tax_class_id where p.name = 'Tea'),
  'Standard',
  'a new product gets the default tax class'
);

select throws_ok(
  $$insert into public.product_variants (product_id, sku, price) select id, 'NEG', -1 from public.products where name = 'Tea'$$,
  '23514', null, 'negative prices are rejected'
);

select * from finish();
rollback;
