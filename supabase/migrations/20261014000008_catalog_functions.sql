create function public.save_product(p_store_id uuid, p_product jsonb, p_variants jsonb)
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

  return v_product_id;
end;
$$;

revoke execute on function public.save_product(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_product(uuid, jsonb, jsonb) to authenticated;

create function public.import_catalog(p_store_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_category_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_count integer := 0;
begin
  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_category_id := null;
    if coalesce(trim(v_row->>'category'), '') <> '' then
      select id into v_category_id from public.categories where lower(name) = lower(trim(v_row->>'category'));
      if v_category_id is null then
        insert into public.categories (name, sort_order)
        values (trim(v_row->>'category'), (select coalesce(max(sort_order) + 1, 0) from public.categories))
        returning id into v_category_id;
      end if;
    end if;

    select v.id, v.product_id into v_variant_id, v_product_id
    from public.product_variants v where v.sku = v_row->>'sku';

    if v_variant_id is not null then
      update public.products set
        name = v_row->>'product',
        category_id = case when v_row ? 'category' then v_category_id else category_id end,
        tax_class_id = case when v_row ? 'tax_class_id' then (v_row->>'tax_class_id')::uuid else tax_class_id end
      where id = v_product_id;
      update public.product_variants set
        name = case when v_row ? 'variant' then v_row->>'variant' else name end,
        barcode = case when v_row ? 'barcode' then nullif(v_row->>'barcode', '') else barcode end,
        price = (v_row->>'price')::bigint,
        cost = case when v_row ? 'cost' then nullif(v_row->>'cost', '')::bigint else cost end
      where id = v_variant_id;
    else
      select id into v_product_id from public.products
      where lower(name) = lower(v_row->>'product') and active
      order by created_at limit 1;
      if v_product_id is null then
        insert into public.products (name, category_id, tax_class_id)
        values (v_row->>'product', v_category_id, (v_row->>'tax_class_id')::uuid)
        returning id into v_product_id;
      end if;
      insert into public.product_variants (product_id, name, sku, barcode, price, cost, sort_order)
      values (
        v_product_id,
        coalesce(v_row->>'variant', 'Default'),
        v_row->>'sku',
        nullif(v_row->>'barcode', ''),
        (v_row->>'price')::bigint,
        nullif(v_row->>'cost', '')::bigint,
        (select coalesce(max(sort_order) + 1, 0) from public.product_variants where product_id = v_product_id)
      )
      returning id into v_variant_id;
    end if;

    if v_row->>'track' is not null then
      update public.stock_levels set track = (v_row->>'track')::boolean
      where variant_id = v_variant_id and store_id = p_store_id;
    end if;
    if v_row->>'stock' is not null then
      perform public.record_stock_count(p_store_id, v_variant_id, (v_row->>'stock')::integer, 'CSV import');
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.import_catalog(uuid, jsonb) from public, anon;
grant execute on function public.import_catalog(uuid, jsonb) to authenticated;
