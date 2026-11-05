import type { ServiceKind } from "./engine";

// Roughly guess a service kind from the provider's name/type.
export function guessKind(name: string): ServiceKind {
  const n = name.toLowerCase();
  if (n.includes("like")) return "likes";
  if (n.includes("follow") || n.includes("subscri")) return "followers";
  if (n.includes("comment")) return "comments";
  return "views";
}

// SMM provider client. All calls go through our server-side proxy (/api/smm)
// because SMM providers block direct browser calls (CORS). YoYo Media / SMM
// panels use form-urlencoded POST bodies. The URL is auto-tried as-is and with
// a `/v2` suffix if it doesn't already end with one.
export type SmmResult = {
  ok: boolean;
  status: number;
  error?: string;
  data: unknown;
  targetUsed: string;
};

function buildCandidates(baseUrl: string): string[] {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return [];
  const candidates = [base];
  if (!/\/v2$/i.test(base)) candidates.push(base + "/v2");
  return candidates;
}

export async function providerCall(
  baseUrl: string,
  key: string,
  action: string,
  params: Record<string, string> = {},
): Promise<SmmResult> {
  const candidates = buildCandidates(baseUrl);
  const body = new URLSearchParams({ key, action, ...params }).toString();

  let lastErr = "Koi response nahi mila.";

  for (const target of candidates) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch("/api/smm", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Target": target,
        },
        body,
        signal: ctrl.signal,
      });
      // If the proxy is missing (e.g. raw vite dev without server.mjs), fall
      // back to a direct call so connect still works.
      if (!res.ok && res.status === 404) {
        const direct = await fetch(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          body,
          signal: ctrl.signal,
        });
        const t = await direct.text();
        let d: unknown = null;
        try {
          d = JSON.parse(t);
        } catch {
          /* ignore */
        }
        return { ok: direct.ok, status: direct.status, data: d, targetUsed: target };
      }
      const text = await res.text();
      let data: unknown = null;
      let error: string | undefined = undefined;
      if (text.trim()) {
        try {
          const parsed = JSON.parse(text);
          data = parsed;
          if (parsed && typeof (parsed as { error?: unknown }).error === "string") {
            error = (parsed as { error: string }).error;
          }
        } catch {
          /* non-JSON body */
        }
      }
      if (!error && res.ok) {
        return { ok: true, status: res.status, data, targetUsed: target };
      }
      lastErr = `${error ? `Incorrect: ${error}` : `HTTP ${res.status}`} @ ${target}`;
    } catch (e) {
      lastErr = `@ ${target}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(to);
    }
  }

  return { ok: false, status: 0, error: lastErr, data: null, targetUsed: candidates[candidates.length - 1] ?? "" };
}

export type BalanceInfo = { text: string; currency: string; value: number } | null;

// Normalizes an SMM provider balance response into a display string, converting
// USD/USDT to a rough INR figure (≈ ₹) for easier reading. A currency is treated
// as USD only when the provider explicitly says so — never guessed from a small
// number (a ₹3 balance is not a dollar balance).
export function parseBalance(data: unknown): BalanceInfo {
  const d = (data ?? {}) as { balance?: string | number; currency?: string };
  if (d.balance === undefined || d.balance === null) return null;
  const b = Number(d.balance);
  if (Number.isNaN(b)) return null;
  const cur = (d.currency ?? "").toUpperCase();
  const isUsd = cur === "USD" || cur === "USDT";
  // Rough, best-effort conversion rate (used only when provider reports USD).
  const inr = isUsd ? (b * 94.6).toFixed(2) : null;
  const text = inr
    ? `${d.balance} ${cur} (≈ ₹${inr})`
    : `${d.balance} ${cur || "INR"}`;
  return { text, currency: cur || (isUsd ? "USD" : "INR"), value: b };
}

// Place a real order with the SMM provider (action=add). Returns the provider's
// order id when it succeeds, so the local order can reference the real one.
export type PlaceOrderResult = { ok: boolean; orderId?: string; error?: string };

export async function providerPlaceOrder(
  baseUrl: string,
  key: string,
  opts: { service: string; link: string; quantity: number },
): Promise<PlaceOrderResult> {
  const r = await providerCall(baseUrl, key, "add", {
    service: opts.service,
    link: opts.link,
    quantity: String(opts.quantity),
  });
  if (!r.ok) return { ok: false, error: r.error };
  const d = r.data as { order?: string | number } | null;
  const orderId = d?.order != null ? String(d.order) : undefined;
  return { ok: true, orderId };
}
