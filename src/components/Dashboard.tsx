import { useEffect, useState } from "react";
import { progress, schedule } from "../lib/engine";
import type { Order } from "../lib/engine";
import { useOrders, useSession } from "../lib/store";
import { Card } from "./ui";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

function deliveredToday(o: Order, now: number): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  let sum = 0;
  for (const k of schedule(o)) {
    if (k.t > now) break;
    if (k.t >= t0) sum += k.amount;
  }
  return sum;
}

export default function Dashboard() {
  const orders = useOrders();
  const session = useSession();
  const now = useNow();

  // Non-admin users only see their own orders.
  const scoped = session?.admin ? orders : orders.filter((o) => o.userKey === session?.key);

  const active = scoped.filter((o) => {
    const s = progress(o, now).status;
    return s === "pending" || s === "in progress";
  });
  const totalDelivered = scoped.reduce((acc, o) => acc + progress(o, now).delivered, 0);
  const totalSpend = scoped.reduce((acc, o) => acc + o.charge, 0);

  // last 7 days delivery bars
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    const t0 = d.getTime();
    const t1 = t0 + 86400_000;
    let total = 0;
    for (const o of scoped) {
      for (const k of schedule(o)) {
        if (k.t >= t1) break;
        if (k.t >= t0) total += k.amount;
      }
    }
    return {
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      total,
      t0,
    };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.total));

  const stats = [
    { label: "Total orders", value: scoped.length },
    { label: "Active", value: active.length },
    { label: "Delivered", value: totalDelivered.toLocaleString("en-IN") },
    { label: "Total spend", value: `₹${totalSpend}` },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold">{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-700">Delivery — last 7 days</h2>
        <div className="mt-4 flex h-32 items-end gap-2">
          {days.map((d) => (
            <div key={d.t0} className="flex flex-1 flex-col items-center gap-1">
              <div className="text-[10px] text-slate-400">{d.total.toLocaleString("en-IN")}</div>
              <div
                className="w-full rounded-t-md bg-slate-900"
                style={{ height: `${Math.max(4, (d.total / maxDay) * 100)}%`, minHeight: 4 }}
              />
              <div className="text-[10px] text-slate-500">{d.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {scoped.length > 0 && (
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-slate-700">Recent orders</h2>
          <ul className="mt-3 space-y-2">
            {scoped.slice(0, 5).map((o) => {
              const p = progress(o, now);
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-sm">
                  <span className="truncate">{o.serviceName}</span>
                  <span className="flex items-center gap-3 text-slate-500">
                    <span>{p.status === "cancelled" ? "0" : p.delivered.toLocaleString("en-IN")} / {o.quantity.toLocaleString("en-IN")}</span>
                    <span className="font-medium text-slate-700">{p.pct}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
