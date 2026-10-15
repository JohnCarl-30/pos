alter table public.categories add column kitchen boolean not null default false;

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  min_choices integer not null default 0 check (min_choices >= 0),
  max_choices integer not null default 1 check (max_choices >= 1),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (max_choices >= min_choices)
);
create unique index modifier_groups_active_name_idx on public.modifier_groups (lower(name)) where active;

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  price_delta bigint not null default 0 check (price_delta between -1000000 and 1000000),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);
create index modifier_options_group_id_idx on public.modifier_options (group_id);

create table public.product_modifier_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete restrict,
  sort_order integer not null default 0,
  primary key (product_id, group_id)
);
create index product_modifier_groups_group_id_idx on public.product_modifier_groups (group_id);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  option_id uuid references public.modifier_options (id) on delete set null,
  group_name text not null,
  option_name text not null,
  price_delta bigint not null,
  sort_order integer not null default 0
);
create index order_item_modifiers_order_item_id_idx on public.order_item_modifiers (order_item_id);
create index order_item_modifiers_option_id_idx on public.order_item_modifiers (option_id);

alter table public.orders
  add column tip bigint not null default 0 check (tip >= 0),
  add column order_name text check (length(order_name) between 1 and 40);
alter table public.payments add column tip bigint not null default 0 check (tip >= 0 and tip <= amount);

alter table public.modifier_groups enable row level security;
alter table public.modifier_options enable row level security;
alter table public.product_modifier_groups enable row level security;
alter table public.order_item_modifiers enable row level security;
revoke all on public.modifier_groups, public.modifier_options, public.product_modifier_groups, public.order_item_modifiers from anon;
revoke insert, update, delete, truncate, references, trigger on public.order_item_modifiers from authenticated;

create policy "staff read modifier groups" on public.modifier_groups
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage modifier groups" on public.modifier_groups
  for all to authenticated
  using ((select private.staff_role()) in ('owner', 'manager'))
  with check ((select private.staff_role()) in ('owner', 'manager'));
create policy "staff read modifier options" on public.modifier_options
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage modifier options" on public.modifier_options
  for all to authenticated
  using ((select private.staff_role()) in ('owner', 'manager'))
  with check ((select private.staff_role()) in ('owner', 'manager'));
create policy "staff read product modifier groups" on public.product_modifier_groups
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage product modifier groups" on public.product_modifier_groups
  for all to authenticated
  using ((select private.staff_role()) in ('owner', 'manager'))
  with check ((select private.staff_role()) in ('owner', 'manager'));
create policy "staff read order item modifiers" on public.order_item_modifiers
  for select to authenticated using (
    exists (select 1 from public.order_items oi where oi.id = order_item_id and private.can_access_order(oi.order_id))
  );

create function private.allocate(p_amount bigint, p_bases bigint[])
returns bigint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer := coalesce(array_length(p_bases, 1), 0);
  v_total numeric := 0;
  v_shares bigint[] := '{}';
  v_rems numeric[] := '{}';
  v_left bigint;
  v_index integer;
  i integer;
begin
  if v_count = 0 then
    return '{}';
  end if;
  for i in 1..v_count loop
    v_total := v_total + p_bases[i];
  end loop;
  if p_amount = 0 or v_total = 0 then
    return array_fill(0::bigint, array[v_count]);
  end if;
  for i in 1..v_count loop
    v_shares := v_shares || floor(p_amount::numeric * p_bases[i] / v_total)::bigint;
    v_rems := v_rems || (p_amount::numeric * p_bases[i] - floor(p_amount::numeric * p_bases[i] / v_total) * v_total);
  end loop;
  v_left := p_amount - (select sum(s) from unnest(v_shares) s);
  for v_index in select o.i from unnest(v_rems) with ordinality as o(r, i) order by o.r desc, o.i loop
    exit when v_left = 0;
    v_shares[v_index] := v_shares[v_index] + 1;
    v_left := v_left - 1;
  end loop;
  return v_shares;
end;
$$;
revoke execute on function private.allocate(bigint, bigint[]) from public, anon, authenticated;

drop function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb);

