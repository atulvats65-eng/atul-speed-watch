// ATUL Speed Watch — dispatcher (Phase 2 / R1)
// ---------------------------------------------------------------------------
// Supabase Edge Function invoked by pg_cron (every 30–60s). It:
//   1. finds due, unsent batches in order_batches
//   2. atomically claims each (scheduled -> sending, attempts+1) so a batch is
//      never sent twice, even if two workers run
//   3. sends each batch as its own provider order (action=add) using the owner's
//      provider key (read server-side from api_configs)
//   4. records providerOrderId / status, or marks the batch failed permanently
//      (insufficient balance, invalid link, min-max) after maxAttempts
//
// Runs with the service-role key (bypasses RLS). The browser never calls the
// provider and never holds the key.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_ATTEMPTS = Number(Deno.env.get("DISPATCH_MAX_ATTEMPTS") || 3);
const PROVIDER_TIMEOUT_MS = 10_000;
const BATCH_LIMIT = Number(Deno.env.get("DISPATCH_BATCH_LIMIT") || 200);

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

async function assertSafeProviderUrl(url: string, allowedHosts: string[]) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("only https");
  if (!allowedHosts.includes(u.hostname.toLowerCase())) throw new Error("host not allowed");
  const addrs = await Deno.resolveDns(u.hostname, "A");
  for (const ip of addrs) if (isPrivate(ip)) throw new Error("private ip");
}

async function getProviderConfig(ownerId: string) {
  const { data } = await sb
    .from("api_configs")
    .select("url, key, provider_key_encrypted, likes_service_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data) return null;
  // Prefer the encrypted server-side key; fall back to legacy plaintext.
  const key = data.provider_key_encrypted || data.key;
  if (!key) return null;
  return { url: data.url, key, likesServiceId: data.likes_service_id };
}

async function getOrderData(ownerId: string, orderId: string) {
  const { data } = await sb
    .from("cloud_orders")
    .select("data")
    .eq("owner_id", ownerId)
    .eq("id", orderId)
    .maybeSingle();
  return data?.data ?? null;
}

// Atomic claim: update only when still scheduled; returns the row or null if
// another worker already claimed it.
async function claimBatch(ownerId: string, orderId: string, idx: number) {
  const { data } = await sb
    .from("order_batches")
    .update({ state: "sending", attempts: 0, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("order_id", orderId)
    .eq("idx", idx)
    .eq("state", "scheduled")
    .select("idx, quantity, likes, attempts")
    .maybeSingle();
  return data;
}

async function sendBatch(config: { url: string; key: string }, order: any, batch: any, likesServiceId?: string) {
  const allowedHosts = (Deno.env.get("PROVIDER_ALLOW_HOSTS") || "yoyomedia.in")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  await assertSafeProviderUrl(config.url, allowedHosts);

  const post = (params: Record<string, string>) =>
    fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
      body: new URLSearchParams({ key: config.key, ...params }).toString(),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

  const res = await post({
    action: "add",
    service: order.providerServiceId,
    link: order.link,
    quantity: String(batch.quantity),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { ok: false, error: String(parsed?.error || `HTTP ${res.status}`) };
  }
  const providerOrderId = parsed?.order != null ? String(parsed.order) : undefined;

  // Bonus likes ride as a separate provider order when a likes service is set.
  if (likesServiceId && batch.likes > 0) {
    const likeRes = await post({
      action: "add",
      service: likesServiceId,
      link: order.link,
      quantity: String(batch.likes),
    });
    const likeText = await likeRes.text();
    let likeParsed: any = null;
    try {
      likeParsed = JSON.parse(likeText);
    } catch {
      /* ignore */
    }
    if (!likeRes.ok && likeParsed?.error) {
      return { ok: false, error: `likes: ${likeParsed.error}` };
    }
  }

  return { ok: true, providerOrderId };
}

async function processBatch(b: { owner_id: string; order_id: string; idx: number }) {
  const cfg = await getProviderConfig(b.owner_id);
  if (!cfg) {
    // No provider config for this owner → nothing to send. Leave the batch
    // scheduled so it is retried once a config appears.
    return;
  }
  const order = await getOrderData(b.owner_id, b.order_id);
  if (!order) {
    await sb
      .from("order_batches")
      .update({ state: "failed", last_error: "order missing", updated_at: new Date().toISOString() })
      .eq("owner_id", b.owner_id)
      .eq("order_id", b.order_id)
      .eq("idx", b.idx);
    return;
  }
  const batch = await claimBatch(b.owner_id, b.order_id, b.idx);
  if (!batch) return; // another worker claimed it first

  const mark = (state: string, lastError: string | null) =>
    sb
      .from("order_batches")
      .update({ state, last_error: lastError, updated_at: new Date().toISOString() })
      .eq("owner_id", b.owner_id)
      .eq("order_id", b.order_id)
      .eq("idx", b.idx);

  try {
    const result = await sendBatch(cfg, order, batch, cfg.likesServiceId);
    if (result.ok) {
      await mark("sent", null);
      await sb
        .from("order_batches")
        .update({ provider_order_id: result.providerOrderId, provider_status: "processing" })
        .eq("owner_id", b.owner_id)
        .eq("order_id", b.order_id)
        .eq("idx", b.idx);
    } else if (batch.attempts + 1 >= MAX_ATTEMPTS) {
      await mark("failed", result.error);
    } else {
      // retry later (leave scheduled)
      await mark("scheduled", result.error);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (batch.attempts + 1 >= MAX_ATTEMPTS) await mark("failed", msg);
    else await mark("scheduled", msg);
  }
}

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { data: due } = await sb
    .from("order_batches")
    .select("owner_id, order_id, idx")
    .in("state", ["scheduled", "sending"])
    .lte("t", new Date().toISOString())
    .limit(BATCH_LIMIT);

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }));
  }

  let processed = 0;
  for (const b of due) {
    await processBatch(b);
    processed++;
  }

  return new Response(JSON.stringify({ ok: true, processed }), { status: 200 });
});

