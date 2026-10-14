create function public.record_stock_count(
  p_store_id uuid,
  p_variant_id uuid,
  p_counted integer,
  p_note text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current integer;
begin
  if p_counted is null or p_counted < 0 then
    raise exception 'count must be zero or more' using errcode = '22023';
  end if;

  select quantity into v_current
  from public.stock_levels
  where store_id = p_store_id and variant_id = p_variant_id
  for update;

  if not found then
    raise exception 'stock row not found' using errcode = 'P0002';
  end if;

  if p_counted <> v_current then
    insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
    values (p_store_id, p_variant_id, p_counted - v_current, 'counted', (select private.staff_id()), p_note);
  end if;

  return p_counted;
end;
$$;

revoke execute on function public.record_stock_count(uuid, uuid, integer, text) from public, anon;
grant execute on function public.record_stock_count(uuid, uuid, integer, text) to authenticated;

create function public.transfer_stock(
  p_from uuid,
  p_to uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_role public.staff_role;
  v_transfer_id uuid := gen_random_uuid();
begin
  select s.id, s.role into v_staff_id, v_role
  from public.staff s
  where s.user_id = (select auth.uid()) and s.active;

  if v_staff_id is null or v_role not in ('owner', 'manager') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'choose two different stores' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be more than zero' using errcode = '22023';
  end if;
  if not private.can_access_store(p_from) or not private.can_access_store(p_to) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.product_variants where id = p_variant_id) then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;

  perform 1 from public.stock_levels
  where variant_id = p_variant_id and store_id in (p_from, p_to)
  order by store_id
  for update;

  insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note, transfer_id)
  values
    (p_from, p_variant_id, -p_quantity, 'transfer_out', v_staff_id, p_note, v_transfer_id),
    (p_to, p_variant_id, p_quantity, 'transfer_in', v_staff_id, p_note, v_transfer_id);

  return v_transfer_id;
end;
$$;

revoke execute on function public.transfer_stock(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.transfer_stock(uuid, uuid, uuid, integer, text) to authenticated;
