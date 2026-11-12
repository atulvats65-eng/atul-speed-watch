// ATUL Speed Watch — core engine: services, scheduling, progress, and
// localStorage-backed order storage. Self-contained (no external backend).

import { useSyncExternalStore } from "react";

export type ServiceKind = "views" | "likes" | "followers" | "comments";

export interface Service {
  id: string;
  name: string;
  category: string;
  kind: ServiceKind;
  rate: number; // ₹ per 1000
  min: number;
  max: number;
  /** Provider service ID (when imported from an SMM API). */
  svcId?: string;
}

// Dashboard: services are user-defined (added manually on the Services page or
// imported from the SMM API). See `store.ts` (`useServices`/`addService`). No
// hardcoded defaults — only services the user adds are shown.

export type SpeedProfile = "safe" | "normal" | "turbo" | "micro" | "scurve" | "stealth" | "custom";
export type NightMode = "none" | "pause" | "slow";

export interface ProfileParams {
  minDrop: number;
  maxDrop: number;
  minGap: number;
  maxGap: number;
  label: string;
}

export const PROFILES: Record<Exclude<SpeedProfile, "custom">, ProfileParams> = {
  // Original panel timing restored (per-mode gaps & drops).
  safe: { minDrop: 50, maxDrop: 100, minGap: 30, maxGap: 45, label: "Safe" },
  normal: { minDrop: 100, maxDrop: 170, minGap: 15, maxGap: 30, label: "Normal" },
  turbo: { minDrop: 200, maxDrop: 350, minGap: 8, maxGap: 15, label: "Turbo" },
  micro: { minDrop: 40, maxDrop: 70, minGap: 5, maxGap: 10, label: "Micro Fast" },
  scurve: { minDrop: 100, maxDrop: 170, minGap: 15, maxGap: 30, label: "S-Curve" },
  stealth: { minDrop: 6, maxDrop: 12, minGap: 1, maxGap: 4, label: "Stealth" },
};

export interface Order {
  id: string;
  serviceId: string;
  serviceName: string;
  kind: ServiceKind;
  link: string;
  quantity: number;
  likes: number; // bonus likes dripped alongside (0 = none)
  charge: number;
  createdAt: number;
  userKey?: string; // which panel user owns this order
  profile?: SpeedProfile;
  cMinDrop?: number;
  cMaxDrop?: number;
  cMinGap?: number;
  cMaxGap?: number;
  night?: NightMode;
  humanize?: boolean;
  cancelled?: boolean;
  /** When the order was cancelled (ms epoch). Used to freeze delivered/likes at
   *  that moment instead of wiping published to 0 (R2). */
  cancelledAt?: number;
  /** Optional fixed completion window (ms from createdAt). When set, the order
   *  is scheduled to finish in exactly this time instead of using the profile's
   *  natural pace. */
  durationMs?: number;
  /** Bot-safe "auto time": picks an unpredictable window and delivers with
   *  irregular, human-like timing so automation heuristics can't flag it. */
  autoHuman?: boolean;
  /** Provider batch plan (R1). When set, the order is sent to the provider as
   *  separate action=add batches by the server-side dispatcher. */
  batches?: Batch[];
  /** When true, the UI labels this order as "simulated" (no provider key). */
  simulated?: boolean;
  /** Provider service id used for action=add (svcId of the service). */
  providerServiceId?: string;
  /** Configured likes provider service id (if `likesServiceId` is set). */
  likesServiceId?: string;
  /** Provider's order id when the order was placed with the SMM provider. */
  providerOrderId?: string;
}

export function profileParams(o: Order): ProfileParams {
  if (o.profile === "custom") {
    const minDrop = Math.max(FLOOR_CUSTOM, o.cMinDrop ?? 100);
    const maxDrop = Math.max(minDrop, o.cMaxDrop ?? 170);
    const minGap = Math.max(1, o.cMinGap ?? 15);
    const maxGap = Math.max(minGap, o.cMaxGap ?? 30);
    return { minDrop, maxDrop, minGap, maxGap, label: "Custom" };
  }
  return PROFILES[o.profile ?? "normal"];
}

