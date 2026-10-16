create type public.tab_status as enum ('open', 'paid', 'cancelled');

alter table public.stores add column next_ticket_number integer not null default 1;

create table public.dining_areas (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index dining_areas_active_name_idx on public.dining_areas (store_id, lower(name)) where active;

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  area_id uuid not null references public.dining_areas (id) on delete restrict,
  name text not null check (length(name) between 1 and 20),
  seats integer not null check (seats between 1 and 50),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index dining_tables_active_name_idx on public.dining_tables (store_id, lower(name)) where active;
create index dining_tables_area_id_idx on public.dining_tables (area_id);

create table public.tabs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  table_id uuid references public.dining_tables (id) on delete restrict,
  name text check (length(name) between 1 and 40),
  guests integer check (guests between 1 and 99),
  opened_by uuid not null references public.staff (id),
  opened_at timestamptz not null default now(),
  bill_printed_at timestamptz,
  status public.tab_status not null default 'open',
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (table_id is not null or name is not null)
);
create unique index tabs_one_open_per_table_idx on public.tabs (table_id) where status = 'open';
create index tabs_store_status_idx on public.tabs (store_id, status);

create table public.tab_items (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  option_ids uuid[] not null default '{}',
  name text not null,
  quantity integer not null check (quantity between 1 and 999),
  paid_quantity integer not null default 0 check (paid_quantity >= 0 and paid_quantity <= quantity),
  note text check (length(note) between 1 and 100),
  added_by uuid not null references public.staff (id),
  added_at timestamptz not null default now(),
  sent_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.staff (id),
  void_reason text check (length(void_reason) between 1 and 200),
  check (voided_at is null or (sent_at is not null and paid_quantity = 0 and void_reason is not null))
);
create index tab_items_tab_id_idx on public.tab_items (tab_id);
create index tab_items_variant_id_idx on public.tab_items (variant_id);

alter table public.orders add column tab_id uuid references public.tabs (id);
create index orders_tab_id_idx on public.orders (tab_id);
alter table public.order_items add column tab_item_id uuid references public.tab_items (id) on delete set null;
create index order_items_tab_item_id_idx on public.order_items (tab_item_id);

create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  number integer not null,
  tab_id uuid references public.tabs (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  label text not null,
  sent_by uuid not null references public.staff (id),
  sent_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references public.staff (id),
  updated_at timestamptz not null default now(),
  check ((tab_id is null) <> (order_id is null))
);
create index kitchen_tickets_store_done_idx on public.kitchen_tickets (store_id, done_at);
create index kitchen_tickets_tab_id_idx on public.kitchen_tickets (tab_id);
create index kitchen_tickets_order_id_idx on public.kitchen_tickets (order_id);

create table public.kitchen_ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.kitchen_tickets (id) on delete cascade,
  tab_item_id uuid references public.tab_items (id) on delete set null,
  quantity integer not null check (quantity > 0),
  name text not null,
  choices text,
  note text,
  voided boolean not null default false,
  sort_order integer not null default 0
);
create index kitchen_ticket_items_ticket_id_idx on public.kitchen_ticket_items (ticket_id);
create index kitchen_ticket_items_tab_item_id_idx on public.kitchen_ticket_items (tab_item_id);

alter table public.dining_areas enable row level security;
alter table public.dining_tables enable row level security;
alter table public.tabs enable row level security;
alter table public.tab_items enable row level security;
alter table public.kitchen_tickets enable row level security;
alter table public.kitchen_ticket_items enable row level security;
revoke all on public.dining_areas, public.dining_tables, public.tabs, public.tab_items, public.kitchen_tickets, public.kitchen_ticket_items from anon;
revoke delete, truncate, references, trigger on public.dining_areas, public.dining_tables from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.tabs, public.tab_items, public.kitchen_tickets, public.kitchen_ticket_items from authenticated;

create policy "staff read dining areas" on public.dining_areas
  for select to authenticated using (private.can_access_store(store_id));
create policy "managers add dining areas" on public.dining_areas
  for insert to authenticated
  with check ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id));
create policy "managers change dining areas" on public.dining_areas
  for update to authenticated
  using ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id))
  with check ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id));
create policy "staff read dining tables" on public.dining_tables
  for select to authenticated using (private.can_access_store(store_id));
create policy "managers add dining tables" on public.dining_tables
  for insert to authenticated
  with check ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id));
create policy "managers change dining tables" on public.dining_tables
  for update to authenticated
  using ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id))
  with check ((select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id));
create policy "staff read tabs" on public.tabs
  for select to authenticated using (private.can_access_store(store_id));
