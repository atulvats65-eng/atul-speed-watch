// Vercel serverless function: SMM API proxy.
// The browser never talks to the SMM provider directly (it blocks CORS). This
// function forwards the POST to the provider with browser-like headers so
// Cloudflare bot-blocks (404/403) are avoided. Uses the shared guard (guard.mjs)
// for allowlist + DNS/private-IP + timeout + size-cap hardening.

import { forwardFetch } from "../guard.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const target = String(req.headers["x-target"] || "").trim();
  if (!target) {
    res.status(400).json({ error: "X-Target header missing" });
    return;
  }

  // read raw body (capped)
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      res.status(413).json({ error: "Body too large" });
      return;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");

  try {
    const upstream = await forwardFetch(target, {
      method: "POST",
      headers: {
        "Content-Type": (req.headers["content-type"] || "application/x-www-form-urlencoded").toString(),
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body,
    });

    let data;
    try {
      data = JSON.parse(upstream.body.toString("utf8"));
    } catch {
      data = { raw: upstream.body.toString("utf8").slice(0, 300) };
    }
    res.status(upstream.status).json(data);
  } catch (e) {
    const status = e instanceof TypeError && e.name === "TimeoutError" ? 504 : 502;
    res.status(status).json({ error: "Proxy error: " + (e instanceof Error ? e.message : String(e)) });
  }
}

