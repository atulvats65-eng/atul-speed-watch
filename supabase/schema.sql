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

-- Services (per key, null = common)
create table if not exists public.services (
  id text primary key,
  owner_code text,
  data jsonb not null,
  updated_at timestamptz not null default now()
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

-- Enable RLS (basic: authenticated users)
alter table public.access_keys enable row level security;
alter table public.users enable row level security;
alter table public.cloud_orders enable row level security;
alter table public.services enable row level security;
alter table public.api_configs enable row level security;

create policy "allow read access_keys" on public.access_keys for select using (true);
create policy "allow read users" on public.users for select using (true);
create policy "allow read cloud_orders" on public.cloud_orders for select using (true);
create policy "allow read services" on public.services for select using (true);
create policy "allow read api_configs" on public.api_configs for select using (true);