create policy "staff read tab items" on public.tab_items
  for select to authenticated using (exists (select 1 from public.tabs t where t.id = tab_id and private.can_access_store(t.store_id)));
create policy "staff read kitchen tickets" on public.kitchen_tickets
  for select to authenticated using (private.can_access_store(store_id));
create policy "staff read kitchen ticket items" on public.kitchen_ticket_items
  for select to authenticated using (exists (select 1 from public.kitchen_tickets k where k.id = ticket_id and private.can_access_store(k.store_id)));

create function private.check_dining_table()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.dining_areas a where a.id = new.area_id and a.store_id = new.store_id) then
    raise exception 'pick an area in this store' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.active and not new.active
    and exists (select 1 from public.tabs t where t.table_id = old.id and t.status = 'open') then
    raise exception '%', format('%s has an open tab', old.name) using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger dining_tables_check before insert or update on public.dining_tables
  for each row execute function private.check_dining_table();

create function private.check_dining_area()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active and not new.active and exists (select 1 from public.dining_tables d where d.area_id = old.id and d.active) then
    raise exception '%', format('%s still has tables', old.name) using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger dining_areas_check before update on public.dining_areas
  for each row execute function private.check_dining_area();

create function private.lock_open_tab(p_tab_id uuid)
returns public.tabs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs;
begin
  if private.staff_id() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_tab from public.tabs where id = p_tab_id for update;
  if not found or not private.can_access_store(v_tab.store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_tab.status <> 'open' then
    raise exception 'this tab is closed' using errcode = '22023';
  end if;
  return v_tab;
end;
$$;

create function private.tab_label(p_tab public.tabs)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select d.name from public.dining_tables d where d.id = p_tab.table_id), p_tab.name)
$$;

create function private.lock_tab_item(p_item_id uuid)
returns public.tab_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab_id uuid;
  v_item public.tab_items;
begin
  select tab_id into v_tab_id from public.tab_items where id = p_item_id;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.lock_open_tab(v_tab_id);
  select * into v_item from public.tab_items where id = p_item_id for update;
  return v_item;
end;
$$;

