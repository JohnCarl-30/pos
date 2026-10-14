alter table public.stores
  add column max_cashier_discount_bps integer not null default 2000 check (max_cashier_discount_bps between 0 and 10000),
  add column receipt_footer text check (length(receipt_footer) <= 300);

alter table public.register_sessions
  add column close_note text check (length(close_note) <= 300);

create table public.discount_approvals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  approved_by uuid not null references public.staff (id) on delete restrict,
  requested_by uuid not null references public.staff (id) on delete restrict,
  max_bps integer not null check (max_bps between 0 and 10000),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index discount_approvals_store_id_idx on public.discount_approvals (store_id);
create index discount_approvals_approved_by_idx on public.discount_approvals (approved_by);
create index discount_approvals_requested_by_idx on public.discount_approvals (requested_by);

alter table public.discount_approvals enable row level security;
revoke all on public.discount_approvals from anon;
revoke insert, update, delete, truncate, references, trigger on public.discount_approvals from authenticated;
create policy "staff read approvals for their stores" on public.discount_approvals
  for select to authenticated using (private.can_access_store(store_id));

alter table public.orders
  add column discount_approval_id uuid references public.discount_approvals (id) on delete restrict,
  add column discount_by uuid references public.staff (id) on delete restrict;
create index orders_discount_approval_id_idx on public.orders (discount_approval_id);
create index orders_discount_by_idx on public.orders (discount_by);

alter table public.order_items
  add column line_discount_bps integer check (line_discount_bps between 0 and 10000),
  add column line_discount_amount bigint check (line_discount_amount >= 0),
  add column line_number integer check (line_number > 0);

revoke insert on public.orders, public.order_items, public.payments from authenticated;

