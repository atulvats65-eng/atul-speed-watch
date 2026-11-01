import { useState } from "react";
import {
  adminCreateUser,
  adminDeleteUser,
  setUserActive,
  useOrders,
  useSession,
  useUsers,
  isKeyExpired,
} from "../lib/store";
import { addService, removeService, useServices } from "../lib/store";
import type { ServiceKind } from "../lib/engine";
import { Button, Card, Field, Input, Select } from "./ui";
import { toast } from "./Toast";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const DUR: Record<string, string> = {
  "1d": "1 Day",
  "7d": "7 Days",
  "30d": "30 Days",
  lifetime: "Lifetime",
};

const KIND_OPTIONS: { value: ServiceKind; label: string }[] = [
  { value: "views", label: "Views" },
  { value: "likes", label: "Likes" },
  { value: "followers", label: "Followers" },
  { value: "comments", label: "Comments" },
];

export default function Admin() {
  const users = useUsers();
  const orders = useOrders();
  const session = useSession();
  const services = useServices();

  const [duration, setDuration] = useState<"1d" | "7d" | "30d" | "lifetime">("7d");
  const [count, setCount] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);

  const [sName, setSName] = useState("");
  const [sCategory, setSCategory] = useState("");
  const [sKind, setSKind] = useState<ServiceKind>("views");
  const [sRate, setSRate] = useState(100);
  const [sMin, setSMin] = useState(10);
  const [sMax, setSMax] = useState(100000);
  const [sSvcId, setSSvcId] = useState("");

  const userList = Object.values(users).sort((a, b) => b.createdAt - a.createdAt);
  const revenue = orders.reduce((a, o) => a + o.charge, 0);

  const generate = () => {
    const codes: string[] = [];
    const n = Math.max(1, Math.min(50, count));
    for (let i = 0; i < n; i++) {
      const label = note ? `${note}${n > 1 ? ` #${i + 1}` : ""}` : undefined;
      codes.push(adminCreateUser(label, { duration, isAdmin, note: label }));
    }
    setFresh(codes);
    setNote("");
    toast.success(`${n} key ban gayi`);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Key copy ho gayi.");
    } catch {
      toast("Copy karne ke liye manually select karein.", "error");
    }
  };

  const keyStatus = (u: { active: boolean; expiresAt?: number; duration?: string }) => {
    if (!u.active) return ["Blocked", "bg-slate-200 text-slate-500"] as const;
    if (isKeyExpired(u as never)) return ["Expired", "bg-red-100 text-red-600"] as const;
    return ["Active", "bg-green-100 text-green-700"] as const;
  };

  const addNewService = () => {
    if (!sName.trim()) return toast("Service naam daaliye.", "error");
    addService({
      id: "svc-" + Date.now().toString(36),
      name: sName.trim(),
      category: sCategory.trim() || "General",
      kind: sKind,
      rate: Number(sRate) || 0,
      min: Math.max(1, Number(sMin) || 1),
      max: Math.max(1, Number(sMax) || 100000),
      svcId: sSvcId.trim() || undefined,
    });
    setSName("");
    setSCategory("");
    setSSvcId("");
    toast.success("Service add ho gayi!");
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Admin</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5"><div className="text-xs text-slate-500">Users</div><div className="mt-1 text-2xl font-bold">{userList.length}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-500">Total orders</div><div className="mt-1 text-2xl font-bold">{orders.length}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-500">Revenue</div><div className="mt-1 text-2xl font-bold">{fmt(revenue)}</div></Card>
      </div>

      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-700">Access keys generate karein</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Validity">
            <Select value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)}>
              <option value="1d">1 Day</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="lifetime">Lifetime</option>
            </Select>
          </Field>
          <Field label="Count">
            <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </Field>
          <Field label="Note (optional)">
            <Input placeholder="e.g. Rahul" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="size-4 accent-slate-900" />
          <span>Admin key banao (yeh bhi admin panel khol sakegi)</span>
        </label>

        <Button onClick={generate}>Generate keys</Button>

        {fresh.length > 0 && (
          <div className="rounded-xl bg-emerald-50 p-4">
            <div className="text-xs font-medium text-emerald-700">Nayi keys (users ko do):</div>
            <div className="mt-2 space-y-2">
              {fresh.map((k) => (
                <div key={k} className="flex items-center gap-3">
                  <code className="flex-1 select-all rounded-lg bg-white px-3 py-2 font-mono text-base font-semibold text-slate-900 ring-1 ring-emerald-200">
                    {k}
                  </code>
                  <Button className="bg-slate-200 text-slate-800 hover:bg-slate-300" onClick={() => copy(k)}>Copy</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-700">Keys</h2>
        {userList.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Abhi koi key nahi.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="pb-2 font-medium">Key</th>
                  <th className="pb-2 font-medium">Note</th>
                  <th className="pb-2 font-medium">Validity</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Expires</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {userList.map((u) => {
                  const [label, cls] = keyStatus(u);
                  return (
                    <tr key={u.key} className="border-b border-slate-50">
                      <td className="py-2.5 font-mono text-xs">
                        <button onClick={() => copy(u.key)} className="hover:underline">{u.key}</button>
                        {u.admin && <span className="ml-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">ADMIN</span>}
                      </td>
                      <td className="py-2.5">{u.note ?? "—"}</td>
                      <td className="py-2.5">{DUR[u.duration ?? "lifetime"] ?? "Lifetime"}</td>
                      <td className="py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span></td>
                      <td className="py-2.5 text-xs text-slate-500">
                        {u.expiresAt ? new Date(u.expiresAt).toLocaleString() : "Never"}
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-right">
                        <button
                          onClick={() => setUserActive(u.key, !u.active)}
                          className={`mr-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${u.active ? "bg-slate-200 text-slate-600" : "bg-green-100 text-green-700"}`}
                          title={u.active ? "Block" : "Enable"}
                        >
                          {u.active ? "Block" : "Enable"}
                        </button>
                        <button
                          onClick={() => { if (confirm(`Key ${u.key} delete karein?`)) { adminDeleteUser(u.key); toast.success("Key delete ho gayi."); } }}
                          className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---- Service manager ---- */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-700">Services</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Service naam">
            <Input placeholder="e.g. Instagram Views" value={sName} onChange={(e) => setSName(e.target.value)} />
          </Field>
          <Field label="Category">
            <Input placeholder="e.g. Instagram" value={sCategory} onChange={(e) => setSCategory(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={sKind} onChange={(e) => setSKind(e.target.value as ServiceKind)}>
              {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Rate (₹ per 1000)">
            <Input type="number" value={sRate} onChange={(e) => setSRate(Number(e.target.value))} />
          </Field>
          <Field label="Min qty">
            <Input type="number" value={sMin} onChange={(e) => setSMin(Number(e.target.value))} />
          </Field>
          <Field label="Max qty">
            <Input type="number" value={sMax} onChange={(e) => setSMax(Number(e.target.value))} />
          </Field>
          <Field label="Service ID (provider, optional)">
            <Input placeholder="e.g. 228" value={sSvcId} onChange={(e) => setSSvcId(e.target.value)} />
          </Field>
        </div>
        <Button className="mt-4" onClick={addNewService}>Add service</Button>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Rate</th>
                <th className="pb-2 font-medium">Min–Max</th>
                <th className="pb-2 font-medium">Svc ID</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-b border-slate-50">
                  <td className="py-2 font-medium">{s.name}</td>
                  <td className="py-2 text-slate-500">{s.category}</td>
                  <td className="py-2 text-slate-500">{s.kind}</td>
                  <td className="py-2">₹{s.rate}</td>
                  <td className="py-2 text-slate-500">{s.min}–{s.max}</td>
                  <td className="py-2 font-mono text-xs text-slate-500">{s.svcId ?? "—"}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => { removeService(s.id); toast.success("Service delete ho gayi."); }}
                      className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {services.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">Abhi koi service nahi.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