create function private.check_options(p_product_id uuid, p_option_ids uuid[], p_label text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bad text;
  v_group record;
  v_delta bigint;
begin
  if cardinality(p_option_ids) > 50 or cardinality(p_option_ids) <> (select count(distinct x) from unnest(p_option_ids) x) then
    raise exception 'list each choice once' using errcode = '22023';
  end if;

  select coalesce(mo.name, 'A choice') into v_bad
  from unnest(p_option_ids) as chosen(id)
  left join public.modifier_options mo on mo.id = chosen.id
  left join public.modifier_groups mg on mg.id = mo.group_id
  left join public.product_modifier_groups pmg on pmg.group_id = mg.id and pmg.product_id = p_product_id
  where mo.id is null or not mo.active or not mg.active or pmg.product_id is null
  limit 1;
  if found then
    raise exception '%', format('%s isn''t available for %s any more', v_bad, p_label) using errcode = '22023';
  end if;

  for v_group in
    select mg.name, mg.min_choices, mg.max_choices,
      (select count(*) from unnest(p_option_ids) c(id) join public.modifier_options mo on mo.id = c.id where mo.group_id = mg.id)::integer as chosen
    from public.product_modifier_groups pmg
    join public.modifier_groups mg on mg.id = pmg.group_id
    where pmg.product_id = p_product_id and mg.active
    order by pmg.sort_order, mg.name
  loop
    if v_group.chosen < v_group.min_choices then
      raise exception '%', format('pick %s for %s', v_group.name, p_label) using errcode = '22023';
    end if;
    if v_group.chosen > v_group.max_choices then
      raise exception '%', format('pick up to %s %s for %s', v_group.max_choices, v_group.name, p_label) using errcode = '22023';
    end if;
  end loop;

  select coalesce(sum(mo.price_delta), 0) into v_delta from public.modifier_options mo where mo.id = any(p_option_ids);
  return v_delta;
end;
$$;

create function private.choices_label(p_product_id uuid, p_option_ids uuid[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(string_agg(mo.name, ' · ' order by pmg.sort_order, mg.name, mo.sort_order, mo.name), '')
  from unnest(p_option_ids) as chosen(id)
  join public.modifier_options mo on mo.id = chosen.id
  join public.modifier_groups mg on mg.id = mo.group_id
  left join public.product_modifier_groups pmg on pmg.group_id = mg.id and pmg.product_id = p_product_id
$$;

create function private.new_ticket(p_store_id uuid, p_tab_id uuid, p_order_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
  v_ticket_id uuid;
begin
  update public.stores set next_ticket_number = next_ticket_number + 1
  where id = p_store_id
  returning next_ticket_number - 1 into v_number;
  insert into public.kitchen_tickets (store_id, number, tab_id, order_id, label, sent_by)
  values (p_store_id, v_number, p_tab_id, p_order_id, coalesce(nullif(p_label, ''), 'Order'), private.staff_id())
  returning id into v_ticket_id;
  return v_ticket_id;
end;
$$;

create function private.send_lines(p_tab public.tabs, p_item_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent uuid[];
  v_ticket_id uuid;
begin
  with sent as (
    update public.tab_items set sent_at = now()
    where tab_id = p_tab.id and sent_at is null and (p_item_ids is null or id = any(p_item_ids))
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_sent from sent;

  if not exists (
    select 1 from public.tab_items ti
    join public.product_variants v on v.id = ti.variant_id
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    where ti.id = any(v_sent) and c.kitchen
  ) then
    return null;
  end if;

  v_ticket_id := private.new_ticket(p_tab.store_id, p_tab.id, null, private.tab_label(p_tab));
  insert into public.kitchen_ticket_items (ticket_id, tab_item_id, quantity, name, choices, note, sort_order)
  select v_ticket_id, ti.id, ti.quantity, ti.name, private.choices_label(v.product_id, ti.option_ids), ti.note,
    (row_number() over (order by ti.added_at, ti.id))::integer
  from public.tab_items ti
  join public.product_variants v on v.id = ti.variant_id
  join public.products p on p.id = v.product_id
  join public.categories c on c.id = p.category_id
  where ti.id = any(v_sent) and c.kitchen;
  return v_ticket_id;
end;
$$;

create function private.settle_tab(p_tab_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tab_items where tab_id = p_tab_id and voided_at is null and paid_quantity < quantity) then
    return false;
  end if;
  if not exists (select 1 from public.tab_items where tab_id = p_tab_id and paid_quantity > 0) then
    return false;
  end if;
  update public.tabs set status = 'paid', closed_at = now(), updated_at = now() where id = p_tab_id;
  return true;
end;
$$;

revoke execute on function private.check_dining_table(), private.check_dining_area(), private.lock_open_tab(uuid), private.tab_label(public.tabs),
  private.lock_tab_item(uuid), private.check_options(uuid, uuid[], text), private.choices_label(uuid, uuid[]),
  private.new_ticket(uuid, uuid, uuid, text), private.send_lines(public.tabs, uuid[]), private.settle_tab(uuid)
  from public, anon, authenticated;

create function public.open_tab(p_store_id uuid, p_table_id uuid default null, p_name text default null, p_guests integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := private.staff_id();
  v_table record;
  v_name text := nullif(trim(p_name), '');
  v_tab_id uuid;
begin
  if v_staff_id is null or not private.can_access_store(p_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_guests is not null and (p_guests < 1 or p_guests > 99) then
    raise exception 'guests must be between 1 and 99' using errcode = '22023';
  end if;
  if length(v_name) > 40 then
    raise exception 'keep the tab name under 40 characters' using errcode = '22023';
  end if;
  if p_table_id is null then
    if v_name is null then
      raise exception 'name the bar tab' using errcode = '22023';
    end if;
  else
    select d.id, d.name into v_table from public.dining_tables d where d.id = p_table_id and d.store_id = p_store_id and d.active for update;
    if not found then
      raise exception 'pick a table in this store' using errcode = '22023';
    end if;
    if exists (select 1 from public.tabs t where t.table_id = p_table_id and t.status = 'open') then
      raise exception '%', format('%s already has an open tab', v_table.name) using errcode = '22023';
    end if;
  end if;
  insert into public.tabs (store_id, table_id, name, guests, opened_by)
  values (p_store_id, p_table_id, v_name, p_guests, v_staff_id)
  returning id into v_tab_id;
  return v_tab_id;
end;
$$;

create function public.move_tab(p_tab_id uuid, p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_table record;
begin
  select d.id, d.name into v_table from public.dining_tables d where d.id = p_table_id and d.store_id = v_tab.store_id and d.active for update;
  if not found then
    raise exception 'pick a table in this store' using errcode = '22023';
  end if;
  if exists (select 1 from public.tabs t where t.table_id = p_table_id and t.status = 'open' and t.id <> p_tab_id) then
    raise exception '%', format('%s already has an open tab', v_table.name) using errcode = '22023';
  end if;
  update public.tabs set table_id = p_table_id, updated_at = now() where id = p_tab_id;
end;
$$;

create function public.update_tab(p_tab_id uuid, p_name text default null, p_guests integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_name text := nullif(trim(p_name), '');
begin
  if p_guests is not null and (p_guests < 1 or p_guests > 99) then
    raise exception 'guests must be between 1 and 99' using errcode = '22023';
  end if;
  if length(v_name) > 40 then
    raise exception 'keep the tab name under 40 characters' using errcode = '22023';
  end if;
  if v_tab.table_id is null and v_name is null then
    raise exception 'name the bar tab' using errcode = '22023';
  end if;
  update public.tabs set name = v_name, guests = p_guests, updated_at = now() where id = p_tab_id;
end;
$$;

create function public.cancel_tab(p_tab_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
begin
  if exists (
    select 1 from public.tab_items
    where tab_id = p_tab_id and ((sent_at is not null and voided_at is null) or paid_quantity > 0)
  ) then
    raise exception 'a tab with sent items can''t be cancelled' using errcode = '22023';
  end if;
  update public.tabs set status = 'cancelled', closed_at = now(), updated_at = now() where id = v_tab.id;
end;
$$;

create function public.add_tab_items(p_tab_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_item jsonb;
  v_variant record;
  v_quantity integer;
  v_option_ids uuid[];
  v_existing uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'add at least one item' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity < 1 or v_quantity > 999 then
      raise exception 'quantity must be between 1 and 999' using errcode = '22023';
    end if;
    select v.id, v.product_id,
      case when v.name = 'Default' then p.name else p.name || ' – ' || v.name end as label
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (v_item ->> 'variant_id')::uuid and v.active and p.active;
    if not found then
      raise exception 'item not available' using errcode = 'P0002';
    end if;
    v_option_ids := array(select (jsonb_array_elements_text(coalesce(v_item -> 'option_ids', '[]'::jsonb)))::uuid order by 1);
    perform private.check_options(v_variant.product_id, v_option_ids, v_variant.label);

    select ti.id into v_existing from public.tab_items ti
    where ti.tab_id = p_tab_id and ti.sent_at is null and ti.variant_id = v_variant.id
      and ti.option_ids = v_option_ids and ti.note is null
    limit 1;
    if found then
      update public.tab_items set quantity = least(999, quantity + v_quantity) where id = v_existing;
    else
      insert into public.tab_items (tab_id, variant_id, option_ids, name, quantity, added_by)
      values (p_tab_id, v_variant.id, v_option_ids, v_variant.label, v_quantity, private.staff_id());
    end if;
  end loop;
  update public.tabs set updated_at = now() where id = v_tab.id;
end;
$$;

create function public.change_tab_item(p_item_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.tab_items := private.lock_tab_item(p_item_id);
begin
  if v_item.sent_at is not null then
    raise exception '%', format('%s has already been sent; void it instead', v_item.name) using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 999 then
    raise exception 'quantity must be between 1 and 999' using errcode = '22023';
  end if;
  if p_quantity = 0 then
    delete from public.tab_items where id = p_item_id;
  else
    update public.tab_items set quantity = p_quantity where id = p_item_id;
  end if;
  update public.tabs set updated_at = now() where id = v_item.tab_id;
end;
$$;

create function public.note_tab_item(p_item_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.tab_items := private.lock_tab_item(p_item_id);
  v_note text := nullif(trim(p_note), '');
begin
  if v_item.sent_at is not null then
    raise exception '%', format('%s has already been sent; void it instead', v_item.name) using errcode = '22023';
  end if;
  if length(v_note) > 100 then
    raise exception 'keep the note under 100 characters' using errcode = '22023';
  end if;
  update public.tab_items set note = v_note where id = p_item_id;
  update public.tabs set updated_at = now() where id = v_item.tab_id;
end;
$$;

create function public.void_tab_item(p_item_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.tab_items := private.lock_tab_item(p_item_id);
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_item.voided_at is not null then
    raise exception '%', format('%s is already voided', v_item.name) using errcode = '22023';
  end if;
  if v_item.sent_at is null then
    raise exception '%', format('%s hasn''t been sent; remove it instead', v_item.name) using errcode = '22023';
  end if;
  if v_item.paid_quantity > 0 then
    raise exception '%', format('%s has been paid; refund it instead', v_item.name) using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception '%', format('give a reason for voiding %s', v_item.name) using errcode = '22023';
  end if;
  if length(v_reason) > 200 then
    raise exception 'keep the reason under 200 characters' using errcode = '22023';
  end if;
  update public.tab_items set voided_at = now(), voided_by = private.staff_id(), void_reason = v_reason where id = p_item_id;
  update public.kitchen_ticket_items set voided = true where tab_item_id = p_item_id;
  update public.kitchen_tickets k set updated_at = now()
  where exists (select 1 from public.kitchen_ticket_items i where i.ticket_id = k.id and i.tab_item_id = p_item_id);
  update public.tabs set updated_at = now() where id = v_item.tab_id;
  perform private.settle_tab(v_item.tab_id);
end;
$$;

create function public.send_tab(p_tab_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_ticket_id uuid;
begin
  v_ticket_id := private.send_lines(v_tab, null);
  update public.tabs set updated_at = now() where id = v_tab.id;
  return v_ticket_id;
end;
$$;

create function public.print_bill(p_tab_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
begin
  update public.tabs set bill_printed_at = now(), updated_at = now() where id = v_tab.id;
end;
$$;

drop function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text);

create function public.create_order(
  p_session_id uuid,
  p_lines jsonb,
  p_order_discount jsonb default null,
  p_approval_id uuid default null,
  p_customer_id uuid default null,
  p_payments jsonb default '[]'::jsonb,
  p_tip bigint default 0,
  p_order_name text default null,
  p_kitchen boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_role public.staff_role;
  v_store_id uuid;
  v_register_id uuid;
  v_closed_at timestamptz;
  v_include_tax boolean;
  v_cap integer;
  v_line jsonb;
  v_quantity integer;
  v_variant record;
  v_option_ids uuid[];
  v_delta bigint;
  v_unit bigint;
  v_priced jsonb := '[]'::jsonb;
  v_variant_ids uuid[] := '{}';
  v_product_ids uuid[] := '{}';
  v_option_sets jsonb := '[]'::jsonb;
  v_names text[] := '{}';
  v_skus text[] := '{}';
  v_prices bigint[] := '{}';
  v_quantities integer[] := '{}';
  v_rates integer[] := '{}';
  v_tracks boolean[] := '{}';
  v_entered_bps integer[] := '{}';
  v_entered_amounts bigint[] := '{}';
  v_cart jsonb;
  v_subtotal bigint;
  v_discount_total bigint;
  v_total bigint;
  v_share integer;
  v_discount_by uuid;
  v_approval_id uuid;
  v_approver uuid;
  v_payment jsonb;
  v_method public.payment_method;
  v_amount bigint;
  v_tendered bigint;
  v_reference text;
  v_paid bigint := 0;
  v_change bigint := 0;
  v_amounts bigint[] := '{}';
  v_tips bigint[];
  v_tip bigint := coalesce(p_tip, 0);
  v_order_name text := nullif(trim(p_order_name), '');
  v_receipt integer;
  v_order_id uuid;
  v_item_id uuid;
  v_ticket_id uuid;
  i integer;
  n integer;
begin
  select s.id, s.role into v_staff_id, v_role from public.staff s where s.user_id = (select auth.uid()) and s.active;
  if v_staff_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select r.store_id, r.id, rs.closed_at into v_store_id, v_register_id, v_closed_at
  from public.register_sessions rs
  join public.registers r on r.id = rs.register_id
  where rs.id = p_session_id
  for update of rs;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.can_access_store(v_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_closed_at is not null then
    raise exception 'till is closed' using errcode = 'P0001';
  end if;
  if v_tip < 0 or v_tip > 1000000000 then
    raise exception 'the tip must be 0 or more' using errcode = '22023';
  end if;
  if length(v_order_name) > 40 then
    raise exception 'keep the order name under 40 characters' using errcode = '22023';
  end if;

  select s.prices_include_tax, s.max_cashier_discount_bps into v_include_tax, v_cap from public.stores s where s.id = v_store_id;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'add at least one item' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity is null or v_quantity < 1 or v_quantity > 9999 then
      raise exception 'quantity must be between 1 and 9999' using errcode = '22023';
    end if;

    select v.id, v.price, v.sku, v.product_id,
      case when v.name = 'Default' then p.name else p.name || ' – ' || v.name end as label,
      coalesce(tr.rate_bps, 0) as rate_bps,
      coalesce(sl.track, false) as track
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.tax_rates tr on tr.store_id = v_store_id and tr.tax_class_id = p.tax_class_id
    left join public.stock_levels sl on sl.store_id = v_store_id and sl.variant_id = v.id
    where v.id = (v_line ->> 'variant_id')::uuid and v.active and p.active;
    if not found then
      raise exception 'item not available' using errcode = 'P0002';
    end if;

    v_option_ids := array(select (jsonb_array_elements_text(coalesce(v_line -> 'option_ids', '[]'::jsonb)))::uuid);
    v_delta := private.check_options(v_variant.product_id, v_option_ids, v_variant.label);
    v_unit := v_variant.price + v_delta;
    if v_unit < 0 then
      raise exception '%', format('modifiers can''t make %s cost less than 0', v_variant.label) using errcode = '22023';
    end if;

    v_variant_ids := v_variant_ids || v_variant.id;
    v_product_ids := v_product_ids || v_variant.product_id;
    v_option_sets := v_option_sets || jsonb_build_array(to_jsonb(v_option_ids));
    v_names := v_names || v_variant.label;
    v_skus := v_skus || v_variant.sku;
    v_prices := v_prices || v_unit;
    v_quantities := v_quantities || v_quantity;
    v_rates := v_rates || v_variant.rate_bps;
    v_tracks := v_tracks || v_variant.track;
    v_entered_bps := v_entered_bps || (v_line ->> 'discount_bps')::integer;
    v_entered_amounts := v_entered_amounts || (v_line ->> 'discount_amount')::bigint;
    v_priced := v_priced || jsonb_build_array(jsonb_build_object(
      'price', v_unit,
      'quantity', v_quantity,
      'rate_bps', v_variant.rate_bps,
      'discount_bps', v_line -> 'discount_bps',
      'discount_amount', v_line -> 'discount_amount'
    ));
  end loop;

  v_cart := private.price_cart(v_include_tax, v_priced, case when jsonb_typeof(p_order_discount) = 'object' then p_order_discount end);
  v_subtotal := (v_cart ->> 'subtotal')::bigint;
  v_discount_total := (v_cart ->> 'discount_total')::bigint;
  v_total := (v_cart ->> 'total')::bigint;

  if v_discount_total > 0 then
    v_discount_by := v_staff_id;
    v_share := ceil(v_discount_total::numeric * 10000 / v_subtotal)::integer;
    if v_role = 'cashier' and v_share > v_cap then
      select a.id, a.approved_by into v_approval_id, v_approver
      from public.discount_approvals a
      where a.id = p_approval_id
        and a.store_id = v_store_id
        and a.used_at is null
        and a.expires_at > now()
        and a.requested_by = v_staff_id
        and a.max_bps >= v_share
        and a.max_discount >= v_discount_total
      for update;
      if not found then
        raise exception 'discount needs approval' using errcode = 'P0001';
      end if;
      update public.discount_approvals set used_at = now() where id = v_approval_id;
      v_discount_by := v_approver;
    end if;
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 20 then
    raise exception 'add a payment' using errcode = '22023';
  end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_method := (v_payment ->> 'method')::public.payment_method;
    v_amount := (v_payment ->> 'amount')::bigint;
    v_tendered := (v_payment ->> 'tendered')::bigint;
    v_reference := nullif(trim(v_payment ->> 'reference'), '');
    if v_amount is null or v_amount <= 0 then
      raise exception 'each payment needs an amount above 0' using errcode = '22023';
    end if;
    if v_tendered is not null then
      if v_method <> 'cash' then
        raise exception 'only cash can have an amount received' using errcode = '22023';
      end if;
      if v_tendered < v_amount then
        raise exception 'cash received is less than the amount' using errcode = '22023';
      end if;
      v_change := v_change + v_tendered - v_amount;
    end if;
    if length(v_reference) > 100 then
      raise exception 'keep the payment reference under 100 characters' using errcode = '22023';
    end if;
    v_paid := v_paid + v_amount;
    v_amounts := v_amounts || v_amount;
  end loop;
  if v_paid <> v_total + v_tip then
    if v_tip = 0 then
      raise exception 'payments must add up to the total' using errcode = '22023';
    end if;
    raise exception 'payments must add up to the total plus tip' using errcode = '22023';
  end if;
  v_tips := private.allocate(v_tip, v_amounts);

  if p_customer_id is not null and not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  update public.registers set next_receipt_number = next_receipt_number + 1
  where id = v_register_id
  returning next_receipt_number - 1 into v_receipt;

  insert into public.orders (
    store_id, register_id, session_id, staff_id, customer_id, receipt_number, status,
    subtotal, discount_total, tax_total, total, discount_approval_id, discount_by, tip, order_name
  ) values (
    v_store_id, v_register_id, p_session_id, v_staff_id, p_customer_id, v_receipt, 'completed',
    v_subtotal, v_discount_total, (v_cart ->> 'tax_total')::bigint, v_total, v_approval_id, v_discount_by, v_tip, v_order_name
  )
  returning id into v_order_id;

  for i in 1..array_length(v_variant_ids, 1) loop
    insert into public.order_items (
      order_id, line_number, variant_id, name, sku, unit_price, quantity, discount,
      line_discount_bps, line_discount_amount, tax_rate_bps, tax, line_total
    ) values (
      v_order_id, i, v_variant_ids[i], v_names[i], v_skus[i], v_prices[i], v_quantities[i],
      (v_cart -> 'lines' -> (i - 1) ->> 'discount')::bigint,
      v_entered_bps[i], v_entered_amounts[i], v_rates[i],
      (v_cart -> 'lines' -> (i - 1) ->> 'tax')::bigint,
      (v_cart -> 'lines' -> (i - 1) ->> 'line_total')::bigint
    )
    returning id into v_item_id;

    insert into public.order_item_modifiers (order_item_id, option_id, group_name, option_name, price_delta, sort_order)
    select v_item_id, mo.id, mg.name, mo.name, mo.price_delta,
      (row_number() over (order by pmg.sort_order, mg.name, mo.sort_order, mo.name))::integer
    from jsonb_array_elements_text(v_option_sets -> (i - 1)) as chosen(id)
    join public.modifier_options mo on mo.id = chosen.id::uuid
    join public.modifier_groups mg on mg.id = mo.group_id
    left join public.product_modifier_groups pmg on pmg.group_id = mg.id and pmg.product_id = v_product_ids[i];
  end loop;

  n := 0;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    n := n + 1;
    v_amount := (v_payment ->> 'amount')::bigint;
    v_tendered := (v_payment ->> 'tendered')::bigint;
    insert into public.payments (order_id, method, amount, tendered, change, reference, tip)
    values (
      v_order_id,
      (v_payment ->> 'method')::public.payment_method,
      v_amount,
      v_tendered,
      case when v_tendered is not null then v_tendered - v_amount end,
      nullif(trim(v_payment ->> 'reference'), ''),
      v_tips[n]
    );
  end loop;

  perform 1 from public.stock_levels
  where store_id = v_store_id and variant_id = any(v_variant_ids)
  order by variant_id
  for update;

  for i in 1..array_length(v_variant_ids, 1) loop
    if v_tracks[i] then
      insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
      values (v_store_id, v_variant_ids[i], -v_quantities[i], 'sold', v_staff_id, 'Receipt #' || v_receipt);
    end if;
  end loop;

  if coalesce(p_kitchen, true) and exists (
    select 1 from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    where oi.order_id = v_order_id and c.kitchen
  ) then
    v_ticket_id := private.new_ticket(v_store_id, null, v_order_id, coalesce(v_order_name, '#' || v_receipt));
    insert into public.kitchen_ticket_items (ticket_id, quantity, name, choices, sort_order)
    select v_ticket_id, oi.quantity, oi.name,
      (select nullif(string_agg(m.option_name, ' · ' order by m.sort_order), '') from public.order_item_modifiers m where m.order_item_id = oi.id),
      oi.line_number
    from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    join public.products p on p.id = v.product_id
    join public.categories c on c.id = p.category_id
    where oi.order_id = v_order_id and c.kitchen;
  end if;

  return jsonb_build_object('order_id', v_order_id, 'receipt_number', v_receipt, 'total', v_total, 'change', v_change);
end;
$$;

revoke execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text, boolean) from public, anon;
grant execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text, boolean) to authenticated;

create function public.pay_tab(
  p_tab_id uuid,
  p_session_id uuid,
  p_parts jsonb,
  p_order_discount jsonb default null,
  p_approval_id uuid default null,
  p_customer_id uuid default null,
  p_payments jsonb default '[]'::jsonb,
  p_tip bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs := private.lock_open_tab(p_tab_id);
  v_part jsonb;
  v_item public.tab_items;
  v_quantity integer;
  v_left integer;
  v_ids uuid[] := '{}';
  v_lines jsonb := '[]'::jsonb;
  v_result jsonb;
  v_done boolean;
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'pick at least one item to pay' using errcode = '22023';
  end if;
  for v_part in select value from jsonb_array_elements(p_parts) loop
    select * into v_item from public.tab_items where id = (v_part ->> 'tab_item_id')::uuid and tab_id = p_tab_id for update;
    if not found or (v_part ->> 'tab_item_id')::uuid = any(v_ids) then
      raise exception 'pick each item once' using errcode = '22023';
    end if;
    v_quantity := (v_part ->> 'quantity')::integer;
    v_left := case when v_item.voided_at is null then v_item.quantity - v_item.paid_quantity else 0 end;
    if v_quantity is null or v_quantity < 1 then
      raise exception 'pick at least one item to pay' using errcode = '22023';
    end if;
    if v_quantity > v_left then
      raise exception '%', format('only %s of %s are left to pay', v_left, v_item.name) using errcode = '22023';
    end if;
    if v_item.variant_id is null then
      raise exception 'item not available' using errcode = 'P0002';
    end if;
    v_ids := v_ids || v_item.id;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'variant_id', v_item.variant_id,
      'quantity', v_quantity,
      'option_ids', to_jsonb(v_item.option_ids),
      'discount_bps', v_part -> 'discount_bps',
      'discount_amount', v_part -> 'discount_amount'
    ));
  end loop;

  perform private.send_lines(v_tab, v_ids);

  v_result := public.create_order(p_session_id, v_lines, p_order_discount, p_approval_id, p_customer_id, p_payments, p_tip, left(private.tab_label(v_tab), 40), false);

  for v_part in select value from jsonb_array_elements(p_parts) loop
    update public.tab_items set paid_quantity = paid_quantity + (v_part ->> 'quantity')::integer
    where id = (v_part ->> 'tab_item_id')::uuid;
  end loop;
  update public.orders set tab_id = p_tab_id where id = (v_result ->> 'order_id')::uuid;
  update public.order_items set tab_item_id = v_ids[line_number]
  where order_id = (v_result ->> 'order_id')::uuid;
  update public.tabs set updated_at = now() where id = p_tab_id;
  v_done := private.settle_tab(p_tab_id);
  return v_result || jsonb_build_object('tab_paid', v_done);
end;
$$;

create function private.reopen_voided_tab_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tab public.tabs;
begin
  select * into v_tab from public.tabs where id = new.tab_id for update;
  update public.tab_items ti set paid_quantity = greatest(0, ti.paid_quantity - oi.quantity)
  from public.order_items oi
  where oi.order_id = new.id and oi.tab_item_id = ti.id;
  if v_tab.status = 'paid' then
    if v_tab.table_id is not null and exists (select 1 from public.tabs t where t.table_id = v_tab.table_id and t.status = 'open') then
      update public.tabs set status = 'open', closed_at = null, table_id = null, name = left(coalesce(name, private.tab_label(v_tab)), 40), updated_at = now() where id = v_tab.id;
    else
      update public.tabs set status = 'open', closed_at = null, updated_at = now() where id = v_tab.id;
    end if;
  else
    update public.tabs set updated_at = now() where id = v_tab.id;
  end if;
  return new;
end;
$$;
revoke execute on function private.reopen_voided_tab_sale() from public, anon, authenticated;
create trigger orders_reopen_voided_tab_sale
  after update of status on public.orders
  for each row
  when (old.status <> 'voided' and new.status = 'voided' and new.tab_id is not null)
  execute function private.reopen_voided_tab_sale();

create function public.finish_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.kitchen_tickets;
begin
  select * into v_ticket from public.kitchen_tickets where id = p_ticket_id for update;
  if not found or private.staff_id() is null or not private.can_access_store(v_ticket.store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_ticket.done_at is not null then
    raise exception 'this ticket is already done' using errcode = '22023';
  end if;
  update public.kitchen_tickets set done_at = now(), done_by = private.staff_id(), updated_at = now() where id = p_ticket_id;
end;
$$;

create function public.recall_ticket(p_store_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket_id uuid;
begin
  if private.staff_id() is null or not private.can_access_store(p_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into v_ticket_id from public.kitchen_tickets
  where store_id = p_store_id and done_at is not null and done_at > now() - interval '12 hours'
  order by done_at desc
  limit 1
  for update;
  if v_ticket_id is null then
    return null;
  end if;
  update public.kitchen_tickets set done_at = null, done_by = null, updated_at = now() where id = v_ticket_id;
  return v_ticket_id;
end;
$$;

revoke execute on function public.open_tab(uuid, uuid, text, integer), public.move_tab(uuid, uuid), public.update_tab(uuid, text, integer),
  public.cancel_tab(uuid), public.add_tab_items(uuid, jsonb), public.change_tab_item(uuid, integer), public.note_tab_item(uuid, text),
  public.void_tab_item(uuid, text), public.send_tab(uuid), public.print_bill(uuid),
  public.pay_tab(uuid, uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint), public.finish_ticket(uuid), public.recall_ticket(uuid)
  from public, anon;
grant execute on function public.open_tab(uuid, uuid, text, integer), public.move_tab(uuid, uuid), public.update_tab(uuid, text, integer),
  public.cancel_tab(uuid), public.add_tab_items(uuid, jsonb), public.change_tab_item(uuid, integer), public.note_tab_item(uuid, text),
  public.void_tab_item(uuid, text), public.send_tab(uuid), public.print_bill(uuid),
  public.pay_tab(uuid, uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint), public.finish_ticket(uuid), public.recall_ticket(uuid)
  to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.tabs, public.kitchen_tickets;
end;
$$;
