begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'setup-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'setup-second@test', 'authenticated', 'authenticated');

set local role anon;
select is(public.setup_status(), false, 'setup is not complete on an empty database');
select throws_ok(
  $$select public.complete_setup('00000000-0000-0000-0000-0000000000f1', 'Owner', 'setup-owner@test', 'Shop', 'Main', 'USD', false, 825, 'UTC')$$,
  '42501', null, 'anonymous visitors cannot run setup'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select public.complete_setup('00000000-0000-0000-0000-0000000000f1', 'Owner', 'setup-owner@test', 'Shop', 'Main', 'USD', false, 825, 'UTC')$$,
  '42501', null, 'signed-in users cannot run setup'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.complete_setup('00000000-0000-0000-0000-0000000000f1', 'Owner', 'setup-owner@test', 'Shop', 'Main', 'USD', false, 825, 'UTC')$$,
  'the server can complete setup'
);
reset role;

select is((select role::text from public.staff where user_id = '00000000-0000-0000-0000-0000000000f1'), 'owner', 'the owner staff row exists');
select is((select rate_bps from public.tax_rates), 825, 'the store has the standard tax rate');
select is((select count(*) from public.registers), 1::bigint, 'the first register exists');

set local role service_role;
select throws_ok(
  $$select public.complete_setup('00000000-0000-0000-0000-0000000000f2', 'Other', 'setup-second@test', 'Shop 2', 'Second', 'USD', false, 0, 'UTC')$$,
  'P0001', 'setup already completed', 'setup cannot run twice'
);
reset role;

set local role anon;
select is(public.setup_status(), true, 'setup reports complete');
reset role;

select throws_ok(
  $$update public.business set setup_completed_at = null$$,
  'P0001', 'setup_completed_at cannot change once setup is complete', 'setup cannot be marked incomplete again'
);

select * from finish();
rollback;