create function private.div_half_even(p_num numeric, p_den numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (case
    when parts.r * 2 > p_den then parts.q + 1
    when parts.r * 2 < p_den then parts.q
    when mod(parts.q, 2) = 0 then parts.q
    else parts.q + 1
  end)::bigint
  from (select floor(p_num / p_den) as q, p_num - floor(p_num / p_den) * p_den as r) as parts
$$;

create function private.price_cart(p_include_tax boolean, p_lines jsonb, p_order_discount jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer := coalesce(jsonb_array_length(p_lines), 0);
  v_gross bigint[] := '{}';
  v_disc bigint[] := '{}';
  v_rate integer[] := '{}';
  v_alloc bigint[] := '{}';
  v_rem numeric[] := '{}';
  v_order_index integer[];
  v_line jsonb;
  v_bps integer;
  v_amount bigint;
  v_line_gross bigint;
  v_line_disc bigint;
  v_after bigint := 0;
  v_order bigint := 0;
  v_alloc_sum bigint := 0;
  v_left bigint;
  v_net bigint;
  v_tax bigint;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_discount_total bigint := 0;
  v_tax_total bigint := 0;
  v_total bigint := 0;
  v_out jsonb := '[]'::jsonb;
  i integer;
begin
  for i in 1..v_count loop
    v_line := p_lines -> (i - 1);
    v_line_gross := (v_line ->> 'price')::bigint * (v_line ->> 'quantity')::integer;
    v_bps := (v_line ->> 'discount_bps')::integer;
    v_amount := (v_line ->> 'discount_amount')::bigint;
    if v_bps is not null and v_amount is not null then
      raise exception 'choose a percentage or an amount, not both' using errcode = '22023';
    elsif v_bps is not null then
      if v_bps < 0 or v_bps > 10000 then
        raise exception 'a percentage must be between 0 and 100' using errcode = '22023';
      end if;
      v_line_disc := private.div_half_even(v_line_gross::numeric * v_bps, 10000);
    elsif v_amount is not null then
      if v_amount < 0 or v_amount > v_line_gross then
        raise exception 'a discount can''t be more than the amount it applies to' using errcode = '22023';
      end if;
      v_line_disc := v_amount;
    else
      v_line_disc := 0;
    end if;
    v_gross := v_gross || v_line_gross;
    v_disc := v_disc || v_line_disc;
    v_rate := v_rate || coalesce((v_line ->> 'rate_bps')::integer, 0);
    v_subtotal := v_subtotal + v_line_gross;
    v_after := v_after + v_line_gross - v_line_disc;
  end loop;

  if p_order_discount is not null and jsonb_typeof(p_order_discount) = 'object' then
    v_bps := (p_order_discount ->> 'bps')::integer;
    v_amount := (p_order_discount ->> 'amount')::bigint;
    if v_bps is not null and v_amount is not null then
      raise exception 'choose a percentage or an amount, not both' using errcode = '22023';
    elsif v_bps is not null then
      if v_bps < 0 or v_bps > 10000 then
        raise exception 'a percentage must be between 0 and 100' using errcode = '22023';
      end if;
      v_order := private.div_half_even(v_after::numeric * v_bps, 10000);
    elsif v_amount is not null then
      if v_amount < 0 or v_amount > v_after then
        raise exception 'a discount can''t be more than the amount it applies to' using errcode = '22023';
      end if;
      v_order := v_amount;
    end if;
  end if;

  for i in 1..v_count loop
    if v_after = 0 or v_order = 0 then
      v_alloc := v_alloc || 0::bigint;
      v_rem := v_rem || 0::numeric;
    else
      v_alloc := v_alloc || floor(v_order::numeric * (v_gross[i] - v_disc[i]) / v_after)::bigint;
      v_rem := v_rem || mod(v_order::numeric * (v_gross[i] - v_disc[i]), v_after::numeric);
      v_alloc_sum := v_alloc_sum + v_alloc[i];
    end if;
  end loop;

  v_left := case when v_after = 0 or v_order = 0 then 0 else v_order - v_alloc_sum end;
  if v_left > 0 then
    select array_agg(t.idx::integer order by t.rem desc, t.idx) into v_order_index
    from unnest(v_rem) with ordinality as t(rem, idx);
    for i in 1..v_left loop
      v_alloc[v_order_index[i]] := v_alloc[v_order_index[i]] + 1;
    end loop;
  end if;

  for i in 1..v_count loop
    v_net := v_gross[i] - v_disc[i] - v_alloc[i];
    if p_include_tax then
      v_tax := v_net - private.div_half_even(v_net::numeric * 10000, 10000 + v_rate[i]);
      v_line_total := v_net;
    else
      v_tax := private.div_half_even(v_net::numeric * v_rate[i], 10000);
      v_line_total := v_net + v_tax;
    end if;
    v_discount_total := v_discount_total + v_disc[i] + v_alloc[i];
    v_tax_total := v_tax_total + v_tax;
    v_total := v_total + v_line_total;
    v_out := v_out || jsonb_build_array(jsonb_build_object('discount', v_disc[i] + v_alloc[i], 'tax', v_tax, 'line_total', v_line_total));
  end loop;

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'discount_total', v_discount_total,
    'tax_total', v_tax_total,
    'total', v_total,
    'lines', v_out
  );
end;
$$;

revoke execute on function private.div_half_even(numeric, numeric) from public, anon, authenticated;
revoke execute on function private.price_cart(boolean, jsonb, jsonb) from public, anon, authenticated;

create function public.open_register(p_register_id uuid, p_opening_cash bigint)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'starting cash must be zero or more' using errcode = '22023';
  end if;
  insert into public.register_sessions (register_id, opened_by, opening_cash)
  values (p_register_id, (select private.staff_id()), p_opening_cash)
  returning id into v_session_id;
  return v_session_id;
end;
$$;

revoke execute on function public.open_register(uuid, bigint) from public, anon;
grant execute on function public.open_register(uuid, bigint) to authenticated;

create function public.close_register(p_session_id uuid, p_counted_cash bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_store_id uuid;
  v_opening bigint;
  v_closed_at timestamptz;
  v_cash bigint;
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

  select r.store_id, rs.opening_cash, rs.closed_at into v_store_id, v_opening, v_closed_at
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

  select coalesce(sum(p.amount), 0) into v_cash
  from public.payments p
  join public.orders o on o.id = p.order_id
  where o.session_id = p_session_id and o.status = 'completed' and p.method = 'cash';

  update public.register_sessions set
    closed_by = v_staff_id,
    closed_at = now(),
    counted_cash = p_counted_cash,
    close_note = nullif(trim(p_note), '')
  where id = p_session_id;

  return jsonb_build_object(
    'opening_cash', v_opening,
    'cash_sales', v_cash,
    'expected_cash', v_opening + v_cash,
    'counted_cash', p_counted_cash,
    'difference', p_counted_cash - (v_opening + v_cash)
  );
end;
$$;

revoke execute on function public.close_register(uuid, bigint, text) from public, anon;
grant execute on function public.close_register(uuid, bigint, text) to authenticated;

create function public.create_order(
  p_session_id uuid,
  p_lines jsonb,
  p_order_discount jsonb default null,
  p_approval_id uuid default null,
  p_customer_id uuid default null,
  p_payments jsonb default '[]'::jsonb
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
  v_priced jsonb := '[]'::jsonb;
  v_variant_ids uuid[] := '{}';
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
  v_receipt integer;
  v_order_id uuid;
  i integer;
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

  select s.prices_include_tax, s.max_cashier_discount_bps into v_include_tax, v_cap from public.stores s where s.id = v_store_id;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'add at least one item' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity is null or v_quantity < 1 or v_quantity > 9999 then
      raise exception 'quantity must be between 1 and 9999' using errcode = '22023';
    end if;

    select v.id, v.price, v.sku,
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

    v_variant_ids := v_variant_ids || v_variant.id;
    v_names := v_names || v_variant.label;
    v_skus := v_skus || v_variant.sku;
    v_prices := v_prices || v_variant.price;
    v_quantities := v_quantities || v_quantity;
    v_rates := v_rates || v_variant.rate_bps;
    v_tracks := v_tracks || v_variant.track;
    v_entered_bps := v_entered_bps || (v_line ->> 'discount_bps')::integer;
    v_entered_amounts := v_entered_amounts || (v_line ->> 'discount_amount')::bigint;
    v_priced := v_priced || jsonb_build_array(jsonb_build_object(
      'price', v_variant.price,
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
        and a.max_bps >= v_share
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
  end loop;
  if v_paid <> v_total then
    raise exception 'payments must add up to the total' using errcode = '22023';
  end if;

  if p_customer_id is not null and not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  update public.registers set next_receipt_number = next_receipt_number + 1
  where id = v_register_id
  returning next_receipt_number - 1 into v_receipt;

  insert into public.orders (
    store_id, register_id, session_id, staff_id, customer_id, receipt_number, status,
    subtotal, discount_total, tax_total, total, discount_approval_id, discount_by
  ) values (
    v_store_id, v_register_id, p_session_id, v_staff_id, p_customer_id, v_receipt, 'completed',
    v_subtotal, v_discount_total, (v_cart ->> 'tax_total')::bigint, v_total, v_approval_id, v_discount_by
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
    );
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_amount := (v_payment ->> 'amount')::bigint;
    v_tendered := (v_payment ->> 'tendered')::bigint;
    insert into public.payments (order_id, method, amount, tendered, change, reference)
    values (
      v_order_id,
      (v_payment ->> 'method')::public.payment_method,
      v_amount,
      v_tendered,
      case when v_tendered is not null then v_tendered - v_amount end,
      nullif(trim(v_payment ->> 'reference'), '')
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

revoke execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_order(uuid, jsonb, jsonb, uuid, uuid, jsonb) to authenticated;
