// ATUL Speed Watch — dispatcher (owner_code version)
// ---------------------------------------------------------------------------
// Supabase Edge Function invoked by pg_cron every 30–60s. Sends each scheduled
// batch as its own provider order (action=add) at its scheduled time. All data
// is namespaced by the access key (owner_code), matching the key-login flow.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("DISPATCH_SERVICE_KEY")!;
const MAX_ATTEMPTS = Number(Deno.env.get("DISPATCH_MAX_ATTEMPTS") || 3);
const LEASE_MS = Number(Deno.env.get("DISPATCH_LEASE_MS") || 5 * 60_000);
const PROVIDER_TIMEOUT_MS = 10_000;
const BATCH_LIMIT = Number(Deno.env.get("DISPATCH_BATCH_LIMIT") || 200);
const PROVIDER_DELAY_MS = 300;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function isPrivate(ip: string): boolean {
  const norm = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (norm.includes(":")) {
    const low = norm.toLowerCase();
    return low === "::1" || low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe80");
  }
  const p = norm.split(".").map(Number);
  if (p.length !== 4) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function assertSafeUrl(url: string, allowedHosts: string[]) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("only https");
  if (!allowedHosts.includes(u.hostname.toLowerCase())) throw new Error("host not allowed");
  const addrs = await Deno.resolveDns(u.hostname, "A");
  for (const ip of addrs) if (isPrivate(ip)) throw new Error("private ip");
}

async function getProviderConfig(ownerCode: string) {
  // Shared config: always read the global row so per-order owner_code never
  // causes the provider key to be missed. Only select columns that exist.
  const { data } = await sb
    .from("api_configs")
    .select("url, key")
    .eq("owner_code", "global")
    .maybeSingle();
  if (!data) return null;
  const key = data.key;
  if (!key) return null;
  return { url: data.url, key, likesServiceId: undefined, balance: undefined };
}

async function getOrderData(ownerCode: string, orderId: string) {
  const { data } = await sb
    .from("cloud_orders")
    .select("data")
    .eq("owner_code", ownerCode)
    .eq("id", orderId)
    .maybeSingle();
  return data?.data ?? null;
}

function numericBalance(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function providerPost(config: { url: string; key: string }, params: Record<string, string>) {
  const allowedHosts = (Deno.env.get("PROVIDER_ALLOW_HOSTS") || "yoyomedia.in")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  await assertSafeUrl(config.url, allowedHosts);
  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    },
    body: new URLSearchParams({ key: config.key, ...params }).toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) {
      const u = new URL(loc, config.url);
      await assertSafeUrl(u.toString(), allowedHosts);
      return providerFetchAt(u.toString(), config, params);
    }
  }
  return providerFetchAt(config.url, config, params, res);
}

async function providerFetchAt(url: string, config: { url: string; key: string }, params: Record<string, string>, existing?: Response) {
  const res = existing ?? (await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    },
    body: new URLSearchParams({ key: config.key, ...params }).toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  }));
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) return { ok: false, error: String(parsed?.error || `HTTP ${res.status}`) };
  return { ok: true, parsed };
}

async function sendBatch(config: any, order: any, batch: any) {
  const main = await providerPost(config, {
    action: "add",
    service: order.providerServiceId,
    link: order.link,
    quantity: String(batch.quantity),
  });
  if (!main.ok) return { ok: false, error: main.error, providerOrderId: undefined, likes: null };
  const providerOrderId = main.parsed?.order != null ? String(main.parsed.order) : undefined;

  let likes = null;
  if (config.likesServiceId && batch.likes > 0) {
    const likeRes = await providerPost(config, {
      action: "add",
      service: config.likesServiceId,
      link: order.link,
      quantity: String(batch.likes),
    });
    likes = {
      ok: likeRes.ok,
      error: likeRes.error,
      orderId: likeRes.ok && likeRes.parsed?.order != null ? String(likeRes.parsed.order) : undefined,
    };
  }
  return { ok: true, providerOrderId, likes };
}

async function mark(ownerCode: string, orderId: string, idx: number, patch: Record<string, unknown>) {
  await sb.from("order_batches").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("owner_code", ownerCode).eq("order_id", orderId).eq("idx", idx);
}

