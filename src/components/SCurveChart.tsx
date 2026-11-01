import type { Order } from "../lib/engine";
import { progress, schedule } from "../lib/engine";

// SVG chart rendering the S-Curve delivery shape for an order: the predicted
// cumulative curve (sigmoid) plus a dot marking the current real progress.
export default function SCurveChart({ order, now }: { order: Order; now: number }) {
  const ticks = schedule(order);
  if (ticks.length < 2) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center text-xs text-slate-400">
        S-Curve ke liye abhi data nahi hai.
      </div>
    );
  }

  const start = order.createdAt;
  const end = ticks[ticks.length - 1]!.t;
  const duration = end - start || 1;

  const W = 340;
  const H = 180;
  const L = 36;
  const R = 12;
  const T = 14;
  const B = 26;
  const iw = W - L - R;
  const ih = H - T - B;
  const px = (x: number) => L + x * iw;
  const py = (y: number) => T + (1 - y) * ih;

  const pts = ticks.map((k) => ({
    x: Math.min(1, (k.t - start) / duration),
    y: Math.min(1, k.cumulative / order.quantity),
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${px(1).toFixed(1)},${py(0).toFixed(1)} L${px(0).toFixed(1)},${py(0).toFixed(1)} Z`;

  const p = progress(order, now);
  const nowX = Math.max(0, Math.min(1, (now - start) / duration));
  const nowY = Math.min(1, p.delivered / order.quantity);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="S-Curve delivery chart">
      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line x1={px(g)} y1={T} x2={px(g)} y2={H - B} stroke="#1d2a33" strokeWidth="1" />
          <line x1={L} y1={py(g)} x2={W - R} y2={py(g)} stroke="#1d2a33" strokeWidth="1" />
        </g>
      ))}

      {/* area under the curve + the curve itself */}
      <path d={area} fill="rgba(34,197,94,0.10)" />
      <path d={line} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* current progress dot */}
      <circle cx={px(nowX)} cy={py(nowY)} r="5" fill="#dc2626" />
      <circle cx={px(nowX)} cy={py(nowY)} r="9" fill="none" stroke="#dc2626" strokeWidth="1.5" opacity="0.5" />

      {/* y labels */}
      {[0, 0.5, 1].map((g) => (
        <text key={g} x={L - 4} y={py(g) + 3.5} textAnchor="end" fontSize="9" fill="#94a3b8">
          {Math.round(g * 100)}%
        </text>
      ))}
      {/* x labels */}
      {[0, 0.5, 1].map((g) => (
        <text key={`x${g}`} x={px(g)} y={H - B + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {Math.round(g * 100)}%
        </text>
      ))}

      <text x={L} y={T - 5} fontSize="9" fill="#94a3b8">Delivered</text>
      <text x={W - R} y={H - B + 14} textAnchor="end" fontSize="9" fill="#94a3b8">Time</text>
    </svg>
  );
}
