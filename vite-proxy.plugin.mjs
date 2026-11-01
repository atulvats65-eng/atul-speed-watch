// Vite dev-server plugin: adds the same SMM API proxy during `npm run dev`,
// so the browser never talks directly to the SMM provider (which blocks CORS).
export default function smmProxyPlugin() {
  return {
    name: "smm-proxy-plugin",
    configureServer(server) {
      server.middlewares.use("/api/smm", async (req, res, next) => {
        if (req.method !== "POST") return next();
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          const target = String(req.headers["x-target"] || "").trim();
          if (!target) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "X-Target header missing" }));
            return;
          }
          try {
            const upstream = await fetch(target, {
              method: "POST",
              headers: { "Content-Type": req.headers["content-type"] || "application/x-www-form-urlencoded" },
              body,
            });
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(text);
          } catch (e) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Proxy upstream error: " + (e instanceof Error ? e.message : String(e)) }));
          }
        });
      });
    },
  };
}
