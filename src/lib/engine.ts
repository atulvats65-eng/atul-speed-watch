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
  // Speeds tuned ~2x faster so orders complete in roughly half the time and
  // never feel stalled.
  safe: { minDrop: 120, maxDrop: 220, minGap: 12, maxGap: 20, label: "Safe" },
  normal: { minDrop: 220, maxDrop: 380, minGap: 6, maxGap: 12, label: "Normal" },
  turbo: { minDrop: 450, maxDrop: 750, minGap: 3, maxGap: 6, label: "Turbo" },
  micro: { minDrop: 90, maxDrop: 150, minGap: 2, maxGap: 4, label: "Micro Fast" },
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
  /** Optional fixed completion window (ms from createdAt). When set, the order
   *  is scheduled to finish in exactly this time instead of using the profile's
   *  natural pace. */
  durationMs?: number;
  /** Bot-safe "auto time": picks an unpredictable window and delivers with
   *  irregular, human-like timing so automation heuristics can't flag it. */
  autoHuman?: boolean;
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
const SCURVE_MIN = 8 * 60_000; // minimum 8 min
const SCURVE_MAX = 6 * 3600_000; // cap at 6 hours
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

// S-Curve delivery: cumulative delivered follows a sigmoid over the order's
// lifetime — slow ramp-up, fast mid-section, then a tapering tail.
function sCurveSchedule(o: Order): Tick[] {
  const quantity = o.quantity;
  const duration = Math.min(SCURVE_MAX, Math.max(SCURVE_MIN, (quantity / 1000) * SCURVE_PER_1000));
  const n = Math.max(10, Math.min(120, Math.floor(duration / (5 * 60_000))));
  const raw = (x: number) => 1 / (1 + Math.exp(-SCURVE_STEEP * (x - 0.5)));
  const r0 = raw(0);
  const r1 = raw(1);
  const frac = (x: number) => (raw(x) - r0) / (r1 - r0);
  const ticks: Tick[] = [];
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
        likes: Math.round((drop / quantity) * o.likes),
        cumulative: Math.min(prev, quantity),
      });
    }
  }
  if (ticks.length > 0) ticks[ticks.length - 1]!.cumulative = quantity;
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

// Stealth delivery: mimics a real human. Small organic batches, session-based
// activity separated by long gaps, randomized timing, natural ramp-up/taper,
// and no late-night pushing. Hard for human/AI heuristics to flag as bot work.
function stealthSchedule(o: Order): Tick[] {
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
    const t = o.createdAt + Math.round(x * dur);
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
  const q = o.quantity;
  const baseDur = (q / 1000) * 1.5 * 3600_000;
  const dur = Math.max(2 * 3600_000, Math.min(18 * 3600_000, baseDur));
  const n = Math.max(10, Math.min(200, Math.round(q / 120)));
  const baseAmount = q / n;
  const rnd = mulberry32(o.createdAt ^ 0xabcdef01);
  const ticks: Tick[] = [];
  let cum = 0;
  for (let i = 1; i <= n; i++) {
    const f = (rnd() + rnd()) / 2; // bell-ish → more activity mid-window
    const t = o.createdAt + Math.round(f * dur);
    let amount = Math.max(1, Math.round(baseAmount * (0.7 + rnd() * 0.6)));
    if (cum + amount > q) amount = q - cum;
    if (amount <= 0) break;
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
  ticks.sort((a, b) => a.t - b.t);
  if (ticks.length > 0) ticks[ticks.length - 1]!.cumulative = q;
  return ticks;
}

export function schedule(o: Order): Tick[] {
  if (o.autoHuman) return humanAutoSchedule(o);
  if (o.durationMs) return timedSchedule(o);
  if (o.profile === "scurve") return sCurveSchedule(o);
  if (o.profile === "stealth") return stealthSchedule(o);
  const p = profileParams(o);
  const ticks: Tick[] = [];
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

    t += (gapMin + r * (gapMax - gapMin)) * 60_000;
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
  const delivered = cancelled ? 0 : Math.min(o.quantity, last?.cumulative ?? 0);
  const likes = cancelled ? 0 : last?.likes ?? 0;
  const status: Status = cancelled ? "cancelled" : delivered >= o.quantity ? "completed" : delivered === 0 ? "pending" : "in progress";
  return {
    ticks,
    done,
    next: done.length < ticks.length ? ticks[done.length] : undefined,
    delivered,
    likes,
    remains: o.quantity - delivered,
    status,
    eta: ticks.at(-1)?.t ?? o.createdAt,
    pct: Math.round((delivered / o.quantity) * 100),
  };
}

export function newOrderId() {
  return "AT" + Date.now().toString().slice(-7) + Math.floor(Math.random() * 90 + 10);
}

export function chargeFor(service: Service, quantity: number, likes: number): number {
  const base = (quantity / 1000) * service.rate;
  const likesCost = (likes / 1000) * 25;
  return Math.round((base + likesCost) * 100) / 100;
}
