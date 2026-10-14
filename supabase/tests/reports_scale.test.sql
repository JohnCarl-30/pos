begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2', 'sc-manager@test', 'authenticated', 'authenticated');
insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency, timezone) values ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD', 'UTC');
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'sc-manager@test', 'manager', true);
insert into public.staff_stores (staff_id, store_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1');
insert into public.registers (id, store_id, name, next_receipt_number) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Till 1', 100000);
insert into public.register_sessions (id, register_id, opened_by, opened_at, closed_by, closed_at, counted_cash)
  select ('00000000-0000-4000-8000-' || lpad(to_hex(d), 12, '0'))::uuid, '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2',
    timestamptz '2025-10-14 08:00Z' + make_interval(days => d), '00000000-0000-0000-0000-0000000000c2', timestamptz '2025-10-14 20:00Z' + make_interval(days => d), 0
  from generate_series(0, 299) d;
insert into public.orders (id, store_id, register_id, session_id, staff_id, receipt_number, subtotal, tax_total, total, created_at)
  select gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1',
    ('00000000-0000-4000-8000-' || lpad(to_hex(n / 100), 12, '0'))::uuid, '00000000-0000-0000-0000-0000000000c2', n + 1, 300, 30, 330,
    timestamptz '2025-10-14 09:00Z' + make_interval(days => n / 100, mins => n % 100)
  from generate_series(0, 29999) n;
insert into public.order_items (order_id, name, sku, unit_price, quantity, tax_rate_bps, tax, line_total)
  select o.id, 'Tea', 'TEA', 300, 1, 1000, 30, 330 from public.orders o;
insert into public.payments (order_id, method, amount) select o.id, 'cash', 330 from public.orders o;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
set local statement_timeout = '1500ms';

select lives_ok($$select public.report_summary('00000000-0000-0000-0000-0000000000b1', '2025-10-14Z', '2026-10-14Z')$$, 'a year of 30,000 sales summarises within 1.5s');
select lives_ok($$select count(*) from public.report_products('00000000-0000-0000-0000-0000000000b1', '2025-10-14Z', '2026-10-14Z')$$, 'a year of products within 1.5s');
select lives_ok($$select count(*) from public.report_cashups('00000000-0000-0000-0000-0000000000b1', '2025-10-14Z', '2026-10-14Z')$$, 'a year of cash-ups within 1.5s');
select is((public.report_summary('00000000-0000-0000-0000-0000000000b1', '2025-10-14Z', '2026-10-14Z') ->> 'sales_count')::integer, 30000, 'every sale is counted');

select * from finish();
rollback;
