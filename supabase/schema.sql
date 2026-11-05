-- ATUL Speed Watch — Supabase schema
-- Run this in Supabase SQL Editor.

-- Access keys (admin registered)
create table if not exists public.access_keys (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  note text,
  is_admin boolean not null default false,
  active boolean not null default true,
  duration text not null default 'lifetime',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Users (profile / owner)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  key_code text references public.access_keys(code) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

-- Orders (per key)
create table if not exists public.cloud_orders (
  id text primary key,
  owner_code text references public.access_keys(code) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Services (per key — composite key so different owners can import the same
-- provider service id without overwriting each other)
create table if not exists public.services (
  id text not null,
  owner_code text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_code, id)
);

-- SMM API config (per key)
create table if not exists public.api_configs (
  owner_code text primary key,
  url text,
  key text,
  backup_url text,
  backup_key text,
  updated_at timestamptz not null default now()
);

-- Transactions (per key)
create table if not exists public.transactions (
  id text primary key,
  owner_code text references public.access_keys(code) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Enable RLS (public shared panel: read/write allowed)
alter table public.access_keys enable row level security;
alter table public.users enable row level security;
alter table public.cloud_orders enable row level security;
alter table public.services enable row level security;
alter table public.api_configs enable row level security;
alter table public.transactions enable row level security;

create policy "allow read access_keys" on public.access_keys for select using (true);
create policy "allow read users" on public.users for select using (true);
create policy "allow read cloud_orders" on public.cloud_orders for select using (true);
create policy "allow read services" on public.services for select using (true);
create policy "allow read api_configs" on public.api_configs for select using (true);
create policy "allow read transactions" on public.transactions for select using (true);

create policy "allow insert access_keys" on public.access_keys for insert with check (true);
create policy "allow update access_keys" on public.access_keys for update using (true) with check (true);
create policy "allow delete access_keys" on public.access_keys for delete using (true);

create policy "allow insert users" on public.users for insert with check (true);
create policy "allow update users" on public.users for update using (true) with check (true);
create policy "allow delete users" on public.users for delete using (true);

create policy "allow insert cloud_orders" on public.cloud_orders for insert with check (true);
create policy "allow update cloud_orders" on public.cloud_orders for update using (true) with check (true);
create policy "allow delete cloud_orders" on public.cloud_orders for delete using (true);

create policy "allow insert services" on public.services for insert with check (true);
create policy "allow update services" on public.services for update using (true) with check (true);
create policy "allow delete services" on public.services for delete using (true);

create policy "allow insert api_configs" on public.api_configs for insert with check (true);
create policy "allow update api_configs" on public.api_configs for update using (true) with check (true);
create policy "allow delete api_configs" on public.api_configs for delete using (true);

create policy "allow insert transactions" on public.transactions for insert with check (true);
create policy "allow update transactions" on public.transactions for update using (true) with check (true);
create policy "allow delete transactions" on public.transactions for delete using (true);
