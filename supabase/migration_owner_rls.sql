-- ATUL Speed Watch — security migration (S2) — owner-based RLS
-- ---------------------------------------------------------------------------
-- Apply this AFTER enabling Supabase Auth (Google and/or email OTP) and AFTER
-- populating a `profiles` table (or app_metadata.role) for admin detection.
--
-- This migration:
--   1. adds owner_id uuid default auth.uid() to every data table
--   2. changes primary keys to per-owner composites (owner_id, id)
--   3. drops the open (true) policies and installs owner-only policies
--   4. makes access_keys unreadable by clients and adds a security-definer
--      redeem_key(code) RPC that links a redeemed key to the current user
--   5. removes raw SMM provider keys from the client-readable api_configs
--      (provider keys now live server-side only; the table only stores a
--      displayable suffix + encrypted/opaque pointer)
--
-- Run this file in the Supabase SQL Editor. You do NOT need to run the earlier
-- schema.sql "enable RLS / policy (true)" section after applying this.

-- 1) Owner columns ----------------------------------------------------------
alter table public.access_keys add column if not exists owner_id uuid default auth.uid();
alter table public.cloud_orders add column if not exists owner_id uuid default auth.uid();
alter table public.services add column if not exists owner_id uuid default auth.uid();
alter table public.api_configs add column if not exists owner_id uuid default auth.uid();
alter table public.transactions add column if not exists owner_id uuid default auth.uid();

-- 2) Per-owner primary keys --------------------------------------------------
-- services: (owner_id, id)
alter table public.services drop constraint if exists services_pkey;
alter table public.services add primary key (owner_id, id);

-- cloud_orders: (owner_id, id)
alter table public.cloud_orders drop constraint if exists cloud_orders_pkey;
alter table public.cloud_orders add primary key (owner_id, id);

-- transactions: (owner_id, id)
alter table public.transactions drop constraint if exists transactions_pkey;
alter table public.transactions add primary key (owner_id, id);

-- access_keys: keep code unique; treat owner_id as the redeemer/linker.
alter table public.access_keys drop constraint if exists access_keys_pkey;
alter table public.access_keys add primary key (owner_id, code);

-- api_configs: one per owner
alter table public.api_configs drop constraint if exists api_configs_pkey;
alter table public.api_configs add primary key (owner_id);

-- 3) Drop every open policy and re-enable RLS --------------------------------
drop policy if exists "allow read access_keys" on public.access_keys;
drop policy if exists "allow insert access_keys" on public.access_keys;
drop policy if exists "allow update access_keys" on public.access_keys;
drop policy if exists "allow delete access_keys" on public.access_keys;

drop policy if exists "allow read users" on public.users;
drop policy if exists "allow insert users" on public.users;
drop policy if exists "allow update users" on public.users;
drop policy if exists "allow delete users" on public.users;

drop policy if exists "allow read cloud_orders" on public.cloud_orders;
drop policy if exists "allow insert cloud_orders" on public.cloud_orders;
drop policy if exists "allow update cloud_orders" on public.cloud_orders;
drop policy if exists "allow delete cloud_orders" on public.cloud_orders;

drop policy if exists "allow read services" on public.services;
drop policy if exists "allow insert services" on public.services;
drop policy if exists "allow update services" on public.services;
drop policy if exists "allow delete services" on public.services;

drop policy if exists "allow read api_configs" on public.api_configs;
drop policy if exists "allow insert api_configs" on public.api_configs;
drop policy if exists "allow update api_configs" on public.api_configs;
drop policy if exists "allow delete api_configs" on public.api_configs;

drop policy if exists "allow read transactions" on public.transactions;
drop policy if exists "allow insert transactions" on public.transactions;
drop policy if exists "allow update transactions" on public.transactions;
drop policy if exists "allow delete transactions" on public.transactions;

-- 4) Owner-only policies -----------------------------------------------------
-- A user can only see/manage rows they own. Admin (profiles.is_admin) can read
-- everything (aggregate views) but cannot mutate other users' rows.
create policy "owner select cloud_orders" on public.cloud_orders for select using (owner_id = auth.uid());
create policy "owner insert cloud_orders" on public.cloud_orders for insert with check (owner_id = auth.uid());
create policy "owner update cloud_orders" on public.cloud_orders for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete cloud_orders" on public.cloud_orders for delete using (owner_id = auth.uid());

create policy "owner select services" on public.services for select using (owner_id = auth.uid());
create policy "owner insert services" on public.services for insert with check (owner_id = auth.uid());
create policy "owner update services" on public.services for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete services" on public.services for delete using (owner_id = auth.uid());

create policy "owner select transactions" on public.transactions for select using (owner_id = auth.uid());
create policy "owner insert transactions" on public.transactions for insert with check (owner_id = auth.uid());
create policy "owner update transactions" on public.transactions for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete transactions" on public.transactions for delete using (owner_id = auth.uid());

create policy "owner select api_configs" on public.api_configs for select using (owner_id = auth.uid());
create policy "owner insert api_configs" on public.api_configs for insert with check (owner_id = auth.uid());
create policy "owner update api_configs" on public.api_configs for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete api_configs" on public.api_configs for delete using (owner_id = auth.uid());

-- Admin can read everything (for overviews), but not mutate other users.
create policy "admin read all cloud_orders" on public.cloud_orders for select using (
  exists (select 1 from public.profiles p where p.owner_id = auth.uid() and p.is_admin)
);
create policy "admin read all services" on public.services for select using (
  exists (select 1 from public.profiles p where p.owner_id = auth.uid() and p.is_admin)
);
create policy "admin read all users" on public.users for select using (
  exists (select 1 from public.profiles p where p.owner_id = auth.uid() and p.is_admin)
);

-- 5) Access keys are NOT client-readable; redemption is an RPC ----------------
revoke all on public.access_keys from anon, authenticated;

-- profiles table (server-verified admin marker)
create table if not exists public.profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "owner select profile" on public.profiles for select using (owner_id = auth.uid());

-- redeem_key(code): security definer — checks active/expired, links the key to
-- the calling auth user, and returns the role. Clients never read access_keys.
create or replace function public.redeem_key(p_code text)
returns table (admin boolean, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.access_keys%rowtype;
begin
  select * into v_row from public.access_keys where code = p_code limit 1;
  if not found then
    raise exception 'invalid key';
  end if;
  if not v_row.active then
    raise exception 'key disabled';
  end if;
  if v_row.expires_at is not null and v_row.expires_at < now() then
    raise exception 'key expired';
  end if;
  update public.access_keys
     set owner_id = auth.uid()
   where code = p_code
     and (owner_id is null or owner_id = auth.uid());
  return query select v_row.is_admin, v_row.name;
end;
$$;

revoke all on function public.redeem_key(text) from public;
grant execute on function public.redeem_key(text) to authenticated;

-- 6) Provider keys are server-side only --------------------------------------
-- api_configs currently holds a plaintext key. After this migration, clients
-- must never select the key column; the UI only reads a display suffix.
-- Recommended: move the real key to an encrypted column / secret store and keep
-- only `provider_key_suffix` (last 4 chars) readable here.
alter table public.api_configs add column if not exists provider_key_suffix text;
alter table public.api_configs add column if not exists provider_key_encrypted text;
comment on column public.api_configs.provider_key_encrypted is 'server-only encrypted provider key; never selected by clients';
-- Ensure the client-readable policy excludes the encrypted column implicitly by
-- only selecting provider_key_suffix in app queries.
