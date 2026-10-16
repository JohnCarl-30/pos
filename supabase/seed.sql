insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'owner@demo.test', 'Olivia Owner'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'manager@demo.test', 'Marco Manager'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'cashier@demo.test', 'Casey Cashier'),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'inactive@demo.test', 'Iris Inactive')
) as u (id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@demo.test';

insert into public.business (name, setup_completed_at) values ('Demo Shop', now());

insert into public.stores (id, name, address, currency, prices_include_tax, timezone) values
  ('00000000-0000-0000-0000-000000000101', 'Main Street', '12 Main Street', 'USD', false, 'America/Chicago'),
  ('00000000-0000-0000-0000-000000000102', 'Airport Kiosk', 'Terminal B', 'USD', false, 'America/Chicago');

insert into public.registers (store_id, name) values
  ('00000000-0000-0000-0000-000000000101', 'Counter 1'),
  ('00000000-0000-0000-0000-000000000101', 'Counter 2'),
  ('00000000-0000-0000-0000-000000000102', 'Kiosk');

insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Olivia Owner', 'owner@demo.test', 'owner', true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000002', 'Marco Manager', 'manager@demo.test', 'manager', true),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000003', 'Casey Cashier', 'cashier@demo.test', 'cashier', true),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000004', 'Iris Inactive', 'inactive@demo.test', 'cashier', false);

insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000101');

insert into public.tax_classes (name, is_default) values ('Standard', true), ('Exempt', false);

insert into public.tax_rates (store_id, tax_class_id, name, rate_bps)
select s.id, t.id, case when t.name = 'Standard' then 'Sales tax' else 'Exempt' end,
  case when t.name = 'Standard' then 825 else 0 end
from public.stores s cross join public.tax_classes t;

with catalog (category, sort_order, product, variant, price, cost, tax_class) as (values
  ('Coffee', 1, 'Espresso', 'Default', 300, 80, 'Standard'),
  ('Coffee', 1, 'Americano', 'Default', 350, 90, 'Standard'),
  ('Coffee', 1, 'Latte', 'Small', 420, 110, 'Standard'),
  ('Coffee', 1, 'Latte', 'Large', 520, 140, 'Standard'),
  ('Coffee', 1, 'Cappuccino', 'Small', 420, 110, 'Standard'),
  ('Coffee', 1, 'Cappuccino', 'Large', 520, 140, 'Standard'),
  ('Coffee', 1, 'Cold Brew', 'Default', 480, 120, 'Standard'),
  ('Tea', 2, 'Green Tea', 'Default', 320, 60, 'Standard'),
  ('Tea', 2, 'Chai Latte', 'Small', 450, 120, 'Standard'),
  ('Tea', 2, 'Chai Latte', 'Large', 550, 150, 'Standard'),
  ('Tea', 2, 'Iced Tea', 'Default', 350, 70, 'Standard'),
  ('Tea', 2, 'Matcha Latte', 'Default', 520, 160, 'Standard'),
  ('Bakery', 3, 'Croissant', 'Default', 350, 120, 'Standard'),
  ('Bakery', 3, 'Pain au Chocolat', 'Default', 380, 130, 'Standard'),
  ('Bakery', 3, 'Blueberry Muffin', 'Default', 330, 110, 'Standard'),
  ('Bakery', 3, 'Banana Bread', 'Default', 360, 100, 'Standard'),
  ('Bakery', 3, 'Cinnamon Roll', 'Default', 400, 130, 'Standard'),
  ('Bakery', 3, 'Bagel', 'Default', 300, 90, 'Standard'),
  ('Snacks', 4, 'Granola Bar', 'Default', 250, 90, 'Standard'),
  ('Snacks', 4, 'Trail Mix', 'Default', 450, 180, 'Standard'),
  ('Snacks', 4, 'Dark Chocolate', 'Default', 300, 120, 'Standard'),
  ('Snacks', 4, 'Potato Chips', 'Default', 220, 80, 'Standard'),
  ('Snacks', 4, 'Cookies', 'Default', 280, 90, 'Standard'),
  ('Snacks', 4, 'Protein Bar', 'Default', 320, 140, 'Standard'),
  ('Merch', 5, 'T-Shirt', 'S', 2500, 900, 'Standard'),
  ('Merch', 5, 'T-Shirt', 'M', 2500, 900, 'Standard'),
  ('Merch', 5, 'T-Shirt', 'L', 2500, 900, 'Standard'),
  ('Merch', 5, 'Tote Bag', 'Default', 1800, 600, 'Standard'),
  ('Merch', 5, 'Mug', 'Default', 1500, 500, 'Standard'),
  ('Merch', 5, 'Reusable Cup', 'Default', 1200, 400, 'Standard'),
  ('Merch', 5, 'Cap', 'Default', 2200, 800, 'Standard'),
  ('Grocery', 6, 'Coffee Beans 250g', 'Whole bean', 1600, 700, 'Exempt'),
  ('Grocery', 6, 'Coffee Beans 250g', 'Ground', 1600, 700, 'Exempt'),
  ('Grocery', 6, 'Oat Milk 1L', 'Default', 450, 250, 'Exempt'),
  ('Grocery', 6, 'Honey Jar', 'Default', 900, 400, 'Exempt'),
  ('Grocery', 6, 'Loose Tea 100g', 'Default', 1100, 450, 'Exempt')
),
cats as (
  insert into public.categories (name, sort_order)
  select distinct category, sort_order from catalog
  returning id, name
),
prods as (
  insert into public.products (category_id, name, tax_class_id)
  select distinct c.id, k.product, t.id
  from catalog k
  join cats c on c.name = k.category
  join public.tax_classes t on t.name = k.tax_class
  returning id, name
)
insert into public.product_variants (product_id, name, sku, barcode, price, cost)
select p.id, k.variant,
  upper(regexp_replace(k.product || '-' || k.variant, '[^A-Za-z0-9]+', '-', 'g')),
  '2' || lpad((row_number() over (order by k.product, k.variant))::text, 12, '0'),
  k.price, k.cost
from catalog k
join prods p on p.name = k.product;

insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
select s.id, v.id, (abs(hashtext(v.sku || s.name)) % 40) + 3, 'received',
  (select id from public.staff where role = 'owner' order by created_at limit 1), 'Opening stock'
from public.product_variants v cross join public.stores s;

insert into public.customers (name, email, phone) values
  ('Ana Reyes', 'ana@example.com', '+1 555 0101'),
  ('Ben Okafor', 'ben@example.com', '+1 555 0102'),
  ('Chloé Martin', 'chloe@example.com', null),
  ('Dev Patel', 'dev@example.com', '+1 555 0104'),
  ('Elif Kaya', null, '+1 555 0105'),
  ('Finn Larsen', 'finn@example.com', null),
  ('Grace Liu', 'grace@example.com', '+1 555 0107'),
  ('Hiro Tanaka', 'hiro@example.com', null),
  ('Isla Brown', 'isla@example.com', '+1 555 0109'),
  ('Jonas Weber', null, null);

update public.categories set kitchen = true where name in ('Coffee', 'Bakery');
insert into public.dining_areas (id, store_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101', 'Inside', 0),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000101', 'Patio', 1);
insert into public.dining_tables (store_id, area_id, name, seats, sort_order) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000501', 'T1', 2, 0),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000501', 'T2', 2, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000501', 'T3', 4, 2),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000501', 'T4', 6, 3),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000502', 'P1', 4, 0),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000502', 'P2', 4, 1);
