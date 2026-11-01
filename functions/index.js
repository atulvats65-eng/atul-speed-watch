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
