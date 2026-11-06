// Vite dev-server plugin: adds the same SMM API proxy during `npm run dev`,
// so the browser never talks directly to the SMM provider (which blocks CORS).
// Uses the shared guard (guard.mjs) for allowlist + DNS/private-IP + timeout +
// size-cap hardening.
import { forwardFetch } from "./guard.mjs";

export default function smmProxyPlugin() {
  return {
    name: "smm-proxy-plugin",
    configureServer(server) {
      server.middlewares.use("/api/smm", async (req, res, next) => {
        if (req.method !== "POST") return next();
        let body = "";
        let size = 0;
        req.on("data", (c) => {
          size += c.length;
          if (size <= 1024 * 1024) body += c;
        });
        req.on("end", async () => {
          const target = String(req.headers["x-target"] || "").trim();
          if (!target) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "X-Target header missing" }));
            return;
          }
          if (size > 1024 * 1024) {
            res.statusCode = 413;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Body too large" }));
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
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(upstream.body);
          } catch (e) {
            res.statusCode = e instanceof TypeError && e.name === "TimeoutError" ? 504 : 502;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Proxy error: " + (e instanceof Error ? e.message : String(e)) }));
          }
        });
      });
    },
  };
}
