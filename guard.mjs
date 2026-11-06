// ATUL Speed Watch — shared server-side proxy guard (used by server.mjs,
// api/smm.js, api/og.js and vite-proxy.plugin.mjs).
//
// Hardening (S3):
//  - https only
//  - explicit host allowlist (SMM provider hosts) — anything else is rejected
//  - DNS is resolved and loopback/private/link-local/CGNAT/metadata IPs are
//    rejected (SSRF protection)
//  - bounded timeouts (10s), response body cap (1 MB), fixed method
//  - redirects are re-validated each hop (max 3), never blindly followed
import dns from "node:dns/promises";

const MAX_BODY = 1024 * 1024; // 1 MB
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

// Default SMM provider host(s) allowed out of the box. Operators can extend via
// the PROVIDER_ALLOW_HOSTS env (comma separated). This keeps the panel working
// with its built-in provider without opening an open SSRF proxy.
function allowedHosts() {
  const envHosts = (process.env.PROVIDER_ALLOW_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(["yoyomedia.in", ...envHosts])];
}

function isPrivateIp(ip) {
  const norm = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (norm.includes(":")) {
    const low = norm.toLowerCase();
    if (low === "::1" || low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe80")) return true;
    return false;
  }
  const parts = norm.split(".").map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true; // documentation
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

// Resolve the hostname and reject anything that resolves to a private/loopback
// address. Throws on any unsafe condition.
// `allowlist` may be: an array of allowed hosts, `false` (skip host allowlist
// but still enforce https + DNS/private-IP safety — used by the OG preview which
// must fetch arbitrary social URLs), or omitted (use the default provider list).
export async function assertSafeTarget(urlStr, { allowlist } = {}) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "https:") throw new Error("Only https targets are allowed");

  const host = u.hostname.toLowerCase();
  let list = null;
  if (allowlist !== false) {
    list = allowlist || allowedHosts();
  }
  if (list && !list.includes(host)) throw new Error(`Host not allowed: ${host}`);

  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("DNS resolution failed");
  }
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error(`Target resolves to a private address (${a.address})`);
  }
  return u.toString();
}

// Forward a request to `url`, re-validating each redirect hop. Returns
// { status, headers, body(Buffer), truncated }. Throws on SSRF/timeout/redirects.
// With `allowTruncate` the response is read up to MAX_BODY and sliced instead of
// failing (used by the OG preview, whose HTML can exceed 1 MB).
export async function forwardFetch(url, { method = "POST", headers = {}, body = "", allowlist = null, allowTruncate = false } = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = await assertSafeTarget(current, { allowlist });
    const res = await fetch(safe, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect without location");
      current = new URL(loc, safe).toString();
      continue;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BODY) {
      if (allowTruncate) {
        return { status: res.status, headers: res.headers, body: buf.subarray(0, MAX_BODY), truncated: true };
      }
      throw new Error("Upstream response too large");
    }
    return { status: res.status, headers: res.headers, body: buf, truncated: false };
  }
  throw new Error("Too many redirects");
}

export { MAX_BODY, TIMEOUT_MS };
