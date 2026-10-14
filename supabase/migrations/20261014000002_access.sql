create function private.staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.staff s
  where s.user_id = (select auth.uid()) and s.active
$$;

create function private.staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.staff s
  where s.user_id = (select auth.uid()) and s.active
$$;

create function private.can_access_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid())
      and s.active
      and (
        s.role = 'owner'
        or exists (
          select 1 from public.staff_stores ss
          where ss.staff_id = s.id and ss.store_id = p_store_id
        )
      )
  )
$$;

create function private.can_access_register(p_register_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.registers r
    where r.id = p_register_id and private.can_access_store(r.store_id)
  )
$$;

create function private.can_access_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and private.can_access_store(o.store_id)
  )
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

create policy "staff read business" on public.business
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "owner updates business" on public.business
  for update to authenticated
  using ((select private.staff_role()) = 'owner')
  with check ((select private.staff_role()) = 'owner');

create policy "staff read their stores" on public.stores
  for select to authenticated using (private.can_access_store(id));
create policy "owner manages stores" on public.stores
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their registers" on public.registers
  for select to authenticated using (private.can_access_store(store_id));
create policy "owner manages registers" on public.registers
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read visible staff" on public.staff
  for select to authenticated using (
    (user_id = (select auth.uid()) and active)
    or (select private.staff_role()) = 'owner'
    or (
      (select private.staff_role()) = 'manager'
      and exists (
        select 1 from public.staff_stores ss
        where ss.staff_id = staff.id and private.can_access_store(ss.store_id)
      )
    )
  );
create policy "owner manages staff" on public.staff
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read visible assignments" on public.staff_stores
  for select to authenticated using (
    staff_id = (select private.staff_id())
    or (select private.staff_role()) = 'owner'
    or ((select private.staff_role()) = 'manager' and private.can_access_store(store_id))
  );
create policy "owner manages assignments" on public.staff_stores
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read tax classes" on public.tax_classes
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "owner manages tax classes" on public.tax_classes
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their tax rates" on public.tax_rates
  for select to authenticated using (private.can_access_store(store_id));
create policy "owner manages tax rates" on public.tax_rates
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read categories" on public.categories
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage categories" on public.categories
  for all to authenticated using ((select private.staff_role()) in ('owner', 'manager'));

create policy "staff read products" on public.products
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage products" on public.products
  for all to authenticated using ((select private.staff_role()) in ('owner', 'manager'));

create policy "staff read variants" on public.product_variants
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage variants" on public.product_variants
  for all to authenticated using ((select private.staff_role()) in ('owner', 'manager'));

create policy "staff read their stock" on public.stock_levels
  for select to authenticated using (private.can_access_store(store_id));
create policy "managers manage their stock" on public.stock_levels
  for all to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id)
  );

create policy "staff read customers" on public.customers
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "staff add customers" on public.customers
  for insert to authenticated with check ((select private.staff_id()) is not null);
create policy "staff edit customers" on public.customers
  for update to authenticated using ((select private.staff_id()) is not null);
create policy "managers delete customers" on public.customers
  for delete to authenticated using ((select private.staff_role()) in ('owner', 'manager'));

create policy "staff read their sessions" on public.register_sessions
  for select to authenticated using (private.can_access_register(register_id));
create policy "staff open sessions in their stores" on public.register_sessions
  for insert to authenticated with check (
    private.can_access_register(register_id) and opened_by = (select private.staff_id())
  );
create policy "managers edit sessions" on public.register_sessions
  for update to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_register(register_id)
  );
create policy "owner deletes sessions" on public.register_sessions
  for delete to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their orders" on public.orders
  for select to authenticated using (private.can_access_store(store_id));
create policy "staff create orders in their stores" on public.orders
  for insert to authenticated with check (
    private.can_access_store(store_id) and staff_id = (select private.staff_id())
    and exists (
      select 1 from public.registers r
      where r.id = register_id and r.store_id = orders.store_id
    )
    and exists (
      select 1 from public.register_sessions s
      where s.id = session_id and s.register_id = orders.register_id and s.closed_at is null
    )
  );
create policy "managers edit orders" on public.orders
  for update to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id)
  );
create policy "owner deletes orders" on public.orders
  for delete to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their order items" on public.order_items
  for select to authenticated using (private.can_access_order(order_id));
create policy "staff add order items" on public.order_items
  for insert to authenticated with check (private.can_access_order(order_id));
create policy "managers edit order items" on public.order_items
  for update to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_order(order_id)
  );
create policy "owner deletes order items" on public.order_items
  for delete to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their payments" on public.payments
  for select to authenticated using (private.can_access_order(order_id));
create policy "staff add payments" on public.payments
  for insert to authenticated with check (private.can_access_order(order_id));
create policy "managers edit payments" on public.payments
  for update to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_order(order_id)
  );
create policy "owner deletes payments" on public.payments
  for delete to authenticated using ((select private.staff_role()) = 'owner');

revoke truncate, references, trigger on all tables in schema public from authenticated, anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated, anon;
