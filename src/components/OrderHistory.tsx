import { Fragment, useEffect, useState } from "react";
import { progress } from "../lib/engine";
import type { Order, Status } from "../lib/engine";
import { useOrders } from "../lib/store";
import StatusBadge from "./StatusBadge";
import { GrowthChart } from "./DeliveryCharts";

function useNow(ms = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

function fmtTime(t: number) {
  return new Date(t).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRemaining(eta: number, now: number) {
  const ms = eta - now;
  if (ms <= 0) return "abhi";
  const m = Math.floor(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

const filters: ("all" | Status)[] = ["all", "pending", "in progress", "completed", "cancelled"];

export default function OrderHistory({ onOpenDetail }: { onOpenDetail: (id: string) => void }) {
  const orders = useOrders();
  const now = useNow(5000);
  const [f, setF] = useState<(typeof filters)[number]>("all");
  const [q, setQ] = useState("");

  const rows = orders
    .map((o) => ({ o, p: progress(o, now) }))
    .filter(
      (x) =>
        (f === "all" || x.p.status === f) &&
        (x.o.id + x.o.link + x.o.serviceName).toLowerCase().includes(q.toLowerCase()),
    );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
        <h1 className="mr-auto text-sm font-semibold text-slate-800">Order History</h1>
        <input
          placeholder="Search ID / link"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 w-48 rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none focus:border-slate-900"
        />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-5 py-2">
        {filters.map((x) => (
          <button
            key={x}
            onClick={() => setF(x)}
            className={`rounded-md px-2.5 py-1 text-xs capitalize ${
              f === x ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {x}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-400">
            <tr className="border-b border-slate-100">
              {["ID", "Date", "Service", "Link", "Charge", "Qty", "Delivered", "Remains", "Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Koi order nahi mila.</td></tr>
            )}
            {rows.map(({ o, p }) => (
              <Fragment key={o.id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button onClick={() => onOpenDetail(o.id)} className="font-mono text-slate-900 hover:underline">
                      #{o.id}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtTime(o.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{o.serviceName}</td>
                  <td className="max-w-40 truncate px-4 py-3 text-slate-500">{o.link}</td>
                  <td className="px-4 py-3">₹{o.charge.toFixed(2)}</td>
                  <td className="px-4 py-3">{o.quantity.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{p.delivered.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{p.remains.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                </tr>
                <tr>
                  <td colSpan={9} className="px-4 pb-5 pt-2">
                    <div role="group" aria-label={`Delivery graph for order ${o.id}`} className="min-w-72">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <button onClick={() => onOpenDetail(o.id)} className="font-medium text-slate-900 hover:underline">
                          #{o.id} · {o.kind} growth · {o.profile ?? "normal"}
                          {o.durationMs ? ` · ${Math.round(o.durationMs / 3600_000)}h` : ""}
                          {o.autoHuman ? " · Auto (Bot-safe)" : ""}
                        </button>
                        <span className="text-slate-500">
                          {p.delivered.toLocaleString("en-IN")} / {o.quantity.toLocaleString("en-IN")}
                          {o.likes > 0 ? ` · ${p.likes.toLocaleString("en-IN")} / ${o.likes.toLocaleString("en-IN")} likes` : ""}
                          {" · "}{p.status === "completed" ? "Complete ✓" : p.status === "cancelled" ? "Cancelled" : `completes ${fmtRemaining(p.eta, now)}`}
                        </span>
                      </div>
                      <GrowthChart ticks={p.ticks} now={now} showLikes={o.likes > 0} height={180} />
                    </div>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
