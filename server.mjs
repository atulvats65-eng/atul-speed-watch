// ATUL Speed Watch — production server.
// - Serves the built app from `dist/`.
// - Provides a server-side proxy for the SMM API (`POST /api/smm`), because the
//   SMM provider does not send CORS headers and blocks direct browser calls.
// Zero runtime dependencies (uses only Node built-ins + global fetch).
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./delivery-engine.mjs";
import { forwardFetch, MAX_BODY } from "./guard.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const DIST = join(__dirname, "dist");
const DATA_DIR = join(__dirname, "data");
const engine = createEngine({ dir: DATA_DIR });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  // ---- SMM API proxy ---- (guarded: allowlist + DNS/private-IP + timeout + cap)
  if (req.method === "POST" && req.url.startsWith("/api/smm")) {
    let body = "";
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Body too large" }));
      return;
    }
    const target = String(req.headers["x-target"] || "").trim();
    if (!target) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "X-Target header missing" }));
      return;
    }
    try {
      const upstream = await forwardFetch(target, {
        method: "POST",
        headers: {
          "Content-Type": req.headers["content-type"] || "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        body,
      });
      res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(upstream.body);
    } catch (e) {
      const status = e instanceof TypeError && e.name === "TimeoutError" ? 504 : 502;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Proxy error: " + (e instanceof Error ? e.message : String(e)) }));
    }
    return;
  }

  // ---- Orders API (server-side delivery engine) ---- (gated + validated)
  if (req.url.startsWith("/api/orders")) {
    if (req.method === "GET") {
      engine.advance(Date.now());
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ orders: engine.getOrders() }));
      return;
    }
    if (req.method === "POST") {
      let body = "";
      try {
        body = await readBody(req);
      } catch {
        res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Body too large" }));
        return;
      }
      try {
        const order = JSON.parse(body);
        if (
          !order ||
          typeof order.id !== "string" ||
          typeof order.serviceName !== "string" ||
          !Number.isFinite(order.quantity) ||
          order.quantity <= 0 ||
          typeof order.link !== "string"
        ) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Invalid order body" }));
          return;
        }
        engine.upsert(order);
        engine.advance(Date.now());
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, id: order.id }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
      return;
    }
    if (req.method === "DELETE") {
      const id = decodeURIComponent(req.url.slice("/api/orders/".length));
      engine.remove(id);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, id }));
      return;
    }
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // ---- Static files ---- (HEAD-safe, security headers, hashed-asset caching)
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    pathname = "/";
  }
  if (pathname === "/") pathname = "/index.html";

  let filePath = join(DIST, normalize(pathname));
  const DIST_PREFIX = DIST + sep;
  if (!filePath.startsWith(DIST_PREFIX) && filePath !== DIST) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let isFile = false;
  try {
    isFile = statSync(filePath).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) filePath = join(DIST, "index.html");

  const ext = extname(filePath).toLowerCase();
  let content;
  try {
    content = readFileSync(filePath);
  } catch {
    res.writeHead(500);
    res.end("Internal server error: missing file");
    return;
  }

  // Hashed assets (in /assets/, or index.html) can be cached aggressively; the
  // rest gets a short no-cache default.
  const isAsset = pathname.startsWith("/assets/");
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": content.length,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https: wss://*.supabase.co; font-src 'self' data:",
    "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
  };

  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  res.end(content);
});

server.listen(PORT, () => {
  console.log(`ATUL Speed Watch running at http://localhost:${PORT}`);
  console.log(`SMM API proxy: POST /api/smm (X-Target header => upstream)`);
  console.log(`Orders API + delivery engine: /api/orders (data/orders.json)`);
});

// Background delivery engine: advance progress every 20s so orders keep
// delivering even when no browser/tab is open.
setInterval(() => {
  try {
    engine.advance(Date.now());
  } catch {
    /* ignore */
  }
}, 20_000);
