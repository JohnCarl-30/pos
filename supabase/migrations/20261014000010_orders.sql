alter table public.orders
  add column voided_at timestamptz,
  add column voided_by uuid references public.staff (id) on delete restrict,
  add column void_reason text check (length(trim(void_reason)) between 1 and 300),
  add constraint orders_void_fields check (
    (status = 'voided') = (voided_at is not null)
    and (voided_at is null) = (voided_by is null)
    and (voided_at is null) = (void_reason is null)
  );
create index orders_voided_by_idx on public.orders (voided_by);

alter table public.orders drop constraint orders_customer_id_fkey;
alter table public.orders add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customers (id) on delete restrict;

create table public.refund_approvals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete restrict,
  approved_by uuid not null references public.staff (id) on delete restrict,
  requested_by uuid not null references public.staff (id) on delete restrict,
  max_amount bigint not null check (max_amount >= 0),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index refund_approvals_store_id_idx on public.refund_approvals (store_id);
create index refund_approvals_order_id_idx on public.refund_approvals (order_id);
create index refund_approvals_approved_by_idx on public.refund_approvals (approved_by);
create index refund_approvals_requested_by_idx on public.refund_approvals (requested_by);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  register_id uuid not null references public.registers (id) on delete restrict,
  session_id uuid not null references public.register_sessions (id) on delete restrict,
  receipt_number integer not null check (receipt_number > 0),
  staff_id uuid not null references public.staff (id) on delete restrict,
  approval_id uuid references public.refund_approvals (id) on delete restrict,
  approved_by uuid references public.staff (id) on delete restrict,
  reason text not null check (reason in ('changed_mind', 'damaged', 'wrong_item', 'other')),
  note text check (length(note) <= 300),
  subtotal bigint not null check (subtotal >= 0),
  tax_total bigint not null check (tax_total >= 0),
  total bigint not null check (total >= 0),
  created_at timestamptz not null default now(),
  unique (register_id, receipt_number),
  check (reason <> 'other' or note is not null)
);
create index refunds_order_id_idx on public.refunds (order_id);
create index refunds_store_id_created_at_idx on public.refunds (store_id, created_at desc);
create index refunds_session_id_idx on public.refunds (session_id);
create index refunds_staff_id_idx on public.refunds (staff_id);
create index refunds_approval_id_idx on public.refunds (approval_id);
create index refunds_approved_by_idx on public.refunds (approved_by);

create table public.refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  restock boolean not null,
  amount bigint not null check (amount >= 0),
  tax bigint not null check (tax >= 0),
  created_at timestamptz not null default now()
);
create index refund_items_refund_id_idx on public.refund_items (refund_id);
create index refund_items_order_item_id_idx on public.refund_items (order_item_id);

create table public.refund_payments (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds (id) on delete cascade,
  method public.payment_method not null,
  amount bigint not null check (amount > 0),
  reference text check (length(reference) <= 100),
  created_at timestamptz not null default now(),
  check (method <> 'cash' or reference is null)
);
create index refund_payments_refund_id_idx on public.refund_payments (refund_id);

create function private.can_access_refund(p_refund_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.refunds r
    where r.id = p_refund_id and private.can_access_store(r.store_id)
  )
$$;
revoke execute on function private.can_access_refund(uuid) from public, anon;
grant execute on function private.can_access_refund(uuid) to authenticated;

alter table public.refund_approvals enable row level security;
alter table public.refunds enable row level security;
alter table public.refund_items enable row level security;
alter table public.refund_payments enable row level security;
revoke all on public.refund_approvals, public.refunds, public.refund_items, public.refund_payments from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.refund_approvals, public.refunds, public.refund_items, public.refund_payments from authenticated;

create policy "staff read refund approvals they asked for" on public.refund_approvals
  for select to authenticated using (
    private.can_access_store(store_id)
    and (requested_by = (select private.staff_id()) or (select private.staff_role()) in ('owner', 'manager'))
  );
create policy "staff read refunds in their stores" on public.refunds
  for select to authenticated using (private.can_access_store(store_id));
create policy "staff read refund items" on public.refund_items
  for select to authenticated using (private.can_access_refund(refund_id));
create policy "staff read refund payments" on public.refund_payments
  for select to authenticated using (private.can_access_refund(refund_id));

drop policy "managers edit sessions" on public.register_sessions;
drop policy "owner deletes sessions" on public.register_sessions;
drop policy "staff create orders in their stores" on public.orders;
drop policy "managers edit orders" on public.orders;
drop policy "owner deletes orders" on public.orders;
drop policy "staff add order items" on public.order_items;
drop policy "managers edit order items" on public.order_items;
drop policy "owner deletes order items" on public.order_items;
drop policy "staff add payments" on public.payments;
drop policy "managers edit payments" on public.payments;
drop policy "owner deletes payments" on public.payments;
revoke update, delete on public.orders, public.order_items, public.payments, public.register_sessions from authenticated;

