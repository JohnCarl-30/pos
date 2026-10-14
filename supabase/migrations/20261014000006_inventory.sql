create type public.stock_reason as enum (
  'received', 'counted', 'damaged', 'transfer_in', 'transfer_out', 'sold', 'returned', 'correction'
);

alter table public.product_variants
  add column active boolean not null default true,
  add column sort_order integer not null default 0;

alter table public.stock_levels
  add column low_stock_at integer check (low_stock_at >= 0);

insert into public.stock_levels (variant_id, store_id)
select v.id, s.id from public.product_variants v cross join public.stores s
on conflict (variant_id, store_id) do nothing;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity_change integer not null check (quantity_change <> 0),
  reason public.stock_reason not null,
  staff_id uuid not null references public.staff (id) on delete restrict,
  note text check (length(note) <= 300),
  transfer_id uuid,
  created_at timestamptz not null default now(),
  constraint stock_movements_sign_matches_reason check (
    (reason in ('received', 'transfer_in', 'returned') and quantity_change > 0)
    or (reason in ('damaged', 'transfer_out', 'sold') and quantity_change < 0)
    or reason in ('counted', 'correction')
  )
);
create index stock_movements_store_created_idx on public.stock_movements (store_id, created_at desc);
create index stock_movements_variant_store_created_idx on public.stock_movements (variant_id, store_id, created_at desc);
create index stock_movements_staff_id_idx on public.stock_movements (staff_id);
create index stock_movements_transfer_id_idx on public.stock_movements (transfer_id) where transfer_id is not null;

do $$
begin
  if exists (select 1 from public.stock_levels where quantity <> 0)
    and not exists (select 1 from public.staff where role = 'owner') then
    raise exception 'opening stock exists but no owner to attribute it to';
  end if;
end $$;

insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
select sl.store_id, sl.variant_id, sl.quantity, 'counted', o.id, 'Opening stock'
from public.stock_levels sl
cross join lateral (
  select s.id from public.staff s where s.role = 'owner' order by s.created_at limit 1
) o
where sl.quantity <> 0;

create function private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (variant_id, store_id, quantity)
  values (new.variant_id, new.store_id, new.quantity_change)
  on conflict (variant_id, store_id)
  do update set quantity = public.stock_levels.quantity + excluded.quantity;
  return null;
end;
$$;

create trigger stock_movements_apply
after insert on public.stock_movements
for each row execute function private.apply_stock_movement();

create function private.create_variant_stock_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (variant_id, store_id)
  select new.id, s.id from public.stores s
  on conflict (variant_id, store_id) do nothing;
  return null;
end;
$$;

create trigger product_variants_stock_rows
after insert on public.product_variants
for each row execute function private.create_variant_stock_rows();

create function private.create_store_stock_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_levels (variant_id, store_id)
  select v.id, new.id from public.product_variants v
  on conflict (variant_id, store_id) do nothing;
  return null;
end;
$$;

create trigger stores_stock_rows
after insert on public.stores
for each row execute function private.create_store_stock_rows();

revoke execute on function private.apply_stock_movement() from public, anon, authenticated;
revoke execute on function private.create_variant_stock_rows() from public, anon, authenticated;
revoke execute on function private.create_store_stock_rows() from public, anon, authenticated;

alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon;
revoke update, delete, truncate, references, trigger on public.stock_movements from authenticated;

create policy "staff read their stock movements" on public.stock_movements
  for select to authenticated using (private.can_access_store(store_id));
create policy "managers record stock movements" on public.stock_movements
  for insert to authenticated with check (
    (select private.staff_role()) in ('owner', 'manager')
    and private.can_access_store(store_id)
    and staff_id = (select private.staff_id())
    and reason in ('received', 'counted', 'damaged', 'correction')
  );

revoke insert on public.stock_movements from authenticated;
grant insert (store_id, variant_id, quantity_change, reason, staff_id, note) on public.stock_movements to authenticated;

revoke insert, update, delete on public.stock_levels from authenticated;
grant update (track, low_stock_at) on public.stock_levels to authenticated;
