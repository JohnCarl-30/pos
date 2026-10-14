create function public.set_staff_access(p_staff_id uuid, p_role public.staff_role, p_active boolean, p_store_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.staff where id = p_staff_id for update;
  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  update public.staff set role = p_role, active = p_active where id = p_staff_id;
  delete from public.staff_stores where staff_id = p_staff_id;
  insert into public.staff_stores (staff_id, store_id)
  select distinct p_staff_id, unnest(coalesce(p_store_ids, '{}'));
end;
$$;

revoke execute on function public.set_staff_access(uuid, public.staff_role, boolean, uuid[]) from public, anon;
grant execute on function public.set_staff_access(uuid, public.staff_role, boolean, uuid[]) to authenticated;
