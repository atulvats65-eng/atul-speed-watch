// ATUL Speed Watch — Firebase Cloud Functions.
// Delivery engine that runs on a schedule (every 2 min, like Supabase pg_cron)
// so orders keep advancing even when every device/browser is off. It reads all
// orders from Firestore, recomputes progress from each order's schedule, and
// writes back `delivered` / `statusTxt` / `completedAt`. Browsers then pull this
// state via CloudSync, so the whole panel stays correct everywhere.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { advanceOrder, computeProgress } = require("./delivery");

initializeApp();

const ORDERS = "orders";

async function runDrip() {
  const db = getFirestore();
  const snap = await db.collection(ORDERS).get();
  if (snap.empty) return { total: 0, advanced: 0 };

  const now = Date.now();
  let advanced = 0;
  const batchSize = 400;
  let batch = db.batch();
  let count = 0;

  for (const doc of snap.docs) {
    const o = doc.data();
    const patch = advanceOrder(o, now);
    if (patch) {
      batch.update(doc.ref, patch);
      advanced++;
      count++;
      if (count >= batchSize) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
  }
  if (count > 0) await batch.commit();
  return { total: snap.size, advanced };
}

// Scheduled trigger — every 2 minutes (Supabase pg_cron equivalent).
exports.dripTick = onSchedule("every 2 minutes", async (event) => {
  const r = await runDrip();
  console.log(`drip-tick: ${r.advanced}/${r.total} orders advanced at ${new Date().toISOString()}`);
});

// Manual / external HTTP trigger so you can also hit it with a cron of your own.
exports.dripTickHttp = onRequest({ cors: true }, async (req, res) => {
  try {
    const r = await runDrip();
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// Simple status endpoint for sanity checks.
exports.status = onRequest(async (req, res) => {
  const db = getFirestore();
  const snap = await db.collection(ORDERS).get();
  let pending = 0;
  let completed = 0;
  for (const doc of snap.docs) {
    const o = doc.data();
    if (o.statusTxt === "completed" || o.completedAt) completed++;
    else if (!o.cancelled) pending++;
  }
  res.json({ total: snap.size, pending, completed });
});

// SMM API proxy — mirrors server.mjs / vite-proxy. Firebase Hosting rewrites
// POST /api/smm here, so the browser never talks to the SMM provider directly
// (which blocks CORS). Sends browser-like headers to avoid Cloudflare bot blocks.
exports.smmProxy = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const target = String(req.headers["x-target"] || "").trim();
  if (!target) {
    res.status(400).json({ error: "X-Target header missing" });
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": (req.headers["content-type"] || "application/x-www-form-urlencoded").toString(),
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body,
    });
    const text = await upstream.text();
    res.status(upstream.status).json(parseSafe(text));
  } catch (e) {
    res.status(502).json({ error: "Proxy upstream error: " + (e instanceof Error ? e.message : String(e)) });
  }
});

function parseSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}
