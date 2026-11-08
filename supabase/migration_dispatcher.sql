-- ATUL Speed Watch — dispatcher migration (provider delivery, owner_code version)
-- ---------------------------------------------------------------------------
-- order_batches is namespaced by the ACCESS KEY (owner_code), matching the
-- key-login flow — no Supabase Auth required. One row = one provider order
-- (action=add) at time `t`. Idempotency: attempts increments atomically on
-- claim; provider_order_id is written immediately after the main add succeeds;
-- likes tracked separately. A lease (lock_id/locked_at) avoids double-send.

create table if not exists public.order_batches (
  owner_code text not null,
  order_id text not null,
  idx int not null,
  t timestamptz not null,
  quantity int not null,
  likes int not null default 0,
  state text not null default 'scheduled', -- scheduled | sending | sent | failed | cancelled | paused | needs_review
  provider_order_id text,
  provider_status text,
  likes_state text not null default 'none', -- none | sending | sent | failed
  likes_provider_order_id text,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  lock_id text,
  locked_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (owner_code, order_id, idx)
);

alter table public.order_batches enable row level security;

create policy "owner select order_batches" on public.order_batches for select using (true);
create policy "owner insert order_batches" on public.order_batches for insert with check (true);
create policy "owner update order_batches" on public.order_batches for update using (true) with check (true);
create policy "owner delete order_batches" on public.order_batches for delete using (true);

create index if not exists order_batches_due_idx on public.order_batches (state, next_attempt_at) where state in ('scheduled','sending');

-- Atomic claim by owner_code: only claims if scheduled+due, increments attempts,
-- sets a lease. Returns the row or NULL if another worker claimed it.
create or replace function public.claim_batch(p_owner text, p_order text, p_idx int)
returns table (owner_code text, order_id text, idx int, quantity int, likes int, attempts int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease uuid := gen_random_uuid();
begin
  update public.order_batches
     set state = 'sending',
         attempts = attempts + 1,
         lock_id = v_lease,
         locked_at = now(),
         updated_at = now()
   where owner_code = p_owner and order_id = p_order and idx = p_idx
     and state = 'scheduled'
     and next_attempt_at <= now();
  if not found then return; end if;
  return query select b.owner_code, b.order_id, b.idx, b.quantity, b.likes, b.attempts
    from public.order_batches b
   where b.owner_code = p_owner and b.order_id = p_order and b.idx = p_idx and b.lock_id = v_lease;
end;
$$;
revoke all on function public.claim_batch(text,text,int) from public;
grant execute on function public.claim_batch(text,text,int) to service_role, authenticated;

-- Cancel: mark all unsent batches of an order as cancelled.
create or replace function public.cancel_order_batches(p_owner text, p_order text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.order_batches
     set state = 'cancelled', updated_at = now()
   where owner_code = p_owner and order_id = p_order and state in ('scheduled','sending','paused');
end;
$$;
revoke all on function public.cancel_order_batches(text,text) from public;
grant execute on function public.cancel_order_batches(text,text) to service_role, authenticated;
