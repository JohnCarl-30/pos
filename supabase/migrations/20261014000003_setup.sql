create function public.setup_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.business where setup_completed_at is not null)
$$;

revoke execute on function public.setup_status() from public;
grant execute on function public.setup_status() to anon, authenticated, service_role;

create function public.complete_setup(
  p_user_id uuid,
  p_owner_name text,
  p_owner_email text,
  p_business_name text,
  p_store_name text,
  p_currency text,
  p_prices_include_tax boolean,
  p_tax_rate_bps integer,
  p_timezone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_tax_class_id uuid;
begin
  if exists (select 1 from public.business) then
    raise exception 'setup already completed' using errcode = 'P0001';
  end if;

  insert into public.business (name, setup_completed_at)
  values (p_business_name, now());

  insert into public.stores (name, currency, prices_include_tax, timezone)
  values (p_store_name, p_currency, p_prices_include_tax, p_timezone)
  returning id into v_store_id;

  insert into public.tax_classes (name, is_default)
  values ('Standard', true)
  returning id into v_tax_class_id;

  insert into public.tax_rates (store_id, tax_class_id, name, rate_bps)
  values (v_store_id, v_tax_class_id, 'Standard', p_tax_rate_bps);

  insert into public.registers (store_id, name)
  values (v_store_id, 'Register 1');

  insert into public.staff (user_id, name, email, role)
  values (p_user_id, p_owner_name, p_owner_email, 'owner');

  return v_store_id;
end;
$$;

revoke execute on function public.complete_setup(uuid, text, text, text, text, text, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.complete_setup(uuid, text, text, text, text, text, boolean, integer, text) to service_role;

create function private.keep_setup_completed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.setup_completed_at is not null and new.setup_completed_at is distinct from old.setup_completed_at then
    raise exception 'setup_completed_at cannot change once setup is complete' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger keep_setup_completed
  before update on public.business
  for each row execute function private.keep_setup_completed();
