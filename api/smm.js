// Vercel serverless function: SMM API proxy.
// The browser never talks to the SMM provider directly (it blocks CORS). This
// function forwards the POST to the provider with browser-like headers so
// Cloudflare bot-blocks (404/403) are avoided. Mirrors server.mjs.

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

  // read raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": (req.headers["content-type"] || "application/x-www-form-urlencoded").toString(),
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body,
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: "Proxy upstream error: " + (e instanceof Error ? e.message : String(e)) });
  }
}