const SCURVE_PER_1000 = 15 * 60_000; // ~15 min per 1000 units (2x faster)
const SCURVE_MIN = 30 * 60_000; // minimum S-curve window (R1)
const SCURVE_MAX = 7 * 24 * 3600_000; // cap at 7 days (allows 48h custom windows)
const SCURVE_STEEP = 12;

// Hard cap: no single drop may exceed this many units, regardless of profile.
const MAX_DROP = 250;
// Per-profile minimum drop floors (applied inside the specific schedules).
const FLOOR_STEALTH = 100;
const FLOOR_SCURVE = 100;
const FLOOR_CUSTOM = 100;

// Each standard profile gets a distinct "pace shape". Phases are
// [endFraction, multiplier] — the multiplier is applied to the base drop size as
// the order progresses, giving every mode its own delivery curve.
//  - safe:   even / steady
//  - normal: mild acceleration (slow → slightly faster)
//  - turbo:  front-loaded burst (starts big, tapers off)
//  - micro:  dense & even (tiny drops, near-flat line)
const SHAPES: Record<string, [number, number][]> = {
  safe: [[1, 1]],
  normal: [[0.5, 0.8], [1, 1.2]],
  turbo: [[0.35, 1.9], [0.7, 1.1], [1, 0.45]],
  micro: [[1, 1]],
};

function paceAt(profile: string | undefined, frac: number): number {
  const phases = profile ? SHAPES[profile] : undefined;
  if (!phases) return 1;
  let m = phases[phases.length - 1]![1];
  for (const [f, mult] of phases) {
    if (frac <= f) {
      m = mult;
      break;
    }
  }
  return m;
}

// S-Curve delivery: cumulative delivered follows a sigmoid (slow ramp-up, fast
// middle, tapering tail). No per-tick floor — small increments are accumulated
// and released only when they reach minBatch (~1% of q, capped 1..100). The
// first drop is ~minBatch at +60s, and the last tick lands exactly on q.
function sCurveSchedule(o: Order): Tick[] {
  const q = o.quantity;
  // Honor a custom timed window (durationMs) if set — otherwise use the profile
  // duration. Gives the user control over the S-curve schedule time.
  const duration = o.durationMs
    ? Math.min(SCURVE_MAX, Math.max(SCURVE_MIN, o.durationMs))
    : Math.min(SCURVE_MAX, Math.max(SCURVE_MIN, (q / 1000) * SCURVE_PER_1000));
  const MIN_GAP = 15 * 60_000; // S-Curve: at least 15 min between batches
  const n = Math.min(
    Math.max(12, Math.floor(duration / MIN_GAP)), // max batches by 15-min gap
    Math.max(12, Math.round(q / 120)),
  );
  const raw = (x: number) => 1 / (1 + Math.exp(-SCURVE_STEEP * (x - 0.5)));
  const r0 = raw(0);
  const r1 = raw(1);
  const frac = (x: number) => (raw(x) - r0) / (r1 - r0);
  const minBatch = BATCH_MIN_QTY; // never produce batches below the provider minimum

  const ticks: Tick[] = [];
  const firstAmount = Math.min(minBatch, q);
  let prev = firstAmount;
  ticks.push({
    t: o.createdAt + 60_000,
    amount: firstAmount,
    likes: Math.round((firstAmount / q) * o.likes),
    cumulative: firstAmount,
  });
  if (prev >= q) return ticks;

  let acc = 0;
  let accLikes = 0;
  const MIN_GAP = 5 * 60_000; // tiny floor to keep batches monotonic
  let lastT = o.createdAt + 60_000;
  for (let i = 1; i <= n; i++) {
    const x = i / n;
    const target = Math.round(frac(x) * q);
    if (target <= prev) continue;
    const inc = target - prev;
    prev = target;
    acc += inc;
    accLikes += Math.round((inc / q) * o.likes);
    if (acc < minBatch) continue;
    // Time follows the schedule (sigmoid) — the batch lands when its cumulative
    // qty is due within the window. Only a tiny floor keeps it monotonic.
    let t = o.createdAt + Math.round(x * duration);
    if (t < lastT + MIN_GAP) t = lastT + MIN_GAP;
    lastT = t;
    ticks.push({ t, amount: acc, likes: accLikes, cumulative: prev });
    acc = 0;
    accLikes = 0;
    if (prev >= q) break;
  }

  // Tail top-up so the order always reaches exactly q (no tiny remainder/spike).
  const delivered = ticks.length ? ticks[ticks.length - 1]!.cumulative : 0;
  const leftover = q - delivered;
  if (leftover > 0) {
    if (ticks.length > 0) {
      const last = ticks[ticks.length - 1]!;
      last.amount += leftover;
      last.likes += Math.round((leftover / q) * o.likes);
      last.cumulative = q;
    } else {
      ticks.push({ t: o.createdAt + 60_000, amount: q, likes: o.likes, cumulative: q });
    }
  }
  if (ticks.length > 0) ticks[ticks.length - 1]!.cumulative = q;
  return ticks;
}

