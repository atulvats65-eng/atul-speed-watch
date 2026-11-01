import { useEffect, useState } from "react";
import { deleteOrder, updateOrder, useOrders } from "../lib/store";
import { progress, profileParams } from "../lib/engine";
import StatusBadge from "./StatusBadge";
import { GrowthChart, DropsChart } from "./DeliveryCharts";
import { Button, GhostButton } from "./ui";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

const fmtTime = (t: number) =>
  new Date(t).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const fmtIn = (ms: number) => {
  if (ms <= 0) return "abhi";
  const m = Math.floor(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
};

export default function OrderDetail({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const orders = useOrders();
  const now = useNow(1000);
  const o = orders.find((x) => x.id === orderId);

  if (!o) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Order nahi mila. <button onClick={onBack} className="text-slate-900 underline">Order history</button>
      </div>
    );
  }

  const p = progress(o, now);
  const pp = profileParams(o);

  const info: [string, string][] = [
    ["Order ID", "#" + o.id],
    ["Service", o.serviceName],
    ["Link", o.link],
    ["Mode", `${pp.label} (${pp.minDrop}–${pp.maxDrop} / ${pp.minGap}–${pp.maxGap} min)`],
    ...(o.night && o.night !== "none" ? ([[ "Night Shield", o.night === "pause" ? "🌙 Pause 12–6 AM" : "🌙 Slow 12–6 AM" ]] as [string, string][]) : []),
    ["Placed", fmtTime(o.createdAt)],
    ["Charge", `₹${o.charge.toFixed(2)}`],
    ["Start count", p.ticks[0] ? fmtTime(p.ticks[0]!.t) : "—"],
    ["Expected complete", fmtTime(p.eta)],
    ["Total drops", `${p.done.length} / ${p.ticks.length}`],
    ["Next drop", p.next ? `${p.next.amount} units · ${fmtIn(p.next.t - now)}` : "—"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <GhostButton onClick={onBack}>← Orders</GhostButton>
        <h1 className="text-lg font-semibold text-slate-800">Order #{o.id}</h1>
        <StatusBadge status={p.status} />
        <div className="ml-auto flex gap-2">
          {p.status === "in progress" && (
            <Button className="bg-slate-200 text-xs text-slate-800 hover:bg-slate-300" onClick={() => updateOrder(o.id, { cancelled: true })}>
              Cancel
            </Button>
          )}
          <Button className="bg-red-100 text-xs text-red-600 hover:bg-red-200" onClick={() => { deleteOrder(o.id); onBack(); }}>
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Delivered" value={p.delivered.toLocaleString("en-IN")} sub={`of ${o.quantity.toLocaleString("en-IN")} ${o.kind}`} />
        {o.likes > 0 && <Stat label="Likes" value={p.likes.toLocaleString("en-IN")} sub={`of ${o.likes.toLocaleString("en-IN")}`} />}
        <Stat label="ETA" value={fmtIn(p.eta - now)} sub="expected complete" />
        <Stat label="Status" value={p.status} sub={`${p.pct}% done`} />
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${p.pct}%` }} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800">Growth</h2>
          <p className="mb-3 text-xs text-slate-500">
            Cumulative {o.kind}{o.likes > 0 ? " & likes" : ""} · dashed line = planned
          </p>
          <GrowthChart ticks={p.ticks} now={now} showLikes={o.likes > 0} />
          <h2 className="mt-6 text-sm font-semibold text-slate-800">Per-drop delivery</h2>
          <DropsChart ticks={p.ticks} now={now} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-800">Order Info</h2></div>
          <dl className="divide-y divide-slate-50 text-xs">
            {info.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-2.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="truncate text-right font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-800">Delivery Timeline</h2></div>
        <div className="max-h-96 divide-y divide-slate-50 overflow-y-auto">
          {p.ticks.map((k, i) => {
            const done = k.t <= now && !(o.cancelled && k.t > now);
            const isNext = p.next?.t === k.t;
            return (
              <div key={i} className={`flex items-center gap-3 px-5 py-2.5 text-xs ${done ? "" : "opacity-60"}`}>
                <span className={`size-2 shrink-0 rounded-full ${done ? "bg-slate-900" : isNext ? "bg-amber-500" : "bg-slate-300"}`} />
                <span className="w-36 text-slate-500">{fmtTime(k.t)}</span>
                <span className="font-medium text-slate-800">+{k.amount} {o.kind}</span>
                {k.likes > 0 && <span className="text-red-600">+{k.likes} likes</span>}
                <span className="ml-auto text-slate-500">{k.cumulative.toLocaleString("en-IN")} total</span>
                <span className="w-24 text-right">{done ? (o.cancelled ? "Cancelled" : "Delivered") : isNext ? fmtIn(k.t - now) : "Scheduled"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}