drop policy "managers delete customers" on public.customers;
create policy "staff delete customers" on public.customers
  for delete to authenticated using ((select private.staff_id()) is not null);

create function private.refund_line(p_line_total bigint, p_tax bigint, p_quantity integer, p_refunded integer, p_units integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_units is null or p_units < 1 then
    raise exception 'refund quantity must be at least 1' using errcode = '22023';
  end if;
  if p_refunded + p_units > p_quantity then
    raise exception 'refund quantity is more than was sold' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'amount', private.div_half_even(p_line_total::numeric * (p_refunded + p_units), p_quantity)
      - private.div_half_even(p_line_total::numeric * p_refunded, p_quantity),
    'tax', private.div_half_even(p_tax::numeric * (p_refunded + p_units), p_quantity)
      - private.div_half_even(p_tax::numeric * p_refunded, p_quantity)
  );
end;
$$;
revoke execute on function private.refund_line(bigint, bigint, integer, integer, integer) from public, anon, authenticated;

create function public.create_refund(
  p_order_id uuid,
  p_session_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_approval_id uuid default null,
  p_reason text default 'changed_mind',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_role public.staff_role;
  v_note text := nullif(trim(p_note), '');
  v_order record;
  v_register_id uuid;
  v_session_store uuid;
  v_closed_at timestamptz;
  v_line jsonb;
  v_item record;
  v_units integer;
  v_priced jsonb;
  v_item_ids uuid[] := '{}';
  v_variant_ids uuid[] := '{}';
  v_units_list integer[] := '{}';
  v_restock boolean[] := '{}';
  v_tracks boolean[] := '{}';
  v_amounts bigint[] := '{}';
  v_taxes bigint[] := '{}';
  v_total bigint := 0;
  v_tax_total bigint := 0;
  v_payment jsonb;
  v_method public.payment_method;
  v_amount bigint;
  v_reference text;
  v_paid bigint := 0;
  v_card bigint := 0;
  v_other bigint := 0;
  v_room bigint;
  v_approval_id uuid;
  v_approved_by uuid;
  v_receipt integer;
  v_refund_id uuid;
  i integer;
begin
  select s.id, s.role into v_staff_id, v_role from public.staff s where s.user_id = (select auth.uid()) and s.active;
  if v_staff_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('changed_mind', 'damaged', 'wrong_item', 'other') then
    raise exception 'pick a reason for the refund' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'add a note for the refund' using errcode = '22023';
  end if;
  if length(v_note) > 300 then
    raise exception 'keep the note under 300 characters' using errcode = '22023';
  end if;

  select o.id, o.store_id, o.status, o.receipt_number into v_order
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found or not private.can_access_store(v_order.store_id) then
    raise exception 'sale not found' using errcode = 'P0002';
  end if;
  if v_order.status = 'voided' then
    raise exception 'sale is voided' using errcode = 'P0001';
  end if;

  select r.id, r.store_id, rs.closed_at into v_register_id, v_session_store, v_closed_at
  from public.register_sessions rs
  join public.registers r on r.id = rs.register_id
  where rs.id = p_session_id
  for update of rs;
  if not found or v_session_store <> v_order.store_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_closed_at is not null then
    raise exception 'till is closed' using errcode = 'P0001';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'pick at least one item to refund' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    select oi.id, oi.name, oi.quantity, oi.line_total, oi.tax, oi.variant_id,
      coalesce(sl.track, false) as track,
      coalesce((select sum(ri.quantity) from public.refund_items ri where ri.order_item_id = oi.id), 0)::integer as refunded
    into v_item
    from public.order_items oi
    left join public.stock_levels sl on sl.store_id = v_order.store_id and sl.variant_id = oi.variant_id
    where oi.id = (v_line ->> 'order_item_id')::uuid and oi.order_id = p_order_id;
    if not found then
      raise exception 'that item is not on this sale' using errcode = '22023';
    end if;
    if v_item.id = any(v_item_ids) then
      raise exception 'list each item once' using errcode = '22023';
    end if;
    v_units := (v_line ->> 'quantity')::integer;
    if v_units is null or v_units < 1 then
      raise exception 'refund quantity must be at least 1' using errcode = '22023';
    end if;
    if v_units > v_item.quantity - v_item.refunded then
      raise exception '%', format('only %s left to refund on %s', v_item.quantity - v_item.refunded, v_item.name) using errcode = '22023';
    end if;

    v_priced := private.refund_line(v_item.line_total, v_item.tax, v_item.quantity, v_item.refunded, v_units);
    v_item_ids := v_item_ids || v_item.id;
    v_variant_ids := v_variant_ids || v_item.variant_id;
    v_units_list := v_units_list || v_units;
    v_restock := v_restock || coalesce((v_line ->> 'restock')::boolean, true);
    v_tracks := v_tracks || v_item.track;
    v_amounts := v_amounts || (v_priced ->> 'amount')::bigint;
    v_taxes := v_taxes || (v_priced ->> 'tax')::bigint;
    v_total := v_total + (v_priced ->> 'amount')::bigint;
    v_tax_total := v_tax_total + (v_priced ->> 'tax')::bigint;
  end loop;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 10 then
    raise exception 'add how the money goes back' using errcode = '22023';
  end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_method := (v_payment ->> 'method')::public.payment_method;
    v_amount := (v_payment ->> 'amount')::bigint;
    v_reference := nullif(trim(v_payment ->> 'reference'), '');
    if v_amount is null or v_amount <= 0 then
      raise exception 'each refund payment needs an amount above 0' using errcode = '22023';
    end if;
    if v_reference is not null and v_method = 'cash' then
      raise exception 'only card and other refunds can have a reference' using errcode = '22023';
    end if;
    if length(v_reference) > 100 then
      raise exception 'keep the reference under 100 characters' using errcode = '22023';
    end if;
    v_paid := v_paid + v_amount;
    if v_method = 'card' then v_card := v_card + v_amount; end if;
    if v_method = 'other' then v_other := v_other + v_amount; end if;
  end loop;
  if v_paid <> v_total then
    raise exception 'payments must add up to the refund' using errcode = '22023';
  end if;

  if v_card > 0 then
    select coalesce((select sum(p.amount) from public.payments p where p.order_id = p_order_id and p.method = 'card'), 0)
      - coalesce((select sum(rp.amount) from public.refund_payments rp join public.refunds r on r.id = rp.refund_id where r.order_id = p_order_id and rp.method = 'card'), 0)
    into v_room;
    if v_card > v_room then
      raise exception '%', format('card refunds can''t be more than %s', greatest(v_room, 0)) using errcode = '22023';
    end if;
  end if;
  if v_other > 0 then
    select coalesce((select sum(p.amount) from public.payments p where p.order_id = p_order_id and p.method = 'other'), 0)
      - coalesce((select sum(rp.amount) from public.refund_payments rp join public.refunds r on r.id = rp.refund_id where r.order_id = p_order_id and rp.method = 'other'), 0)
    into v_room;
    if v_other > v_room then
      raise exception '%', format('other refunds can''t be more than %s', greatest(v_room, 0)) using errcode = '22023';
    end if;
  end if;

  if v_role = 'cashier' then
    select a.id, a.approved_by into v_approval_id, v_approved_by
    from public.refund_approvals a
    where a.id = p_approval_id
      and a.store_id = v_order.store_id
      and a.order_id = p_order_id
      and a.requested_by = v_staff_id
      and a.used_at is null
      and a.expires_at > now()
      and a.max_amount >= v_total
    for update;
    if not found then
      raise exception 'refund needs approval' using errcode = 'P0001';
    end if;
    update public.refund_approvals set used_at = now() where id = v_approval_id;
  else
    v_approved_by := v_staff_id;
  end if;

  update public.registers set next_receipt_number = next_receipt_number + 1
  where id = v_register_id
  returning next_receipt_number - 1 into v_receipt;

  insert into public.refunds (
    order_id, store_id, register_id, session_id, receipt_number, staff_id, approval_id, approved_by,
    reason, note, subtotal, tax_total, total
  ) values (
    p_order_id, v_order.store_id, v_register_id, p_session_id, v_receipt, v_staff_id, v_approval_id, v_approved_by,
    p_reason, v_note, v_total - v_tax_total, v_tax_total, v_total
  )
  returning id into v_refund_id;

  for i in 1..array_length(v_item_ids, 1) loop
    insert into public.refund_items (refund_id, order_item_id, quantity, restock, amount, tax)
    values (v_refund_id, v_item_ids[i], v_units_list[i], v_restock[i], v_amounts[i], v_taxes[i]);
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    insert into public.refund_payments (refund_id, method, amount, reference)
    values (
      v_refund_id,
      (v_payment ->> 'method')::public.payment_method,
      (v_payment ->> 'amount')::bigint,
      nullif(trim(v_payment ->> 'reference'), '')
    );
  end loop;

  perform 1 from public.stock_levels
  where store_id = v_order.store_id and variant_id = any(v_variant_ids)
  order by variant_id
  for update;

  for i in 1..array_length(v_item_ids, 1) loop
    if v_restock[i] and v_tracks[i] then
      insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
      values (v_order.store_id, v_variant_ids[i], v_units_list[i], 'returned', v_staff_id,
        'Refund #' || v_receipt || ' for receipt #' || v_order.receipt_number);
    end if;
  end loop;

  update public.orders set status = case
    when exists (
      select 1 from public.order_items oi
      where oi.order_id = p_order_id
        and oi.quantity > coalesce((select sum(ri.quantity) from public.refund_items ri where ri.order_item_id = oi.id), 0)
    ) then 'partially_refunded'::public.order_status
    else 'refunded'::public.order_status
  end
  where id = p_order_id;

  return jsonb_build_object('refund_id', v_refund_id, 'receipt_number', v_receipt, 'total', v_total);
end;
$$;

revoke execute on function public.create_refund(uuid, uuid, jsonb, jsonb, uuid, text, text) from public, anon;
grant execute on function public.create_refund(uuid, uuid, jsonb, jsonb, uuid, text, text) to authenticated;

create function public.void_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_role public.staff_role;
  v_reason text := nullif(trim(p_reason), '');
  v_order record;
begin
  select s.id, s.role into v_staff_id, v_role from public.staff s where s.user_id = (select auth.uid()) and s.active;
  if v_staff_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'add a reason for the void' using errcode = '22023';
  end if;
  if length(v_reason) > 300 then
    raise exception 'keep the reason under 300 characters' using errcode = '22023';
  end if;

  select o.id, o.store_id, o.status, o.staff_id, o.receipt_number, rs.closed_at into v_order
  from public.orders o
  join public.register_sessions rs on rs.id = o.session_id
  where o.id = p_order_id
  for update of o;
  if not found or not private.can_access_store(v_order.store_id) then
    raise exception 'sale not found' using errcode = 'P0002';
  end if;
  if v_role = 'cashier' and v_order.staff_id <> v_staff_id then
    raise exception 'you can only void your own sales' using errcode = '42501';
  end if;
  if v_order.status = 'voided' then
    raise exception 'sale is already voided' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.refunds r where r.order_id = p_order_id) then
    raise exception 'sale has refunds' using errcode = 'P0001';
  end if;
  if v_order.closed_at is not null then
    raise exception 'till is closed — refund it instead' using errcode = 'P0001';
  end if;

  update public.orders set status = 'voided', voided_at = now(), voided_by = v_staff_id, void_reason = v_reason
  where id = p_order_id;

  perform 1 from public.stock_levels sl
  where sl.store_id = v_order.store_id
    and sl.variant_id in (select oi.variant_id from public.order_items oi where oi.order_id = p_order_id)
  order by sl.variant_id
  for update;

  insert into public.stock_movements (store_id, variant_id, quantity_change, reason, staff_id, note)
  select v_order.store_id, oi.variant_id, oi.quantity, 'returned', v_staff_id, 'Void of receipt #' || v_order.receipt_number
  from public.order_items oi
  join public.stock_levels sl on sl.store_id = v_order.store_id and sl.variant_id = oi.variant_id
  where oi.order_id = p_order_id and sl.track;
end;
$$;

revoke execute on function public.void_order(uuid, text) from public, anon;
grant execute on function public.void_order(uuid, text) to authenticated;

create or replace function public.close_register(p_session_id uuid, p_counted_cash bigint, p_note text default null)
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
  v_refunds bigint;
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
  where o.session_id = p_session_id and o.status <> 'voided' and p.method = 'cash';

  select coalesce(sum(rp.amount), 0) into v_refunds
  from public.refund_payments rp
  join public.refunds r on r.id = rp.refund_id
  where r.session_id = p_session_id and rp.method = 'cash';

  select count(*) into v_voided from public.orders o where o.session_id = p_session_id and o.status = 'voided';

  update public.register_sessions set
    closed_by = v_staff_id,
    closed_at = now(),
    counted_cash = p_counted_cash,
    close_note = nullif(trim(p_note), '')
  where id = p_session_id;

  return jsonb_build_object(
    'opening_cash', v_opening,
    'cash_sales', v_cash,
    'cash_refunds', v_refunds,
    'expected_cash', v_opening + v_cash - v_refunds,
    'counted_cash', p_counted_cash,
    'difference', p_counted_cash - (v_opening + v_cash - v_refunds),
    'voided_count', v_voided
  );
end;
$$;