const STEALTH_PER_1000 = 20 * 60_000; // ~20 min per 1000 units (2x faster)
const STEALTH_MIN = 10 * 60_000;
const STEALTH_MAX = 8 * 3600_000;

// Deterministic PRNG (mulberry32) so the same order always produces the same
// schedule — consistent with the rest of the engine.
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Organic, human-like delivery. Builds session clusters with variable spacing,
// jittered batch sizes, natural ramp-up/down and unpredictable total window.
// Seeded by order id + createdAt so it's stable across renders yet unique per
// order — much harder for bot / human heuristics to fingerprint.
function organicSchedule(o: Order): Tick[] {
  const q = o.quantity;
  let seed = o.createdAt ^ (typeof o.id === "string" ? o.id.length * 2654435761 : 0);
  const rnd = mulberry32(seed);

  const baseHours = (q / 1000) * (1 + rnd() * 1.8);
  const dur = Math.max(2 * 3600_000, Math.min(20 * 3600_000, baseHours * 3600_000));
  const sessions = 3 + Math.floor(rnd() * 5); // 3–7 sessions

  const centers: number[] = [];
  let acc = 0.06 + rnd() * 0.1;
  for (let s = 0; s < sessions; s++) {
    centers.push(acc);
    acc += 0.14 + rnd() * 0.22;
  }
  const lastC = centers[centers.length - 1]! || 1;
  for (let s = 0; s < centers.length; s++) centers[s] = centers[s]! / (lastC * 1.15);

  // Bound batches so they fit inside the window with a 15-min min gap AND keep
  // each batch >= 100 — prevents stall while keeping human cadence.
  const maxFit = Math.max(1, Math.floor(dur / (18 * 60_000)));
  const n = Math.max(1, Math.min(maxFit, Math.round(q / 120)));
  const baseAmount = q / n;
  const ticks: Tick[] = [];
  let cum = 0;
  let lastT = 0;

  for (let i = 0; i < n; i++) {
    const p = i / n;
    let si = 0;
    let best = Infinity;
    for (let s = 0; s < centers.length; s++) {
      const d = Math.abs(centers[s]! - p);
      if (d < best) { best = d; si = s; }
    }
    const jitter = (rnd() + rnd() + rnd() - 1.5) * 0.08;
    const f = Math.max(0.02, Math.min(0.98, centers[si]! + jitter));
    let t = o.createdAt + Math.round(f * dur);

    const isFirst = lastT === 0;
    if (isFirst) {
      t = o.createdAt + 60_000;
    } else {
      // Enforce a minimum 15-minute gap between consecutive drops (human-like).
      if (t - lastT < 15 * 60_000) {
        t = lastT + (15 + rnd() * 15) * 60_000;
      }
      // Avoid deep-night pushes (except the very first 1-minute drop).
      if (isNight(t)) {
        const d = new Date(t + IST);
        d.setUTCHours(7, 0, 0, 0);
        let nt = d.getTime() - IST;
        if (nt <= t) nt += 86_400_000;
        const f2 = (nt - o.createdAt) / dur;
        if (f2 > 0 && f2 < 1) t = nt;
      }
    }
    lastT = t;

    let amount = Math.max(1, Math.round(baseAmount * (0.55 + rnd() * 0.9)));
    if (cum + amount > q) amount = q - cum;
    if (amount <= 0) break;
    cum += amount;
    const nightSlow = o.night === "slow" && isNight(t) ? 0.5 : 1;
    // Human-like batches stay >= 100 (when the order is big enough) — no tiny drops.
    const drop = Math.min(MAX_DROP, Math.max(q >= 100 ? FLOOR_STEALTH : 1, Math.round(amount * nightSlow)));
    ticks.push({ t, amount: drop, likes: Math.round((drop / q) * o.likes), cumulative: Math.min(cum, q) });
    if (cum >= q) break;
  }

  ticks.sort((a, b) => a.t - b.t);
  if (ticks.length > 0) ticks[ticks.length - 1]!.cumulative = q;
  return ticks;
}

