import type { Tick } from "../lib/engine";

const fmt = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

type Pt = { t: number; delivered: number | null; planned: number; likes: number | null };

function buildData(ticks: Tick[], now: number): Pt[] {
  let cl = 0;
  return ticks.map((k) => {
    cl += k.likes;
    return {
      t: k.t,
      delivered: k.t <= now ? k.cumulative : null,
      planned: k.cumulative,
      likes: k.t <= now ? cl : null,
    };
  });
}

const W = 560;
const R = 12;
const T = 12;
const B = 26;
const L = 44;

// Cumulative growth area chart (delivered / planned / likes) — SVG version of
// the original panel's GrowthChart so multiple orders render independently.
export function GrowthChart({ ticks, now, showLikes, height = 260 }: { ticks: Tick[]; now: number; showLikes: boolean; height?: number }) {
  if (ticks.length < 2) {
    return <div className="rounded-xl bg-secondary/40 p-4 text-center text-xs text-muted-foreground">Graph ke liye abhi data nahi hai.</div>;
  }
  const data = buildData(ticks, now);
  const H = height;
  const iw = W - L - R;
  const ih = H - T - B;
  const t0 = data[0]!.t;
  const t1 = data[data.length - 1]!.t;
  const dur = Math.max(1, t1 - t0);
  let maxY = 1;
  for (const d of data) maxY = Math.max(maxY, d.planned);
  const px = (x: number) => L + x * iw;
  const py = (y: number) => T + (1 - y) * ih;

  const toPoints = (get: (d: Pt) => number | null) => {
    let prev: number | null = null;
    const pts: { x: number; y: number }[] = [];
    data.forEach((d) => {
      const v = get(d) ?? prev;
      prev = v;
      if (v === null) return;
      pts.push({ x: px((d.t - t0) / dur), y: py(v / maxY) });
    });
    return pts;
  };

  // Catmull-Rom → cubic bezier smoothing for an organic, IG-style curve.
  const smoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
    let d = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const planned = smoothPath(toPoints((d) => d.planned));
  const delivered = smoothPath(toPoints((d) => d.delivered));
  const likesLine = showLikes ? smoothPath(toPoints((d) => d.likes)) : "";

  // area path under delivered (smoothed)
  const deliveredPts = toPoints((d) => d.delivered);
  let area = "";
  if (deliveredPts.length > 0) {
    area = `M${deliveredPts[0]!.x.toFixed(1)},${py(0).toFixed(1)} ` + smoothPath(deliveredPts);
    area += ` L${px(1).toFixed(1)},${py(0).toFixed(1)} Z`;
  }

  const gid = "growthG";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Growth chart">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f172a" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line x1={px(g)} y1={T} x2={px(g)} y2={H - B} stroke="#e2e8f0" strokeWidth="1" />
          <line x1={L} y1={py(g)} x2={W - R} y2={py(g)} stroke="#e2e8f0" strokeWidth="1" />
        </g>
      ))}
      {area && <path d={area} fill={`url(#${gid})`} />}
      {planned && <path d={planned} fill="none" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1.5" />}
      {delivered && <path d={delivered} fill="none" stroke="#0f172a" strokeWidth="2" />}
      {showLikes && likesLine && <path d={likesLine} fill="none" stroke="#dc2626" strokeWidth="2" />}
      {[0, 0.5, 1].map((g) => (
        <text key={`y${g}`} x={L - 4} y={py(g) + 3} textAnchor="end" fontSize="9" fill="#64748b">
          {Math.round(g * maxY).toLocaleString("en-IN")}
        </text>
      ))}
      {[0, 0.5, 1].map((g) => (
        <text key={`x${g}`} x={px(g)} y={H - B + 14} textAnchor="middle" fontSize="9" fill="#64748b">
          {fmt(t0 + g * dur)}
        </text>
      ))}
      <text x={L} y={T - 4} fontSize="9" fill="#94a3b8">Delivered</text>
      {showLikes && <text x={W - R} y={T - 4} textAnchor="end" fontSize="9" fill="#dc2626">Likes</text>}
    </svg>
  );
}

// Per-drop bar chart: delivered vs upcoming.
export function DropsChart({ ticks, now }: { ticks: Tick[]; now: number }) {
  if (ticks.length === 0) return null;
  const H = 180;
  const iw = W - L - R;
  const ih = H - T - B;
  const n = ticks.length;
  let maxV = 1;
  for (const k of ticks) maxV = Math.max(maxV, k.amount);
  const bw = Math.max(2, (iw / n) * 0.7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Per-drop delivery chart">
      {ticks.map((k, i) => {
        const x = L + i * (iw / n) + (iw / n - bw) / 2;
        const h = Math.round((k.amount / maxV) * ih);
        const y = T + (ih - h);
        const done = k.t <= now;
        return <rect key={i} x={x} y={y} width={bw} height={Math.max(1, h)} rx={2} fill={done ? "#0f172a" : "#cbd5e1"} />;
      })}
      <text x={L} y={T - 4} fontSize="9" fill="#94a3b8">Per-drop units · dark = delivered, light = upcoming</text>
    </svg>
  );
}
