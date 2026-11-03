// ATUL Speed Watch — delivery schedule logic shared with the Cloud Function.
// Mirrors the browser-side engine (src/lib/engine.ts) so the server computes the
// exact same progress from createdAt + profile. Kept dependency-free (CommonJS).
// Adapted from delivery-engine.mjs.

const IST = 330 * 60_000;

const PROFILES = {
  safe: { minDrop: 50, maxDrop: 100, minGap: 30, maxGap: 45 },
  normal: { minDrop: 100, maxDrop: 170, minGap: 15, maxGap: 30 },
  turbo: { minDrop: 200, maxDrop: 350, minGap: 8, maxGap: 15 },
  micro: { minDrop: 40, maxDrop: 70, minGap: 5, maxGap: 10 },
  scurve: { minDrop: 100, maxDrop: 170, minGap: 15, maxGap: 30 },
  stealth: { minDrop: 6, maxDrop: 12, minGap: 1, maxGap: 4 },
};

function isNight(t) {
  const h = new Date(t + IST).getUTCHours();
  return h >= 0 && h < 6;
}

function profileParams(o) {
  if (o.profile === "custom") {
    const minDrop = Math.max(FLOOR_CUSTOM, Number(o.cMinDrop) || 100);
    const maxDrop = Math.max(minDrop, Number(o.cMaxDrop) || 170);
    const minGap = Math.max(1, Number(o.cMinGap) || 15);
    const maxGap = Math.max(minGap, Number(o.cMaxGap) || 30);
    return { minDrop, maxDrop, minGap, maxGap };
  }
  return PROFILES[o.profile] || PROFILES.normal;
}

// Hard cap: no single drop may exceed this many units, regardless of profile.
const MAX_DROP = 250;
// Per-profile minimum drop floors (applied inside the specific schedules).
const FLOOR_STEALTH = 100;
const FLOOR_SCURVE = 100;
const FLOOR_CUSTOM = 100;

// Per-profile pace shapes — [endFraction, multiplier] applied to the base drop
// size as the order progresses, so each mode has its own distinct curve.
const SHAPES = {
  safe: [[1, 1]],
  normal: [[0.5, 0.8], [1, 1.2]],
  turbo: [[0.35, 1.9], [0.7, 1.1], [1, 0.45]],
  micro: [[1, 1]],
};

function paceAt(profile, frac) {
  const phases = profile ? SHAPES[profile] : undefined;
  if (!phases) return 1;
  let m = phases[phases.length - 1][1];
  for (let i = 0; i < phases.length; i++) {
    if (frac <= phases[i][0]) {
      m = phases[i][1];
      break;
    }
  }
  return m;
}

const SCURVE_PER_1000 = 30 * 60_000;
const SCURVE_MIN = 15 * 60_000;
const SCURVE_MAX = 6 * 3600_000;
const SCURVE_STEEP = 12;

function sCurveSchedule(o) {
  const quantity = o.quantity;
  const duration = Math.min(SCURVE_MAX, Math.max(SCURVE_MIN, (quantity / 1000) * SCURVE_PER_1000));
  const n = Math.max(10, Math.min(120, Math.floor(duration / (5 * 60_000))));
  const raw = (x) => 1 / (1 + Math.exp(-SCURVE_STEEP * (x - 0.5)));
  const r0 = raw(0);
  const r1 = raw(1);
  const frac = (x) => (raw(x) - r0) / (r1 - r0);
  const ticks = [];
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const x = i / n;
    const cum = Math.round(frac(x) * quantity);
    const amount = cum - prev;
    if (amount > 0) {
      const t = o.createdAt + Math.round(x * duration);
      const nightSlow = o.night === "slow" && isNight(t) ? 0.5 : 1;
      const drop = Math.min(MAX_DROP, Math.max(FLOOR_SCURVE, Math.round(amount * nightSlow)));
      prev += drop;
      ticks.push({
        t,
        amount: drop,
        likes: Math.round((drop / quantity) * (o.likes || 0)),
        cumulative: Math.min(prev, quantity),
      });
    }
  }
  if (ticks.length > 0) ticks[ticks.length - 1].cumulative = quantity;
  return ticks;
}

