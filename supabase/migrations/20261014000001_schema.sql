create schema if not exists private;

create type public.staff_role as enum ('owner', 'manager', 'cashier');
create type public.order_status as enum ('completed', 'voided', 'refunded', 'partially_refunded');
create type public.payment_method as enum ('cash', 'card', 'other');

create table public.business (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  name text not null check (length(trim(name)) between 1 and 120),
  setup_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  address text check (length(address) <= 300),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  prices_include_tax boolean not null default false,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 60),
  next_receipt_number integer not null default 1 check (next_receipt_number > 0),
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  email text not null,
  role public.staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff_stores (
  staff_id uuid not null references public.staff (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, store_id)
);
create index staff_stores_store_id_idx on public.staff_stores (store_id);

create table public.tax_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 60),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index tax_classes_one_default_idx on public.tax_classes (is_default) where is_default;

create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  tax_class_id uuid not null references public.tax_classes (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 60),
  rate_bps integer not null check (rate_bps between 0 and 100000),
  created_at timestamptz not null default now(),
  unique (store_id, tax_class_id)
);
create index tax_rates_tax_class_id_idx on public.tax_rates (tax_class_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  tax_class_id uuid not null references public.tax_classes (id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);
create index products_tax_class_id_idx on public.products (tax_class_id);

create function private.products_default_tax_class()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tax_class_id is null then
    select id into new.tax_class_id from public.tax_classes where is_default;
  end if;
  return new;
end;
$$;

create trigger products_default_tax_class
before insert on public.products
for each row execute function private.products_default_tax_class();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null default 'Default' check (length(trim(name)) between 1 and 60),
  sku text not null unique check (length(trim(sku)) between 1 and 64),
  barcode text unique check (length(barcode) between 1 and 64),
  price bigint not null check (price >= 0),
  cost bigint check (cost >= 0),
  created_at timestamptz not null default now()
);
create index product_variants_product_id_idx on public.product_variants (product_id);

create table public.stock_levels (
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  quantity integer not null default 0,
  track boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (variant_id, store_id)
);
create index stock_levels_store_id_idx on public.stock_levels (store_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.register_sessions (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.registers (id) on delete restrict,
  opened_by uuid not null references public.staff (id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_cash bigint not null default 0 check (opening_cash >= 0),
  closed_by uuid references public.staff (id) on delete restrict,
  closed_at timestamptz,
  counted_cash bigint check (counted_cash >= 0),
  created_at timestamptz not null default now(),
  check ((closed_at is null) = (closed_by is null))
);
create index register_sessions_register_id_idx on public.register_sessions (register_id);
create index register_sessions_opened_by_idx on public.register_sessions (opened_by);
create index register_sessions_closed_by_idx on public.register_sessions (closed_by);
create unique index register_sessions_one_open_idx on public.register_sessions (register_id) where closed_at is null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  register_id uuid not null references public.registers (id) on delete restrict,
  session_id uuid not null references public.register_sessions (id) on delete restrict,
  staff_id uuid not null references public.staff (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete set null,
  receipt_number integer not null check (receipt_number > 0),
  status public.order_status not null default 'completed',
  subtotal bigint not null check (subtotal >= 0),
  discount_total bigint not null default 0 check (discount_total >= 0),
  tax_total bigint not null check (tax_total >= 0),
  total bigint not null check (total >= 0),
  created_at timestamptz not null default now(),
  unique (register_id, receipt_number)
);
create index orders_store_id_created_at_idx on public.orders (store_id, created_at desc);
create index orders_session_id_idx on public.orders (session_id);
create index orders_staff_id_idx on public.orders (staff_id);
create index orders_customer_id_idx on public.orders (customer_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  name text not null,
  sku text not null,
  unit_price bigint not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  discount bigint not null default 0 check (discount >= 0),
  tax_rate_bps integer not null check (tax_rate_bps >= 0),
  tax bigint not null check (tax >= 0),
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method public.payment_method not null,
  amount bigint not null check (amount > 0),
  tendered bigint check (tendered >= 0),
  change bigint check (change >= 0),
  reference text,
  created_at timestamptz not null default now(),
  check (method = 'cash' or (tendered is null and change is null))
);
create index payments_order_id_idx on public.payments (order_id);

alter table public.business enable row level security;
alter table public.stores enable row level security;
alter table public.registers enable row level security;
alter table public.staff enable row level security;
alter table public.staff_stores enable row level security;
alter table public.tax_classes enable row level security;
alter table public.tax_rates enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.stock_levels enable row level security;
alter table public.customers enable row level security;
alter table public.register_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
