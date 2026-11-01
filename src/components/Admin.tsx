import { useState } from "react";
import { adminCreateUser, setUserActive, useOrders, useSession, useUsers } from "../lib/store";
import { Button, Card, Field, Input } from "./ui";
import { toast } from "./Toast";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function Admin() {
  const users = useUsers();
  const orders = useOrders();
  const session = useSession();
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const userList = Object.values(users);
  const revenue = orders.reduce((a, o) => a + o.charge, 0);

  const generate = () => {
    const key = adminCreateUser(newName);
    setNewKey(key);
    setNewName("");
    toast.success("Access key generate ho gayi! Copy karke user ko do.");
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      toast.success("Key copy ho gayi.");
    } catch {
      toast("Copy karne ke liye manually select karein.", "error");
    }
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
        <h2 className="text-sm font-semibold text-slate-700">Access key generate karein</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Field label="User ka naam (optional)">
              <Input placeholder="e.g. Rahul" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
          </div>
          <Button onClick={generate}>Generate key</Button>
        </div>
        {newKey && (
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Nayi access key (user ko do):</div>
            <div className="mt-1 flex items-center gap-3">
              <code className="flex-1 select-all rounded-lg bg-white px-3 py-2 font-mono text-base font-semibold text-slate-900 ring-1 ring-slate-200">
                {newKey}
              </code>
              <Button onClick={copyKey}>Copy</Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              User is key se kisi bhi device par login karke apna data dekhega.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-700">Users</h2>
        {userList.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Abhi koi user nahi.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="pb-2 font-medium">Key</th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {userList.map((u) => (
                  <tr key={u.key} className="border-b border-slate-50">
                    <td className="py-2.5 font-mono text-xs">{u.key}</td>
                    <td className="py-2.5">{u.name}{u.admin && <span className="ml-2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">ADMIN</span>}</td>
                    <td className="py-2.5">
                      <button
                        onClick={() => setUserActive(u.key, !u.active)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
                      >
                        {u.active ? "Active" : "Blocked"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
