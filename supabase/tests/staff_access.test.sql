begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'sa-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'sa-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'sa-target@test', 'authenticated', 'authenticated');

insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD'),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD');
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'sa-owner@test', 'owner', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'sa-manager@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Target', 'sa-target@test', 'cashier', true);
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$select public.set_staff_access(
    '00000000-0000-0000-0000-0000000000c3', 'manager', true,
    array['00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2']::uuid[]
  )$$,
  'an owner updates role, active and stores in one call'
);
select is(
  (select role from public.staff where id = '00000000-0000-0000-0000-0000000000c3'),
  'manager'::public.staff_role,
  'role is updated to manager'
);
select is(
  (select active from public.staff where id = '00000000-0000-0000-0000-0000000000c3'),
  true,
  'active is set to true'
);
select is(
  (select count(*) from public.staff_stores where staff_id = '00000000-0000-0000-0000-0000000000c3'),
  1::bigint,
  'duplicate store ids are deduped to a single row'
);
select is(
  (select store_id from public.staff_stores where staff_id = '00000000-0000-0000-0000-0000000000c3'),
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'store A is replaced by store B'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok(
  $$select public.set_staff_access('00000000-0000-0000-0000-0000000000c3', 'cashier', false, array[]::uuid[])$$,
  'P0002', 'staff member not found',
  'a manager''s call raises P0002, because the row lock also requires the owner-only write policy'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select role from public.staff where id = '00000000-0000-0000-0000-0000000000c3'),
  'manager'::public.staff_role,
  'role is unchanged by the manager''s call'
);
select is(
  (select active from public.staff where id = '00000000-0000-0000-0000-0000000000c3'),
  true,
  'active is unchanged by the manager''s call'
);
select is(
  (select store_id from public.staff_stores where staff_id = '00000000-0000-0000-0000-0000000000c3'),
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'stores are unchanged by the manager''s call'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$select public.set_staff_access('ffffffff-ffff-ffff-ffff-ffffffffffff', 'owner', true, array[]::uuid[])$$,
  'P0002', 'staff member not found', 'an unknown id raises P0002'
);

select throws_ok(
  $$select public.set_staff_access(
    '00000000-0000-0000-0000-0000000000c3', 'owner', true,
    array['ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid]
  )$$,
  '23503', null,
  'a store id that does not exist raises a foreign-key error'
);
select is(
  (select role from public.staff where id = '00000000-0000-0000-0000-0000000000c3'),
  'manager'::public.staff_role,
  'role is unchanged because the whole call rolled back'
);
select is(
  (select active from public.staff where id = '00000000-0000-0000-0000-0000000000c3'),
  true,
  'active is unchanged because the whole call rolled back'
);
select is(
  (select store_id from public.staff_stores where staff_id = '00000000-0000-0000-0000-0000000000c3'),
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'stores are unchanged because the whole call rolled back'
);

reset role;
select * from finish();
rollback;
