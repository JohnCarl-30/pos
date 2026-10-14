begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'cf-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'cf-cashier@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency) values ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD');
insert into public.staff (id, user_id, name, email, role) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'cf-manager@test', 'manager'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'cf-cashier@test', 'cashier');
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1');
insert into public.tax_classes (id, name, is_default) values ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$select public.save_product(
    '00000000-0000-0000-0000-0000000000b1',
    '{"name":"Latte","tax_class_id":"00000000-0000-0000-0000-0000000000e1","active":true}',
    '[{"name":"Small","sku":"LAT-S","price":420,"track":false,"active":true,"sort_order":0},{"name":"Large","sku":"LAT-L","barcode":"111","price":520,"cost":140,"track":true,"active":true,"sort_order":1}]'
  )$$,
  'a manager saves a new product with two variants'
);
select is((select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.name = 'Latte'), 2::bigint, 'both variants exist');
select is((select track from public.stock_levels sl join public.product_variants v on v.id = sl.variant_id where v.sku = 'LAT-S'), false, 'tracking is set for the store');
select throws_ok(
  $$select public.save_product(
    '00000000-0000-0000-0000-0000000000b1',
    '{"name":"Mocha","tax_class_id":"00000000-0000-0000-0000-0000000000e1","active":true}',
    '[{"name":"Default","sku":"MOC","price":450,"track":true,"active":true,"sort_order":0},{"name":"Dup","sku":"LAT-S","price":1,"track":true,"active":true,"sort_order":1}]'
  )$$,
  '23505', null, 'a duplicate SKU fails the whole save'
);
select is((select count(*) from public.products where name = 'Mocha'), 0::bigint, 'nothing from the failed save remains');
select throws_ok(
  $$select public.save_product(
    '00000000-0000-0000-0000-0000000000b1',
    '{"id":"00000000-0000-0000-0000-00000000dead","name":"Ghost","tax_class_id":"00000000-0000-0000-0000-0000000000e1","active":true}',
    '[]'
  )$$,
  'P0002', null, 'saving a product that no longer exists fails'
);

select is(
  public.import_catalog('00000000-0000-0000-0000-0000000000b1', '[
    {"product":"Latte","category":"Coffee","variant":"Small","sku":"LAT-S","price":450,"tax_class_id":"00000000-0000-0000-0000-0000000000e1"},
    {"product":"Croissant","category":"Bakery","variant":"Default","sku":"CRO","price":350,"tax_class_id":"00000000-0000-0000-0000-0000000000e1","stock":12},
    {"product":"Croissant","category":"Bakery","variant":"Almond","sku":"CRO-A","price":400,"tax_class_id":"00000000-0000-0000-0000-0000000000e1","track":false}
  ]'::jsonb),
  3,
  'an import applies every row'
);
select is((select price from public.product_variants where sku = 'LAT-S'), 450::bigint, 'an existing SKU is updated');
select is((select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.name = 'Croissant'), 2::bigint, 'rows with one product name become one product');
select is((select count(*) from public.categories where name in ('Coffee', 'Bakery')), 2::bigint, 'missing categories are created');
select is((select quantity from public.stock_levels sl join public.product_variants v on v.id = sl.variant_id where v.sku = 'CRO'), 12, 'a stock value becomes a count');
select lives_ok(
  $$select public.import_catalog('00000000-0000-0000-0000-0000000000b1', '[{"product":"Latte","sku":"LAT-L","price":600}]'::jsonb)$$,
  'a price-only row updates an existing SKU'
);
select is(
  (select row(price, barcode, cost, name)::text from public.product_variants where sku = 'LAT-L'),
  row(600::bigint, '111'::text, 140::bigint, 'Large'::text)::text,
  'columns missing from the file are left unchanged'
);
select throws_ok(
  $$select public.import_catalog('00000000-0000-0000-0000-0000000000b1', '[
    {"product":"Bagel","variant":"Default","sku":"BAG","price":300,"tax_class_id":"00000000-0000-0000-0000-0000000000e1"},
    {"product":"Bagel","variant":"Seeded","sku":"BAG-S","barcode":"111","price":320,"tax_class_id":"00000000-0000-0000-0000-0000000000e1"}
  ]'::jsonb)$$,
  '23505', null, 'a failing row fails the whole import'
);
select is((select count(*) from public.products where name = 'Bagel'), 0::bigint, 'nothing from the failed import remains');

reset role;
select * from finish();
rollback;
