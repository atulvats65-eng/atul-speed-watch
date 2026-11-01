import { useEffect, useMemo, useState } from "react";
import { chargeFor, newOrderId } from "../lib/engine";
import type { NightMode, SpeedProfile } from "../lib/engine";
import { addOrder, useServices } from "../lib/store";
import { Button, Card, Field, Input, Select } from "./ui";
import { toast } from "./Toast";
import DeliveryCurveChart from "./DeliveryCurveChart";

export default function NewOrder({ onDone }: { onDone: () => void }) {
  const services = useServices();
  const categories = useMemo(() => Array.from(new Set(services.map((s) => s.category))), [services]);
  const [category, setCategory] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState(1000);
  const [likes, setLikes] = useState(0);
  const [profile, setProfile] = useState<SpeedProfile>("normal");
  const [cMinDrop, setCMinDrop] = useState(100);
  const [cMaxDrop, setCMaxDrop] = useState(170);
  const [cMinGap, setCMinGap] = useState(15);
  const [cMaxGap, setCMaxGap] = useState(30);
  const [night, setNight] = useState<NightMode>("none");
  const [humanize, setHumanize] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);
  const [error, setError] = useState("");

  const activeCategory = categories.includes(category) ? category : categories[0] ?? "";
  const categoryServices = useMemo(
    () => services.filter((s) => s.category === activeCategory),
    [services, activeCategory]
  );
  const service = categoryServices.find((s) => s.id === serviceId) ?? categoryServices[0];

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(category)) setCategory(categories[0]!);
    if (service && service.id !== serviceId) setServiceId(service.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, category, service, serviceId]);

  const charge = service ? Math.round(chargeFor(service, quantity || 0, likes) * 100) / 100 : 0;

  const previewOrder = {
    id: "preview",
    serviceId: service?.id ?? "",
    serviceName: service?.name ?? "",
    kind: service?.kind ?? "views",
    link: "",
    quantity: Number(quantity) || 1000,
    likes: Number(likes) || 0,
    charge: 0,
    createdAt: Date.now(),
    profile,
    ...(profile === "custom" ? { cMinDrop, cMaxDrop, cMinGap, cMaxGap } : {}),
    night,
    humanize,
    ...(durationMs ? { durationMs } : {}),
  };

  if (services.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Naya Order</h1>
        <Card className="space-y-3 p-6 text-center">
          <p className="text-sm text-slate-600">Abhi koi service nahi hai.</p>
          <p className="text-xs text-slate-500">
            Pehle <strong>Services</strong> page se ek service add karein (ya SMM API se import karein), phir yahan order place karein.
          </p>
        </Card>
      </div>
    );
  }

  const submit = () => {
    if (!service) return setError("Pehle ek service select karein.");
    if (!link.trim()) return setError("Link daaliye.");
    const q = Number(quantity);
    if (!q || q < service.min) return setError(`Minimum quantity ${service.min} hai.`);
    if (q > service.max) return setError(`Maximum quantity ${service.max} hai.`);
    if (profile === "custom" && (cMaxDrop < cMinDrop || cMaxGap < cMinGap))
      return setError("Custom drop/gap values sahi nahi hain.");

    const createdAt = startTime ? new Date(startTime).getTime() : Date.now();
    if (Number.isNaN(createdAt)) return setError("Start time sahi nahi hai.");
    const order = {
      id: newOrderId(),
      serviceId: service.id,
      serviceName: service.name,
      kind: service.kind,
      link: link.trim(),
      quantity: q,
      likes: Number(likes) || 0,
      charge,
      createdAt,
      profile,
      ...(profile === "custom"
        ? { cMinDrop, cMaxDrop, cMinGap, cMaxGap }
        : {}),
      night,
      humanize,
      ...(durationMs ? { durationMs } : {}),
    };

    addOrder(order);
    toast("Order place ho gaya!");
    onDone();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Naya Order</h1>
      <Card className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={activeCategory} onChange={(e) => { setCategory(e.target.value); const s = services.find((x) => x.category === e.target.value); if (s) setServiceId(s.id); }}>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Service">
            <Select value={service?.id ?? ""} onChange={(e) => setServiceId(e.target.value)}>
              {categoryServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — ₹{s.rate}/1000
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Link (URL)">
          <Input placeholder="https://instagram.com/p/..." value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Quantity (min ${service.min}, max ${service.max})`}>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </Field>
          <Field label="Bonus likes (0 = koi nahi)">
            <Input type="number" value={likes} onChange={(e) => setLikes(Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Start time (optional — khali chhodo to abhi ka time)">
          <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Speed profile">
            <Select value={profile} onChange={(e) => setProfile(e.target.value as SpeedProfile)}>
              <option value="safe">Safe</option>
              <option value="normal">Normal</option>
              <option value="turbo">Turbo</option>
              <option value="micro">Micro Fast</option>
              <option value="scurve">S-Curve</option>
              <option value="stealth">Stealth (Human-like)</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
          <Field label="Delivery time (optional — is time mein complete ho)">
            <Select value={durationMs?.toString() ?? ""} onChange={(e) => setDurationMs(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">Auto (profile ki speed)</option>
              <option value="3600000">1 hour</option>
              <option value="10800000">3 hours</option>
              <option value="21600000">6 hours</option>
              <option value="43200000">12 hours</option>
              <option value="86400000">24 hours</option>
            </Select>
          </Field>
        </div>

        <Field label="Night mode (12AM–6AM)">
          <Select value={night} onChange={(e) => setNight(e.target.value as NightMode)}>
            <option value="none">None</option>
            <option value="pause">Pause</option>
            <option value="slow">Slow down</option>
          </Select>
        </Field>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
          <span>
            <span className="block text-sm font-medium text-slate-700">Humanize / Bot-safe delivery</span>
            <span className="block text-xs text-slate-500">Organic, random-style drops taaki AI detect na kar sake</span>
          </span>
          <input
            type="checkbox"
            checked={humanize}
            onChange={(e) => setHumanize(e.target.checked)}
            className="size-5 accent-slate-900"
          />
        </label>

        {profile === "custom" && (
          <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <Field label="Min drop (units)">
              <Input type="number" value={cMinDrop} onChange={(e) => setCMinDrop(Number(e.target.value))} />
            </Field>
            <Field label="Max drop (units)">
              <Input type="number" value={cMaxDrop} onChange={(e) => setCMaxDrop(Number(e.target.value))} />
            </Field>
            <Field label="Min gap (minutes)">
              <Input type="number" value={cMinGap} onChange={(e) => setCMinGap(Number(e.target.value))} />
            </Field>
            <Field label="Max gap (minutes)">
              <Input type="number" value={cMaxGap} onChange={(e) => setCMaxGap(Number(e.target.value))} />
            </Field>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-5 py-4 text-white">
          <span className="text-sm text-slate-300">Total charge</span>
          <span className="text-2xl font-bold">₹{charge}</span>
        </div>

        <Card className="p-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Delivery curve preview</h3>
          <DeliveryCurveChart order={previewOrder} now={Date.now()} />
          <p className="mt-2 text-xs text-slate-500">
            Profile ke hisaab se predicted delivery curve. Laal dot = current progress.
          </p>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={submit} className="w-full">Order place karen</Button>
      </Card>
    </div>
  );
}