async function processBatch(b: { owner_code: string; order_id: string; idx: number }) {
  const cfg = await getProviderConfig(b.owner_code);
  if (!cfg) return;

  const order = await getOrderData(b.owner_code, b.order_id);
  if (!order) {
    await mark(b.owner_code, b.order_id, b.idx, { state: "failed", last_error: "order missing" });
    return;
  }
  if (order.cancelled) {
    await mark(b.owner_code, b.order_id, b.idx, { state: "cancelled", last_error: "order cancelled" });
    return;
  }

  const bal = numericBalance(cfg.balance);
  if (bal !== undefined && bal < 0) {
    await mark(b.owner_code, b.order_id, b.idx, { state: "paused", last_error: "insufficient balance" });
    return;
  }

  // Simple claim: read the batch directly (must still be scheduled). No lock /
  // verify round-trip — we mark it sending after we send. This avoids any
  // lock_id/verify mismatch that was silently skipping batches.
  const { data: verify } = await sb
    .from("order_batches")
    .select("idx, quantity, likes, attempts")
    .eq("owner_code", b.owner_code)
    .eq("order_id", b.order_id)
    .eq("idx", b.idx)
    .eq("state", "scheduled")
    .maybeSingle();
  if (!verify) {
    console.error("DISPATCH not scheduled", b.owner_code, b.order_id, b.idx);
    return;
  }

  const attempt = verify.attempts || 0;
  try {
    const result = await sendBatch(cfg, order, verify);
    if (result.providerOrderId) {
      await mark(b.owner_code, b.order_id, b.idx, { provider_order_id: result.providerOrderId });
    }
    if (!result.ok) {
      if (attempt >= MAX_ATTEMPTS) {
        const permanent = /insufficient balance|invalid link|disabled|min|max/i.test(result.error || "");
        await mark(b.owner_code, b.order_id, b.idx, { state: permanent ? "paused" : "failed", last_error: result.error });
      } else {
        await mark(b.owner_code, b.order_id, b.idx, { state: "scheduled", last_error: result.error, next_attempt_at: new Date(Date.now() + attempt * 60_000).toISOString() });
      }
      return;
    }

    const patch: Record<string, unknown> = { state: "sent", last_error: null };
    if (result.likes) {
      if (result.likes.ok) {
        patch.likes_state = "sent";
        patch.likes_provider_order_id = result.likes.orderId;
      } else {
        patch.likes_state = "failed";
        patch.likes_provider_order_id = result.likes.orderId;
        patch.last_error = "likes: " + (result.likes.error || "unknown");
      }
    }
    await mark(b.owner_code, b.order_id, b.idx, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (attempt >= MAX_ATTEMPTS) await mark(b.owner_code, b.order_id, b.idx, { state: "failed", last_error: msg });
    else await mark(b.owner_code, b.order_id, b.idx, { state: "scheduled", last_error: msg, next_attempt_at: new Date(Date.now() + attempt * 60_000).toISOString() });
  }
}

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { data: stuck } = await sb
    .from("order_batches")
    .select("owner_code, order_id, idx, provider_order_id")
    .eq("state", "sending")
    .lt("locked_at", new Date(Date.now() - LEASE_MS).toISOString());
  if (stuck) {
    for (const s of stuck) {
      if (s.provider_order_id) {
        await mark(s.owner_code, s.order_id, s.idx, { state: "sent", last_error: "reclaimed (provider confirmed)" });
      } else {
        await mark(s.owner_code, s.order_id, s.idx, { state: "needs_review", last_error: "crashed during send; status unknown" });
      }
    }
  }

  const { data: due } = await sb
    .from("order_batches")
    .select("owner_code, order_id, idx")
    .eq("state", "scheduled")
    .lte("t", new Date().toISOString())
    .lte("next_attempt_at", new Date().toISOString())
    .limit(BATCH_LIMIT);

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }));
  }

  let processed = 0;
  for (const b of due) {
    await processBatch(b);
    processed++;
    if (PROVIDER_DELAY_MS > 0) await new Promise((r) => setTimeout(r, PROVIDER_DELAY_MS));
  }

  return new Response(JSON.stringify({ ok: true, processed }), { status: 200 });
});