// Stealth delivery: mimics a real human. Small organic batches, session-based
// activity separated by long gaps, randomized timing, natural ramp-up/taper,
// and no late-night pushing. Hard for human/AI heuristics to flag as bot work.
function stealthSchedule(o: Order): Tick[] {
  return organicSchedule(o);
}

function stealthScheduleLegacy(o: Order): Tick[] {
  const q = o.quantity;
  const duration = Math.min(STEALTH_MAX, Math.max(STEALTH_MIN, (q / 1000) * STEALTH_PER_1000));
  const rnd = mulberry32(o.createdAt ^ 0x5f3759df);

  // --- organic batch sizes (small, variable) ---
  const batches = Math.max(20, Math.min(500, Math.round(q / 18)));
  const sizes: number[] = [];
  let raw = 0;
  for (let i = 0; i < batches; i++) {
    const s = 6 + rnd() * 90;
    sizes.push(s);
    raw += s;
  }
  const scale = q / raw;

  // --- session centers (increasing, jittered) ---
  const sessionCount = Math.max(3, Math.min(10, Math.round(batches / 55)));
  const centers: number[] = [];
  for (let s = 0; s < sessionCount; s++) {
    centers.push((s + 0.15 + rnd() * 0.7) / (sessionCount - 0.35));
  }
  centers.sort((a, b) => a - b);

  const ticks: Tick[] = [];
  let delivered = 0;
  for (let i = 0; i < batches; i++) {
    const p = i / batches;
    let si = 0;
    let best = Infinity;
    for (let s = 0; s < centers.length; s++) {
      const d = Math.abs(centers[s]! - p);
      if (d < best) {
        best = d;
        si = s;
      }
    }
    const off = (rnd() + rnd() + rnd() - 1.5) * 0.04;
    const frac = Math.max(0.01, Math.min(0.99, centers[si]! + off));
    let t = o.createdAt + Math.round(frac * duration);

    // avoid mid-night delivery — looks human
    if (isNight(t)) {
      const d = new Date(t + IST);
      d.setUTCHours(7, 0, 0, 0);
      let nt = d.getTime() - IST;
      if (nt <= t) nt += 86_400_000;
      const f2 = (nt - o.createdAt) / duration;
      if (f2 > 0 && f2 < 1) {
        t = nt;
      }
    }

    let amount = Math.round(sizes[i]! * scale);
    if (delivered + amount > q) amount = q - delivered;
    if (amount <= 0) break;

    const nightSlow = o.night === "slow" && isNight(t) ? 0.5 : 1;
    const drop = Math.min(MAX_DROP, Math.max(FLOOR_STEALTH, Math.round(amount * nightSlow)));
    delivered += drop;
    if (delivered > q) delivered = q;

    ticks.push({
      t,
      amount: drop,
      likes: Math.round((drop / q) * o.likes),
      cumulative: Math.min(delivered, q),
    });
    if (delivered >= q) break;
  }
  ticks.sort((a, b) => a.t - b.t);
  if (ticks.length > 0) ticks[ticks.length - 1]!.cumulative = q;
  return ticks;
}

export interface Tick {
  t: number;
  amount: number;
  likes: number;
  cumulative: number;
}

const IST = 330 * 60_000; // India time (UTC+5:30)

function isNight(t: number): boolean {
  const h = new Date(t + IST).getUTCHours();
  return h >= 0 && h < 6;
}

