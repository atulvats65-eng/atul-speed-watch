import { useState } from "react";
import type { ServiceKind } from "../lib/engine";
import { addService, removeService, updateService, useServices } from "../lib/store";
import { Badge, Button, Card, Field, GhostButton, Input, Select } from "./ui";
import { toast } from "./Toast";

const KIND_LABEL: Record<string, string> = {
  views: "Views",
  likes: "Likes",
  followers: "Followers",
  comments: "Comments",
};

const newServiceId = () =>
  "svc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function Services() {
  const services = useServices();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Instagram");
  const [kind, setKind] = useState<ServiceKind>("views");
  const [rate, setRate] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [svcId, setSvcId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCategory("Instagram");
    setKind("views");
    setRate("");
    setMin("");
    setMax("");
    setSvcId("");
  };

  const add = () => {
    const r = Number(rate);
    const mn = Number(min);
    const mx = Number(max);
    if (!name.trim()) return toast("Service ka naam daaliye.", "error");
    if (!r || r <= 0) return toast("Rate (₹/1000) sahi daaliye.", "error");
    if (!mn || mn <= 0) return toast("Minimum quantity sahi daaliye.", "error");
    if (!mx || mx < mn) return toast("Maximum quantity minimum se badi honi chahiye.", "error");

    if (editingId) {
      updateService(editingId, {
        name: name.trim(),
        category: category.trim() || "General",
        kind,
        rate: r,
        min: mn,
        max: mx,
      });
      resetForm();
      toast.success("Service update ho gayi!");
      return;
    }

    const finalId = svcId.trim() || newServiceId();
    if (services.some((s) => s.id === finalId))
      return toast("Is Service ID se pehle se ek service hai — doosra ID rakhiye.", "error");

    addService({
      id: finalId,
      name: name.trim(),
      category: category.trim() || "General",
      kind,
      rate: r,
      min: mn,
      max: mx,
    });
    resetForm();
    toast.success("Service add ho gayi!");
  };

  const byCategory = new Map<string, typeof services>();
  for (const s of services) {
    const list = byCategory.get(s.category) ?? [];
    list.push(s);
    byCategory.set(s.category, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Badge className="bg-slate-100 text-slate-600">{services.length} total</Badge>
      </div>

      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-700">
          {editingId ? "Service edit karein" : "Nayi service add karein"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Naam">
            <Input placeholder="e.g. Instagram Views" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Service ID (optional)">
            <Input
              placeholder="e.g. svc-123 — khali chhodo to auto banta hai"
              value={svcId}
              onChange={(e) => setSvcId(e.target.value)}
              disabled={!!editingId}
            />
          </Field>
          <Field label="Category">
            <Input placeholder="e.g. Instagram" value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ServiceKind)}>
              <option value="views">Views</option>
              <option value="likes">Likes</option>
              <option value="followers">Followers</option>
              <option value="comments">Comments</option>
            </Select>
          </Field>
          <Field label="Rate (₹ / 1000)">
            <Input type="number" placeholder="e.g. 14" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Minimum quantity">
            <Input type="number" placeholder="e.g. 100" value={min} onChange={(e) => setMin(e.target.value)} />
          </Field>
          <Field label="Maximum quantity">
            <Input type="number" placeholder="e.g. 500000" value={max} onChange={(e) => setMax(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={add}>{editingId ? "Save changes" : "Add service"}</Button>
          {editingId && <GhostButton onClick={resetForm}>Cancel</GhostButton>}
        </div>
        <p className="text-xs text-slate-500">
          SMM API se import karne ke liye <strong>SMM API</strong> page dekho. Sab services yahi ek list me dikhti hain.
        </p>
      </Card>

      {services.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          Abhi koi service nahi hai. Upar se add karein ya SMM API se import karein.
        </Card>
      ) : (
        Array.from(byCategory.entries()).map(([cat, list]) => (
          <div key={cat}>
            <h2 className="mb-3 text-sm font-semibold text-slate-500">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s) => (
                <Card key={s.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{s.name}</h3>
                    <Badge className="bg-slate-100 text-slate-600">{KIND_LABEL[s.kind]}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">₹{s.rate} / 1000</p>
                  <p className="text-xs text-slate-400">
                    Min {s.min.toLocaleString("en-IN")} · Max {s.max.toLocaleString("en-IN")}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                      onClick={() => {
                        setEditingId(s.id);
                        setName(s.name);
                        setCategory(s.category);
                        setKind(s.kind);
                        setRate(String(s.rate));
                        setMin(String(s.min));
                        setMax(String(s.max));
                        setSvcId(s.id);
                      }}
                    >
                      ✎ Edit
                    </button>
                    <Button
                      className="bg-red-50 text-red-600 hover:bg-red-100"
                      onClick={() => {
                        removeService(s.id);
                        toast("Service delete ho gayi.");
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