create function public.create_order(
  p_session_id uuid,
  p_lines jsonb,
  p_order_discount jsonb default null,
  p_approval_id uuid default null,
  p_customer_id uuid default null,
  p_payments jsonb default '[]'::jsonb,
  p_tip bigint default 0,
  p_order_name text default null
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
  v_group record;
  v_option_ids uuid[];
  v_bad text;
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
    if cardinality(v_option_ids) > 50 or cardinality(v_option_ids) <> (select count(distinct x) from unnest(v_option_ids) x) then
      raise exception 'list each choice once' using errcode = '22023';
    end if;

    select coalesce(mo.name, 'A choice') into v_bad
    from unnest(v_option_ids) as chosen(id)
    left join public.modifier_options mo on mo.id = chosen.id
    left join public.modifier_groups mg on mg.id = mo.group_id
    left join public.product_modifier_groups pmg on pmg.group_id = mg.id and pmg.product_id = v_variant.product_id
    where mo.id is null or not mo.active or not mg.active or pmg.product_id is null
    limit 1;
    if found then
      raise exception '%', format('%s isn''t available for %s any more', v_bad, v_variant.label) using errcode = '22023';
    end if;

    for v_group in
      select mg.name, mg.min_choices, mg.max_choices,
        (select count(*) from unnest(v_option_ids) c(id) join public.modifier_options mo on mo.id = c.id where mo.group_id = mg.id)::integer as chosen
      from public.product_modifier_groups pmg
      join public.modifier_groups mg on mg.id = pmg.group_id
      where pmg.product_id = v_variant.product_id and mg.active
      order by pmg.sort_order, mg.name
    loop
      if v_group.chosen < v_group.min_choices then
        raise exception '%', format('pick %s for %s', v_group.name, v_variant.label) using errcode = '22023';
      end if;
      if v_group.chosen > v_group.max_choices then
        raise exception '%', format('pick up to %s %s for %s', v_group.max_choices, v_group.name, v_variant.label) using errcode = '22023';
      end if;
    end loop;

    select coalesce(sum(mo.price_delta), 0) into v_delta from public.modifier_options mo where mo.id = any(v_option_ids);
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

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 10 then
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

  return jsonb_build_object('order_id', v_order_id, 'receipt_number', v_receipt, 'total', v_total, 'change', v_change);
end;
$$;

revoke execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb, bigint, text) to authenticated;

create function public.save_modifier_group(p_group jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_group ->> 'id', '')::uuid;
  v_option jsonb;
  v_option_id uuid;
  v_keep uuid[] := '{}';
  v_position integer := 0;
  v_active integer;
begin
  if jsonb_typeof(p_group -> 'options') <> 'array' or jsonb_array_length(p_group -> 'options') = 0 then
    raise exception 'add at least one option' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.modifier_groups (name, min_choices, max_choices, active, sort_order)
    values (
      trim(p_group ->> 'name'),
      (p_group ->> 'min_choices')::integer,
      (p_group ->> 'max_choices')::integer,
      coalesce((p_group ->> 'active')::boolean, true),
      coalesce((select max(sort_order) + 1 from public.modifier_groups), 0)
    )
    returning id into v_id;
  else
    update public.modifier_groups set
      name = trim(p_group ->> 'name'),
      min_choices = (p_group ->> 'min_choices')::integer,
      max_choices = (p_group ->> 'max_choices')::integer,
      active = coalesce((p_group ->> 'active')::boolean, true)
    where id = v_id;
    if not found then
      raise exception 'modifier group not found' using errcode = 'P0002';
    end if;
  end if;

  for v_option in select value from jsonb_array_elements(p_group -> 'options') loop
    v_option_id := nullif(v_option ->> 'id', '')::uuid;
    if v_option_id is not null then
      v_keep := v_keep || v_option_id;
    end if;
  end loop;
  delete from public.modifier_options where group_id = v_id and not (id = any(v_keep));

  for v_option in select value from jsonb_array_elements(p_group -> 'options') loop
    v_option_id := nullif(v_option ->> 'id', '')::uuid;
    if v_option_id is null then
      insert into public.modifier_options (group_id, name, price_delta, active, sort_order)
      values (v_id, trim(v_option ->> 'name'), (v_option ->> 'price_delta')::bigint, coalesce((v_option ->> 'active')::boolean, true), v_position);
    else
      update public.modifier_options set
        name = trim(v_option ->> 'name'),
        price_delta = (v_option ->> 'price_delta')::bigint,
        active = coalesce((v_option ->> 'active')::boolean, true),
        sort_order = v_position
      where id = v_option_id and group_id = v_id;
      if not found then
        raise exception 'option not found' using errcode = 'P0002';
      end if;
    end if;
    v_position := v_position + 1;
  end loop;

  select count(*) into v_active from public.modifier_options where group_id = v_id and active;
  if (select min_choices from public.modifier_groups where id = v_id) > v_active then
    raise exception 'min choices can''t be more than the active options' using errcode = '22023';
  end if;
  return v_id;
