begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'td-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'td-manager@test', 'authenticated', 'authenticated');

insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'td-owner@test', 'owner', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'td-manager@test', 'manager', true);
insert into public.tax_classes (id, name, is_default) values
  ('00000000-0000-0000-0000-0000000000e1', 'Standard', true),
  ('00000000-0000-0000-0000-0000000000e2', 'Exempt', false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$select public.set_default_tax_class('00000000-0000-0000-0000-0000000000e2')$$,
  'an owner can switch the default tax class'
);
select is(
  (select count(*) from public.tax_classes where is_default),
  1::bigint,
  'exactly one default remains after the owner switches it'
);
select is(
  (select id from public.tax_classes where is_default),
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  'exempt is now the default'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok(
  $$select public.set_default_tax_class('00000000-0000-0000-0000-0000000000e1')$$,
  'P0002', 'tax class not found',
  'a manager''s call raises P0002, because the row-lock on the existence check also enforces the owner-only write policy, hiding the row from the manager entirely'
);
select is(
  (select count(*) from public.tax_classes where is_default),
  1::bigint,
  'still exactly one default after the manager''s call'
);
select is(
  (select id from public.tax_classes where is_default),
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  'the default is unchanged by the manager''s call'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$select public.set_default_tax_class('ffffffff-ffff-ffff-ffff-ffffffffffff')$$,
  'P0002', 'tax class not found', 'an unknown id raises P0002'
);

reset role;
select * from finish();
rollback;