// Fixed-duration schedule: delivers the whole quantity evenly across the chosen
// completion window so the order finishes in exactly that time and never stalls.
// Deterministic (seeded) so progress is stable across re-renders.
function timedSchedule(o: Order): Tick[] {
  const q = o.quantity;
  const dur = Math.max(60_000, o.durationMs ?? 3600_000);
  const n = Math.max(8, Math.min(240, Math.round(q / 150)));
  const baseAmount = Math.floor(q / n);
  const rnd = mulberry32(o.createdAt ^ (o.durationMs ?? 0) ^ 0x9e3779b9);
  const ticks: Tick[] = [];
  let cum = 0;
  for (let i = 1; i <= n; i++) {
    const x = i / n;
    const t = i === 1 ? o.createdAt + 60_000 : o.createdAt + Math.round(x * dur);
    let amount = baseAmount;
    if (i === n || cum + baseAmount >= q) amount = q - cum;
    if (amount <= 0) break;
    amount = Math.max(1, Math.round(amount * (0.85 + rnd() * 0.3)));
    if (cum + amount > q) amount = q - cum;
    cum += amount;
    const nightSlow = o.night === "slow" && isNight(t) ? 0.5 : 1;
    const drop = Math.max(1, Math.round(amount * nightSlow));
    ticks.push({
      t,
      amount: drop,
      likes: Math.round((drop / q) * o.likes),
      cumulative: Math.min(cum, q),
    });
    if (cum >= q) break;
  }
  if (ticks.length > 0) ticks[ticks.length - 1]!.cumulative = q;
  return ticks;
}

// Bot-safe auto scheduling: picks an unpredictable completion window (based on
// quantity but jittered) and delivers with irregular, human-like spread so the
// order doesn't look machine-generated. Deterministic (seeded).
function humanAutoSchedule(o: Order): Tick[] {
  return organicSchedule(o);
}

export function schedule(o: Order): Tick[] {
  // S-Curve always keeps its sigmoid shape — manual duration never overrides it.
  if (o.profile === "scurve") return sCurveSchedule(o);
  if (o.autoHuman) return humanAutoSchedule(o);
  if (o.durationMs) return timedSchedule(o);
  if (o.profile === "stealth") return stealthSchedule(o);
  const p = profileParams(o);
  const ticks: Tick[] = [];
  let t = o.createdAt; // first drop lands at +60s below
  let cumulative = 0;
  let rnd = 7;
  let first = true;
  while (cumulative < o.quantity) {
    rnd = (rnd * 9301 + 49297) % 233280;
    const r = rnd / 233280;

    let gapMin = p.minGap;
    let gapMax = p.maxGap;
    let amountMin = p.minDrop;
    let amountMax = p.maxDrop;

    if (o.humanize) {
      // Anti-detection: make delivery look organic/random.
      if (r < 0.08) {
        // occasional longer pause
        gapMin += 40;
        gapMax += 90;
      } else if (r < 0.2) {
        // burst: two drops close together, slightly bigger
        gapMin = Math.max(1, p.minGap / 4);
        gapMax = Math.max(gapMin + 1, p.minGap / 2);
        amountMax = Math.round(p.maxDrop * 1.6);
      } else {
        // jitter around the base range
        gapMin *= 0.7;
        gapMax *= 1.5;
      }
    }

    // First drop lands ~1 minute after placing (original behaviour); after that,
    // apply the per-mode gap.
    t += first ? 60_000 : (gapMin + r * (gapMax - gapMin)) * 60_000;
    first = false;

    // Night "pause" mode: if the next drop would land in 12AM–6AM, push it past
    // the night window (07:00 UTC = 12:30 IST, matching the server engine) and
    // keep ticks monotonic.
    if (o.night === "pause" && isNight(t)) {
      const d = new Date(t + IST);
      d.setUTCHours(7, 0, 0, 0);
      const next = d.getTime() - IST;
      if (next > t) t = next;
      else break;
    }
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
      likes: Math.round((drop / o.quantity) * o.likes),
      cumulative: Math.min(cumulative, o.quantity),
    });
  }
  if (ticks.length > 0) ticks[ticks.length - 1]!.cumulative = o.quantity;
  return ticks;
}

export type Status = "pending" | "in progress" | "completed" | "cancelled";

// A "batch" is one provider order (action=add) that the panel will send at time
// `t`. Batches are produced from the schedule by merging small ticks up to the
// provider's per-service minimum (mergeToMin).
export interface Batch {
  index: number;
  t: number;
  quantity: number;
  likes: number;
  state?: "scheduled" | "sending" | "sent" | "failed" | "cancelled";
  providerOrderId?: string;
  providerStatus?: string;
  attempts?: number;
  lastError?: string;
}

