// ATUL Speed Watch — production server.
// - Serves the built app from `dist/`.
// - Provides a server-side proxy for the SMM API (`POST /api/smm`), because the
//   SMM provider does not send CORS headers and blocks direct browser calls.
// Zero runtime dependencies (uses only Node built-ins + global fetch).
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./delivery-engine.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const DIST = join(__dirname, "dist");
const DATA_DIR = join(__dirname, "data");
const engine = createEngine({ dir: DATA_DIR });

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

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  // ---- SMM API proxy ----
  if (req.method === "POST" && req.url.startsWith("/api/smm")) {
    const body = await readBody(req);
    const target = String(req.headers["x-target"] || "").trim();
    if (!target) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "X-Target header missing" }));
      return;
    }
    try {
      // Browser-like headers to avoid Cloudflare bot blocks (e.g. YoYo Media).
      // The SMM provider rejects or 404s requests without a normal User-Agent.
      const upstream = await fetch(target, {
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
      const text = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Proxy upstream error: " + (e instanceof Error ? e.message : String(e)) }));
    }
    return;
  }

  // ---- Orders API (server-side delivery engine) ----
  if (req.url.startsWith("/api/orders")) {
    if (req.method === "GET") {
      engine.advance(Date.now());
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ orders: engine.getOrders() }));
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      try {
        const order = JSON.parse(body);
        if (!order || typeof order.id !== "string") {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Invalid order" }));
          return;
        }
        engine.upsert(order);
        engine.advance(Date.now());
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, id: order.id }));
      } catch (e) {
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
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  // ---- Static files ----
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
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
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": content.length,
  });
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