end;
$$;
revoke execute on function public.save_modifier_group(jsonb) from public, anon;
grant execute on function public.save_modifier_group(jsonb) to authenticated;

create or replace function public.save_product(p_store_id uuid, p_product jsonb, p_variants jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid := nullif(p_product->>'id', '')::uuid;
  v_variant jsonb;
  v_variant_id uuid;
begin
  if v_product_id is null then
    insert into public.products (name, category_id, tax_class_id, description, active)
    values (
      p_product->>'name',
      nullif(p_product->>'category_id', '')::uuid,
      (p_product->>'tax_class_id')::uuid,
      nullif(p_product->>'description', ''),
      coalesce((p_product->>'active')::boolean, true)
    )
    returning id into v_product_id;
  else
    update public.products set
      name = p_product->>'name',
      category_id = nullif(p_product->>'category_id', '')::uuid,
      tax_class_id = (p_product->>'tax_class_id')::uuid,
      description = nullif(p_product->>'description', ''),
      active = coalesce((p_product->>'active')::boolean, true)
    where id = v_product_id;
    if not found then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
  end if;

  for v_variant in select * from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) loop
    v_variant_id := nullif(v_variant->>'id', '')::uuid;
    if v_variant_id is null then
      insert into public.product_variants (product_id, name, sku, barcode, price, cost, active, sort_order)
      values (
        v_product_id,
        v_variant->>'name',
        v_variant->>'sku',
        nullif(v_variant->>'barcode', ''),
        (v_variant->>'price')::bigint,
        nullif(v_variant->>'cost', '')::bigint,
        coalesce((v_variant->>'active')::boolean, true),
        coalesce((v_variant->>'sort_order')::integer, 0)
      )
      returning id into v_variant_id;
    else
      update public.product_variants set
        name = v_variant->>'name',
        sku = v_variant->>'sku',
        barcode = nullif(v_variant->>'barcode', ''),
        price = (v_variant->>'price')::bigint,
        cost = nullif(v_variant->>'cost', '')::bigint,
        active = coalesce((v_variant->>'active')::boolean, true),
        sort_order = coalesce((v_variant->>'sort_order')::integer, 0)
      where id = v_variant_id and product_id = v_product_id;
      if not found then
        raise exception 'variant not found' using errcode = 'P0002';
      end if;
    end if;

    if v_variant ? 'track' then
      update public.stock_levels set track = (v_variant->>'track')::boolean
      where variant_id = v_variant_id and store_id = p_store_id;
    end if;
  end loop;

  if p_product ? 'modifier_group_ids' then
    delete from public.product_modifier_groups where product_id = v_product_id;
    insert into public.product_modifier_groups (product_id, group_id, sort_order)
    select v_product_id, g.id::uuid, (g.position - 1)::integer
    from jsonb_array_elements_text(p_product -> 'modifier_group_ids') with ordinality as g(id, position);
  end if;

  return v_product_id;
end;
$$;

drop function public.report_cashups(uuid, timestamptz, timestamptz);
drop function public.report_staff(uuid, timestamptz, timestamptz);
drop function private.session_cash(uuid);