// Minimum/maximum provider batch size (per user requirement).
export const BATCH_MIN_QTY = 100;
export const BATCH_MAX_QTY = 250;

// Merge ticks into batches of at least `min` units (default floor 100) and at
// most BATCH_MAX_QTY (250) — batches above the max are split. The remainder is
// carried forward; the last batch absorbs leftover if it stays <= max. The sum
// of batch quantities always equals the sum of the input tick amounts.
export function mergeToMin(ticks: Tick[], min: number): Batch[] {
  const floor = Math.max(BATCH_MIN_QTY, Math.floor(min || 0));
  const batches: Batch[] = [];
  let acc = 0;
  let accLikes = 0;
  let firstT = 0;
  for (const tk of ticks) {
    // A single tick larger than max must be split into multiple batches.
    let remaining = tk.amount;
    let likesTotal = tk.likes;
    while (remaining > 0) {
      if (acc === 0) firstT = tk.t;
      const space = BATCH_MAX_QTY - acc;
      if (acc >= floor && space <= 0) {
        batches.push({ index: batches.length, t: firstT, quantity: acc, likes: accLikes });
        acc = 0;
        accLikes = 0;
        continue;
      }
      const take = Math.min(remaining, space > 0 ? space : BATCH_MAX_QTY);
      acc += take;
      accLikes += Math.round((take / tk.amount) * likesTotal);
      remaining -= take;
      if (acc >= floor) {
        batches.push({ index: batches.length, t: firstT, quantity: acc, likes: accLikes });
        acc = 0;
        accLikes = 0;
      }
    }
  }
  if (acc > 0) {
    if (batches.length > 0) {
      const lastB = batches[batches.length - 1]!;
      if (lastB.quantity + acc <= BATCH_MAX_QTY) {
        lastB.quantity += acc;
        lastB.likes += accLikes;
      } else {
        batches.push({ index: batches.length, t: firstT, quantity: acc, likes: accLikes });
      }
    } else {
      batches.push({ index: 0, t: firstT, quantity: acc, likes: accLikes });
    }
  }
  return batches;
}


export interface Progress {
  ticks: Tick[];
  done: Tick[];
  next?: Tick;
  delivered: number;
  likes: number;
  remains: number;
  status: Status;
  eta: number;
  pct: number;
}

export function progress(o: Order, now: number): Progress {
  const ticks = schedule(o);
  const done = ticks.filter((k) => k.t <= now);
  const cancelled = !!o.cancelled;
  const last = done.at(-1);
  // When cancelled, freeze delivered/likes at the moment of cancellation instead
  // of wiping to 0 (R2). Future drops never happen.
  const cut = cancelled && o.cancelledAt ? o.cancelledAt : now;
  const doneTicks = cancelled ? ticks.filter((k) => k.t <= cut) : done;
  const lastDelivered = doneTicks.at(-1);
  const delivered = cancelled
    ? Math.min(o.quantity, lastDelivered?.cumulative ?? 0)
    : Math.min(o.quantity, last?.cumulative ?? 0);
  const likes = cancelled ? (lastDelivered?.likes ?? 0) : last?.likes ?? 0;
  const status: Status = cancelled ? "cancelled" : delivered >= o.quantity ? "completed" : delivered === 0 ? "pending" : "in progress";
  return {
    ticks,
    done,
    next: cancelled ? undefined : done.length < ticks.length ? ticks[done.length] : undefined,
    delivered,
    likes,
    remains: o.quantity - delivered,
    status,
    eta: ticks.at(-1)?.t ?? o.createdAt,
    pct: Math.round((delivered / o.quantity) * 100),
  };
}

export function newOrderId() {
  // crypto.randomUUID gives a collision-free id (E8). Keep a short human display.
  const c = globalThis.crypto as Crypto | undefined;
  const uuid = c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return "AT" + uuid.replace(/-/g, "").slice(0, 10).toUpperCase();
}

export function chargeFor(service: Service, quantity: number, likes: number): number {
  const base = (quantity / 1000) * service.rate;
  const likesCost = (likes / 1000) * 25;
  return Math.round((base + likesCost) * 100) / 100;
}
