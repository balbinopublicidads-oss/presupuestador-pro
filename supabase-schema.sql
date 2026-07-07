-- Presupuestador Pro — esquema inicial de base de datos
-- Pegar esto entero en Supabase > SQL Editor > New query > Run

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ---- Negocios (1 por usuario) ----
create table businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  name text not null,
  cuit text,
  phone text,
  email text,
  address text,
  rubro text,
  logo_url text,
  payment_terms text,
  next_num integer not null default 1,
  iva_default numeric not null default 21,
  currency text not null default 'ARS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Presupuestos ----
create table quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  number text not null,
  date date not null default current_date,
  validity_days integer not null default 7,
  client_name text,
  client_phone text,
  client_address text,
  items jsonb not null default '[]'::jsonb,
  iva_enabled boolean not null default true,
  iva_rate numeric not null default 21,
  discount numeric not null default 0,
  payment_terms text,
  notes text,
  status text not null default 'pendiente',
  delivery_date date,
  template_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Catálogo de precios reutilizable ----
create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  unit text not null default 'un',
  price numeric not null default 0,
  category text,
  created_at timestamptz not null default now()
);

-- ---- Seguridad: cada usuario solo ve y edita SUS propios datos ----
alter table businesses enable row level security;
alter table quotes enable row level security;
alter table catalog_items enable row level security;

create policy "businesses: owner access" on businesses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "quotes: owner access" on quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "catalog_items: owner access" on catalog_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- Índices para que las consultas sean rápidas ----
create index quotes_user_id_idx on quotes(user_id);
create index catalog_items_user_id_idx on catalog_items(user_id);
