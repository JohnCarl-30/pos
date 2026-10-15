create index orders_store_id_voided_at_idx on public.orders (store_id, voided_at) where voided_at is not null;

grant execute on function private.div_half_even(numeric, numeric) to authenticated;

create function private.session_cash(p_session_id uuid)
returns table (opening_cash bigint, cash_sales bigint, cash_refunds bigint, expected_cash bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select rs.opening_cash, s.cash, f.cash, rs.opening_cash + s.cash - f.cash
  from public.register_sessions rs
  cross join lateral (
    select coalesce(sum(p.amount), 0)::bigint as cash
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
    'cash_refunds', v_cash.cash_refunds,
    'expected_cash', v_cash.expected_cash,
    'counted_cash', p_counted_cash,
    'difference', p_counted_cash - v_cash.expected_cash,
    'voided_count', v_voided
  );
end;
$$;

create function private.report_guard(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce((select private.staff_role()) in ('owner', 'manager'), false) is false or not private.can_access_store(p_store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '367 days' then
    raise exception 'pick a range of up to 366 days' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.report_guard(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function private.report_guard(uuid, timestamptz, timestamptz) to authenticated;

create function public.report_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
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
    coalesce(sum(o.total), 0)::bigint as total
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
    select p.method, p.amount
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

create function public.report_trend(p_store_id uuid, p_from timestamptz, p_to timestamptz, p_bucket text)
returns table (bucket text, sales_count integer, sales_total bigint, refunds_total bigint, net_sales bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_step interval;
  v_format text;
begin
  perform private.report_guard(p_store_id, p_from, p_to);
  if p_bucket is null or p_bucket not in ('hour', 'day') then
    raise exception 'bucket must be hour or day' using errcode = '22023';
  end if;
  select s.timezone into v_tz from public.stores s where s.id = p_store_id;
  v_step := case when p_bucket = 'hour' then interval '1 hour' else interval '1 day' end;
  v_format := case when p_bucket = 'hour' then 'YYYY-MM-DD HH24:00' else 'YYYY-MM-DD' end;

  return query
  with slots as (
    select to_char(g, v_format) as label
    from generate_series(date_trunc(p_bucket, p_from at time zone v_tz), (p_to at time zone v_tz) - interval '1 second', v_step) g
  ),
  sold as (
    select to_char(date_trunc(p_bucket, o.created_at at time zone v_tz), v_format) as label, count(*)::integer as n, sum(o.total)::bigint as amount
    from public.orders o
    where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to and o.status <> 'voided'
    group by 1
  ),
  back as (
    select to_char(date_trunc(p_bucket, r.created_at at time zone v_tz), v_format) as label, sum(r.total)::bigint as amount
    from public.refunds r
    where r.store_id = p_store_id and r.created_at >= p_from and r.created_at < p_to
    group by 1
  )
  select s.label, coalesce(d.n, 0), coalesce(d.amount, 0)::bigint, coalesce(b.amount, 0)::bigint, (coalesce(d.amount, 0) - coalesce(b.amount, 0))::bigint
  from (select distinct label from slots) s
  left join sold d on d.label = s.label
  left join back b on b.label = s.label
  order by s.label;
end;
$$;

create function public.report_products(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (variant_id uuid, name text, category text, units_sold integer, units_refunded integer, net_units integer, revenue bigint, refunded bigint, net_revenue bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.report_guard(p_store_id, p_from, p_to);

  return query
  with lines as (
    select coalesce(oi.variant_id::text, 'name:' || oi.name) as k, oi.variant_id as vid, oi.name as snap,
      oi.quantity as sold_q, oi.line_total::bigint as sold_a, 0 as back_q, 0::bigint as back_a
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.store_id = p_store_id and o.created_at >= p_from and o.created_at < p_to and o.status <> 'voided'
    union all
    select coalesce(oi.variant_id::text, 'name:' || oi.name), oi.variant_id, oi.name,
      0, 0::bigint, ri.quantity, ri.amount::bigint
    from public.refund_items ri
    join public.refunds r on r.id = ri.refund_id
    join public.order_items oi on oi.id = ri.order_item_id
    where r.store_id = p_store_id and r.created_at >= p_from and r.created_at < p_to
  ),
  grouped as (
    select l.k, (array_agg(l.vid) filter (where l.vid is not null))[1] as vid, max(l.snap) as snap,
      sum(l.sold_q)::integer as sq, sum(l.sold_a)::bigint as sa, sum(l.back_q)::integer as bq, sum(l.back_a)::bigint as ba
    from lines l
    group by l.k
  )
  select g.vid,
    coalesce(case when v.name = 'Default' then p.name else p.name || ' – ' || v.name end, g.snap),
    c.name,
    g.sq, g.bq, g.sq - g.bq, g.sa, g.ba, g.sa - g.ba
  from grouped g
  left join public.product_variants v on v.id = g.vid
  left join public.products p on p.id = v.product_id
  left join public.categories c on c.id = p.category_id
  order by g.sa - g.ba desc, 2, 1;
end;
$$;

create function public.report_staff(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, name text, sales_count integer, sales_total bigint, refund_count integer, refunds_total bigint, void_count integer, void_total bigint, cash_void_count integer, discounts bigint)
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
    select o.staff_id as sid, count(*)::integer as n, sum(o.total)::bigint as amount, sum(o.discount_total)::bigint as discount_sum
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
    coalesce(s.discount_sum, 0)::bigint
  from ids
  left join sales_by s on s.sid = ids.sid
  left join refunds_by r on r.sid = ids.sid
  left join voids_by v on v.sid = ids.sid
  left join public.staff st on st.id = ids.sid
  order by coalesce(s.amount, 0) desc, 2;
end;
$$;

create function public.report_cashups(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, register text, opened_at timestamptz, closed_at timestamptz, opened_by text, closed_by text, opening_cash bigint, cash_sales bigint, cash_refunds bigint, expected_cash bigint, counted_cash bigint, difference bigint, close_note text)
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
    c.opening_cash, c.cash_sales, c.cash_refunds, c.expected_cash,
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

revoke execute on function public.report_summary(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_trend(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.report_products(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_staff(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_cashups(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.report_summary(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_trend(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.report_products(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_staff(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_cashups(uuid, timestamptz, timestamptz) to authenticated;
