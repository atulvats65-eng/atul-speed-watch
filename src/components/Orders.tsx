import { useEffect, useState } from "react";
import { progress, schedule } from "../lib/engine";
import type { Order } from "../lib/engine";
import { deleteOrder, updateOrder, useOrders, useSession } from "../lib/store";
import StatusBadge from "./StatusBadge";
import { Card, GhostButton, Input } from "./ui";
import { toast } from "./Toast";
import DeliveryCurveChart from "./DeliveryCurveChart";

function useNow(ms = 1000) {
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

function toLocalDateTime(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtRemaining(eta: number, now: number) {
  const ms = eta - now;
  if (ms <= 0) return "abhi";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// Full per-order schedule detail: next drop + drop-by-drop timeline.
function OrderScheduleDetail({ order, now }: { order: Order; now: number }) {
  const ticks = schedule(order);
  if (ticks.length === 0) {
    return <p className="mt-3 text-xs text-slate-400">Schadule banane ke liye data nahi hai.</p>;
  }

  const next = ticks.find((k) => k.t > now);
  const limit = 150;
  const shown = ticks.slice(-limit);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
      {next && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2 text-white">
          <span className="text-slate-300">Agla drop</span>
          <span className="font-semibold">
            {next.amount.toLocaleString("en-IN")} units · {fmtRemaining(next.t, now)} mein
          </span>
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 font-medium text-slate-600">
        <span>Total drops: {ticks.length}</span>
        <span>Qty: {order.quantity.toLocaleString("en-IN")}</span>
        {order.likes > 0 && <span>Bonus likes: {order.likes.toLocaleString("en-IN")}</span>}
        <span>Profile: {order.profile ?? "normal"}</span>
      </div>

      <div className="max-h-64 overflow-auto rounded-lg border border-slate-100">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-[10px] uppercase text-slate-400">
              <th className="px-2 py-1 font-medium">#</th>
              <th className="px-2 py-1 font-medium">Time</th>
              <th className="px-2 py-1 font-medium">Units</th>
              <th className="px-2 py-1 font-medium">Likes</th>
              <th className="px-2 py-1 font-medium">Cum %</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((k, idx) => {
              const isNext = next && k.t === next.t;
              return (
                <tr
                  key={idx}
                  className={`border-t border-slate-50 ${isNext ? "bg-amber-50 font-medium" : ""}`}
                >
                  <td className="px-2 py-1 text-slate-400">{idx + 1}</td>
                  <td className="px-2 py-1">{fmtTime(k.t)}</td>
                  <td className="px-2 py-1">{k.amount.toLocaleString("en-IN")}</td>
                  <td className="px-2 py-1 text-slate-500">{k.likes}</td>
                  <td className="px-2 py-1">{Math.round((k.cumulative / order.quantity) * 100)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ticks.length > limit && (
        <p className="mt-1 text-[10px] text-slate-400">Sirf last {limit} drops dikhaye gaye hain (total {ticks.length}).</p>
      )}
    </div>
  );
}

export default function Orders() {
  const orders = useOrders();
  const session = useSession();
  const now = useNow();
  const [filter, setFilter] = useState<"all" | "pending" | "in progress" | "completed" | "cancelled">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [timeEditId, setTimeEditId] = useState<string | null>(null);
  const [newTime, setNewTime] = useState("");

  // Non-admin users only see their own orders.
  const scoped = session?.admin ? orders : orders.filter((o) => o.userKey === session?.key);
  const filtered = filter === "all" ? scoped : scoped.filter((o) => progress(o, now).status === filter);

  if (scoped.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Card className="p-10 text-center text-sm text-slate-500">
          <p>Abhi koi order nahi hai. "Naya Order" se shuru karein.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>
      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "in progress", "completed", "cancelled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {f === "all" ? "Sab" : f[0]!.toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map((o) => {
          const p = progress(o, now);
          return (
            <Card key={o.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{o.id}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <h3 className="mt-1 font-semibold">{o.serviceName}</h3>
                  <p className="truncate text-xs text-slate-500">{o.link}</p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold">₹{o.charge}</div>
                  <div className="text-xs text-slate-400">{fmtTime(o.createdAt)}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {p.delivered.toLocaleString("en-IN")} / {o.quantity.toLocaleString("en-IN")}
                    {o.likes > 0 && ` · ${p.likes} likes`}
                  </span>
                  <span className="font-medium">{p.pct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all"
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {p.status === "completed"
                      ? "Complete ✓"
                      : p.status === "cancelled"
                        ? "Cancelled"
                        : `Remaining: ${p.remains.toLocaleString("en-IN")}`}
                  </span>
                  {p.status === "in progress" && <span>ETA: {fmtRemaining(p.eta, now)}</span>}
                </div>

                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-1 text-xs font-medium text-slate-500">Delivery curve</div>
                  <DeliveryCurveChart order={o} now={now} />
                </div>

                <button
                  type="button"
                  onClick={() => setOpenId(openId === o.id ? null : o.id)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={openId === o.id ? "rotate-180 transition-transform" : "transition-transform"}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  {openId === o.id ? "Chhupao detail" : "Dekho schadule / detail"}
                </button>

                {openId === o.id && <OrderScheduleDetail order={o} now={now} />}
              </div>

              {timeEditId === o.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-black/30 p-2">
                  <Input
                    type="datetime-local"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="min-w-[220px] flex-1"
                  />
                  <GhostButton
                    onClick={() => {
                      if (newTime) {
                        const t = new Date(newTime).getTime();
                        if (!Number.isNaN(t)) {
                          updateOrder(o.id, { createdAt: t });
                          toast.success("Order ka time update ho gaya.");
                        }
                      }
                      setTimeEditId(null);
                      setNewTime("");
                    }}
                  >
                    Apply
                  </GhostButton>
                  <GhostButton onClick={() => { setTimeEditId(null); setNewTime(""); }}>Cancel</GhostButton>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <GhostButton
                  onClick={() => {
                    if (timeEditId === o.id) {
                      setTimeEditId(null);
                      setNewTime("");
                    } else {
                      setTimeEditId(o.id);
                      setNewTime(toLocalDateTime(o.createdAt));
                    }
                  }}
                >
                  Set time
                </GhostButton>
                {p.status === "in progress" && (
                  <GhostButton onClick={() => updateOrder(o.id, { cancelled: true })}>Cancel</GhostButton>
                )}
                <GhostButton className="text-red-600 hover:bg-red-50" onClick={() => deleteOrder(o.id)}>
                  Delete
                </GhostButton>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