create function private.session_cash(p_session_id uuid)
returns table (opening_cash bigint, cash_sales bigint, cash_tips bigint, cash_refunds bigint, expected_cash bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select rs.opening_cash, s.sales, s.tips, f.cash, rs.opening_cash + s.sales + s.tips - f.cash
  from public.register_sessions rs
  cross join lateral (
    select coalesce(sum(p.amount - p.tip), 0)::bigint as sales, coalesce(sum(p.tip), 0)::bigint as tips
    from public.payments p
    join public.orders o on o.id = p.order_id
    where o.session_id = rs.id and o.status <> 'voided' and p.method = 'cash'
  ) s
  cross join lateral (
    select coalesce(sum(rp.amount), 0)::bigint as cash
    from public.refund_payments rp
    join public.refunds r on r.id = rp.refund_id
    where r.session_id = rs.id and rp.method = 'cash'
  ) f
  where rs.id = p_session_id
$$;
revoke execute on function private.session_cash(uuid) from public, anon;
grant execute on function private.session_cash(uuid) to authenticated;

create or replace function public.close_register(p_session_id uuid, p_counted_cash bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_store_id uuid;
  v_closed_at timestamptz;
  v_cash record;
  v_voided integer;
begin
  select s.id into v_staff_id from public.staff s where s.user_id = (select auth.uid()) and s.active;
  if v_staff_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'counted cash must be zero or more' using errcode = '22023';
  end if;
  if length(p_note) > 300 then
    raise exception 'keep the note under 300 characters' using errcode = '22023';
  end if;

  select r.store_id, rs.closed_at into v_store_id, v_closed_at
  from public.register_sessions rs
  join public.registers r on r.id = rs.register_id
  where rs.id = p_session_id
  for update of rs;
  if not found then
    raise exception 'till not found' using errcode = 'P0002';
  end if;
  if not private.can_access_store(v_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_closed_at is not null then
    raise exception 'till is closed' using errcode = 'P0001';
  end if;

  select * into v_cash from private.session_cash(p_session_id);
  select count(*) into v_voided from public.orders o where o.session_id = p_session_id and o.status = 'voided';

  update public.register_sessions set
    closed_by = v_staff_id,
    closed_at = now(),
    counted_cash = p_counted_cash,
    close_note = nullif(trim(p_note), '')
  where id = p_session_id;

  return jsonb_build_object(
    'opening_cash', v_cash.opening_cash,
    'cash_sales', v_cash.cash_sales,
    'cash_tips', v_cash.cash_tips,
    'cash_refunds', v_cash.cash_refunds,
    'expected_cash', v_cash.expected_cash,
    'counted_cash', p_counted_cash,
    'difference', p_counted_cash - v_cash.expected_cash,
    'voided_count', v_voided
  );
end;
$$;

create or replace function public.report_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_sales record;
  v_refunds record;
  v_voids record;
  v_methods jsonb;
begin
  perform private.report_guard(p_store_id, p_from, p_to);

  select count(*)::integer as n,
    coalesce(sum(o.subtotal), 0)::bigint as gross,
    coalesce(sum(o.discount_total), 0)::bigint as discounts,
    coalesce(sum(o.tax_total), 0)::bigint as tax,
    coalesce(sum(o.total), 0)::bigint as total,
    coalesce(sum(o.tip), 0)::bigint as tips
  into v_sales
  from public.orders o
  where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to and o.status <> 'voided';

  select count(*)::integer as n, coalesce(sum(r.total), 0)::bigint as total, coalesce(sum(r.tax_total), 0)::bigint as tax
  into v_refunds
  from public.refunds r
  where r.store_id = p_store_id and r.created_at >= p_from and r.created_at < p_to;

  select count(*)::integer as n, coalesce(sum(o.total), 0)::bigint as total
  into v_voids
  from public.orders o
  where o.store_id = p_store_id and o.voided_at >= p_from and o.voided_at < p_to;

  select jsonb_build_object(
    'cash', coalesce(sum(m.amount) filter (where m.method = 'cash'), 0)::bigint,
    'card', coalesce(sum(m.amount) filter (where m.method = 'card'), 0)::bigint,
    'other', coalesce(sum(m.amount) filter (where m.method = 'other'), 0)::bigint
  )
  into v_methods
  from (
    select p.method, p.amount - p.tip as amount
    from public.payments p
    join public.orders o on o.id = p.order_id
    where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to and o.status <> 'voided'
    union all
    select rp.method, -rp.amount
    from public.refund_payments rp
    join public.refunds r on r.id = rp.refund_id
    where r.store_id = p_store_id and r.created_at >= p_from and r.created_at < p_to
  ) m;

  return jsonb_build_object(
    'sales_count', v_sales.n,
    'gross', v_sales.gross,
    'discounts', v_sales.discounts,
    'tax', v_sales.tax,
    'sales_total', v_sales.total,
    'tips', v_sales.tips,
    'refund_count', v_refunds.n,
    'refunds_total', v_refunds.total,
    'refund_tax', v_refunds.tax,
    'net_sales', v_sales.total - v_refunds.total,
    'net_tax', v_sales.tax - v_refunds.tax,
    'average_sale', case when v_sales.n = 0 then 0 else private.div_half_even(v_sales.total, v_sales.n) end,
    'void_count', v_voids.n,
    'void_total', v_voids.total,
    'methods', v_methods
  );
end;
$$;

create function public.report_staff(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, name text, sales_count integer, sales_total bigint, refund_count integer, refunds_total bigint, void_count integer, void_total bigint, cash_void_count integer, discounts bigint, tips bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.report_guard(p_store_id, p_from, p_to);

  return query
  with sales_by as (
    select o.staff_id as sid, count(*)::integer as n, sum(o.total)::bigint as amount, sum(o.discount_total)::bigint as discount_sum, sum(o.tip)::bigint as tip_sum
    from public.orders o
    where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to and o.status <> 'voided'
    group by o.staff_id
  ),
  refunds_by as (
    select r.staff_id as sid, count(*)::integer as n, sum(r.total)::bigint as amount
    from public.refunds r
    where r.store_id = p_store_id and r.created_at >= p_from and r.created_at < p_to
    group by r.staff_id
  ),
  voids_by as (
    select o.staff_id as sid, count(*)::integer as n, sum(o.total)::bigint as amount,
      (count(*) filter (where exists (select 1 from public.payments p where p.order_id = o.id and p.method = 'cash')))::integer as cash
    from public.orders o
    where o.store_id = p_store_id and o.voided_at >= p_from and o.voided_at < p_to
    group by o.staff_id
  ),
  ids as (
    select sid from sales_by union select sid from refunds_by union select sid from voids_by
  )
  select ids.sid, coalesce(st.name, 'Former staff'),
    coalesce(s.n, 0), coalesce(s.amount, 0)::bigint,
    coalesce(r.n, 0), coalesce(r.amount, 0)::bigint,
    coalesce(v.n, 0), coalesce(v.amount, 0)::bigint, coalesce(v.cash, 0),
    coalesce(s.discount_sum, 0)::bigint,
    coalesce(s.tip_sum, 0)::bigint
  from ids
  left join sales_by s on s.sid = ids.sid
  left join refunds_by r on r.sid = ids.sid
  left join voids_by v on v.sid = ids.sid
  left join public.staff st on st.id = ids.sid
  order by coalesce(s.amount, 0) desc, 2;
end;
$$;

create function public.report_cashups(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, register text, opened_at timestamptz, closed_at timestamptz, opened_by text, closed_by text, opening_cash bigint, cash_sales bigint, cash_tips bigint, cash_refunds bigint, expected_cash bigint, counted_cash bigint, difference bigint, close_note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.report_guard(p_store_id, p_from, p_to);

  return query
  select rs.id, rg.name, rs.opened_at, rs.closed_at, op.name, cl.name,
    c.opening_cash, c.cash_sales, c.cash_tips, c.cash_refunds, c.expected_cash,
    rs.counted_cash, (rs.counted_cash - c.expected_cash)::bigint, rs.close_note
  from public.register_sessions rs
  join public.registers rg on rg.id = rs.register_id
  cross join lateral private.session_cash(rs.id) c
  left join public.staff op on op.id = rs.opened_by
  left join public.staff cl on cl.id = rs.closed_by
  where rg.store_id = p_store_id and rs.closed_at >= p_from and rs.closed_at < p_to
  order by rs.closed_at desc, rs.id;
end;
$$;

revoke execute on function public.report_staff(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_cashups(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.report_staff(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_cashups(uuid, timestamptz, timestamptz) to authenticated;
