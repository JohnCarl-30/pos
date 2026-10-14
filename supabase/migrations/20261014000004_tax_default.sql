create function public.set_default_tax_class(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tax_classes where id = p_id) then
    raise exception 'tax class not found' using errcode = 'P0002';
  end if;

  update public.tax_classes set is_default = false where is_default and id <> p_id;
  update public.tax_classes set is_default = true where id = p_id;
end;
$$;

revoke execute on function public.set_default_tax_class(uuid) from public, anon;
grant execute on function public.set_default_tax_class(uuid) to authenticated;
