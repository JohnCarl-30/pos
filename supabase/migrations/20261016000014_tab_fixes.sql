create or replace function public.pay_tab(
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

  if not exists (
    select 1 from public.register_sessions rs
    join public.registers r on r.id = rs.register_id
    where rs.id = p_session_id and r.store_id = v_tab.store_id
  ) then
    raise exception 'this till is in another store' using errcode = '22023';
  end if;

  v_result := public.create_order(p_session_id, v_lines, p_order_discount, p_approval_id, p_customer_id, p_payments, p_tip, left(private.tab_label(v_tab), 40), false);

  perform private.send_lines(v_tab, v_ids);

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