const STEALTH_PER_1000 = 40 * 60_000;
const STEALTH_MIN = 20 * 60_000;
const STEALTH_MAX = 8 * 3600_000;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stealthSchedule(o) {
  const q = o.quantity;
  const duration = Math.min(STEALTH_MAX, Math.max(STEALTH_MIN, (q / 1000) * STEALTH_PER_1000));
  const rnd = mulberry32((o.createdAt || 0) ^ 0x5f3759df);

  const batches = Math.max(20, Math.min(500, Math.round(q / 18)));
  const sizes = [];
  let raw = 0;
  for (let i = 0; i < batches; i++) {
    const s = 6 + rnd() * 90;
    sizes.push(s);
    raw += s;
  }
  const scale = q / raw;

  const sessionCount = Math.max(3, Math.min(10, Math.round(batches / 55)));
  const centers = [];
  for (let s = 0; s < sessionCount; s++) {
    centers.push((s + 0.15 + rnd() * 0.7) / (sessionCount - 0.35));
  }
  centers.sort((a, b) => a - b);

  const ticks = [];
  let delivered = 0;
  for (let i = 0; i < batches; i++) {
    const p = i / batches;
    let si = 0;
    let best = Infinity;
    for (let s = 0; s < centers.length; s++) {
      const d = Math.abs(centers[s] - p);
      if (d < best) {
        best = d;
        si = s;
      }
    }
    const off = (rnd() + rnd() + rnd() - 1.5) * 0.04;
    const frac = Math.max(0.01, Math.min(0.99, centers[si] + off));
    let t = o.createdAt + Math.round(frac * duration);

    if (isNight(t)) {
      const d = new Date(t + IST);
      d.setUTCHours(7, 0, 0, 0);
      let nt = d.getTime() - IST;
      if (nt <= t) nt += 86_400_000;
      const f2 = (nt - o.createdAt) / duration;
      if (f2 > 0 && f2 < 1) t = nt;
    }

    let amount = Math.round(sizes[i] * scale);
    if (delivered + amount > q) amount = q - delivered;
    if (amount <= 0) break;

    const nightSlow = o.night === "slow" && isNight(t) ? 0.5 : 1;
    const drop = Math.min(MAX_DROP, Math.max(FLOOR_STEALTH, Math.round(amount * nightSlow)));
    delivered += drop;
    if (delivered > q) delivered = q;

    ticks.push({
      t,
      amount: drop,
      likes: Math.round((drop / q) * (o.likes || 0)),
      cumulative: Math.min(delivered, q),
    });
    if (delivered >= q) break;
  }
  ticks.sort((a, b) => a.t - b.t);
  if (ticks.length > 0) ticks[ticks.length - 1].cumulative = q;
  return ticks;
}

function schedule(o) {
  // S-Curve always keeps its sigmoid shape — manual duration never overrides it.
  if (o.profile === "scurve") return sCurveSchedule(o);
  if (o.profile === "stealth") return stealthSchedule(o);
  const p = profileParams(o);
  const ticks = [];
  let t = o.createdAt;
  let cumulative = 0;
  let rnd = 7;
  while (cumulative < o.quantity) {
    rnd = (rnd * 9301 + 49297) % 233280;
    const r = rnd / 233280;
    let gapMin = p.minGap;
    let gapMax = p.maxGap;
    let amountMin = p.minDrop;
    let amountMax = p.maxDrop;
    if (o.humanize) {
      if (r < 0.08) {
        gapMin += 40;
        gapMax += 90;
      } else if (r < 0.2) {
        gapMin = Math.max(1, p.minGap / 4);
        gapMax = Math.max(gapMin + 1, p.minGap / 2);
        amountMax = Math.round(p.maxDrop * 1.6);
      } else {
        gapMin *= 0.7;
        gapMax *= 1.5;
      }
    }
    t += (gapMin + r * (gapMax - gapMin)) * 60000;
    const frac = Math.min(1, cumulative / o.quantity);
    const amount = Math.round((amountMin + r * (amountMax - amountMin)) * paceAt(o.profile, frac));
    if (amount <= 0) break;
    const nightSlow = o.night === "slow" && isNight(t) ? 0.5 : 1;
    let drop = Math.min(MAX_DROP, Math.max(1, Math.round(amount * nightSlow)));
    if (o.profile === "normal") drop = Math.min(170, Math.max(100, drop));
    if (o.profile === "turbo") drop = Math.max(100, drop);
    cumulative += drop;
    ticks.push({
      t,
      amount: drop,
      likes: Math.round((drop / o.quantity) * (o.likes || 0)),
      cumulative: Math.min(cumulative, o.quantity),
    });
  }
  if (ticks.length > 0) ticks[ticks.length - 1].cumulative = o.quantity;
  return ticks;
}

function computeProgress(o, now) {
  const ticks = schedule(o);
  const done = ticks.filter((k) => k.t <= now);
  const cancelled = !!o.cancelled;
  const last = done[done.length - 1];
  const delivered = cancelled ? 0 : Math.min(o.quantity, last ? last.cumulative : 0);
  const status = cancelled
    ? "cancelled"
    : delivered >= o.quantity
      ? "completed"
      : delivered === 0
        ? "pending"
        : "in progress";
  return { delivered, status, remains: o.quantity - delivered };
}

function advanceOrder(o, now) {
  if (!o || o.cancelled) return null;
  const s = computeProgress(o, now);
  const patch = {};
  if (o.delivered !== s.delivered) patch.delivered = s.delivered;
  if (s.status === "completed" && o.completedAt === undefined) patch.completedAt = now;
  if (o.statusTxt !== s.status) patch.statusTxt = s.status;
  return Object.keys(patch).length > 0 ? patch : null;
}

module.exports = { computeProgress, advanceOrder, schedule };


