-- ATUL Speed Watch — dispatcher migration (Phase 2 / R1)
-- ---------------------------------------------------------------------------
-- Add a per-owner `order_batches` table. Each row is ONE provider order
-- (action=add) that the dispatcher will send at its scheduled time `t`.
--
-- The browser computes the batch plan (schedule merged to the provider's
-- per-service minimum via mergeToMin) and writes these rows at order creation.
-- The server-side dispatcher (Supabase Edge Function, invoked by pg_cron every
-- 30–60 s) reads due, unsent batches and sends them using the owner's provider
-- key (stored server-side). Idempotency: a batch is marked 'sending' (with an
-- attempt count) before the provider call, and reconciled afterwards, so it is
-- never sent twice and never silently skipped.

create table if not exists public.order_batches (
  owner_id uuid not null default auth.uid() references public.profiles(owner_id) on delete cascade,
  order_id text not null,
  idx int not null,
  t timestamptz not null,
  quantity int not null,
  likes int not null default 0,
  state text not null default 'scheduled', -- scheduled | sending | sent | failed | cancelled
  provider_order_id text,
  provider_status text,
  attempts int not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, order_id, idx)
);

-- Owner-only access via the client (the dispatcher runs with the service-role
-- key and bypasses RLS).
alter table public.order_batches enable row level security;

create policy "owner select order_batches" on public.order_batches for select using (owner_id = auth.uid());
create policy "owner insert order_batches" on public.order_batches for insert with check (owner_id = auth.uid());
create policy "owner update order_batches" on public.order_batches for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete order_batches" on public.order_batches for delete using (owner_id = auth.uid());

-- Fast lookup for the dispatcher: due scheduled batches.
create index if not exists order_batches_due_idx
  on public.order_batches (state, t) where state in ('scheduled','sending');

-- ---------------------------------------------------------------------------
-- pg_cron scheduling (run in the SQL editor after deploying the Edge Function)
-- ---------------------------------------------------------------------------
-- Requires the pg_cron extension:
--   create extension if not exists pg_cron;
--
-- Invoke the dispatcher every 30 seconds (adjust schedule as needed):
--   select cron.schedule('dispatch', '*/30 * * * * *', $$
--     select net.http_post(
--       url := 'https://<project-ref>.supabase.co/functions/v1/dispatch',
--       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('request.jwt.claim.access_token')),
--       timeout_milliseconds := 60000
--     );
--   $$);
-- (Or use a custom cron on your host to POST to the function with a service-role
-- Authorization header.)
