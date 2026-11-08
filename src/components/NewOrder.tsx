import { useEffect, useMemo, useRef, useState } from "react";
import { chargeFor, newOrderId } from "../lib/engine";
import type { NightMode, Order, SpeedProfile } from "../lib/engine";
import { addOrder, useApiCfg, useServices } from "../lib/store";
import { Button, Card, Field, Input, Select } from "./ui";
import { toast } from "./Toast";
import DeliveryCurveChart from "./DeliveryCurveChart";

export default function NewOrder({ onDone }: { onDone: () => void }) {
  const services = useServices();
  const apiCfg = useApiCfg();
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
  const [autoHuman, setAutoHuman] = useState(false);

  // Stable preview timestamp so the preview graph doesn't regenerate (and
  // change) on every re-render — only when settings actually change.
  const previewCreatedAtRef = useRef(Date.now());

  const [linkPreview, setLinkPreview] = useState<{ image?: string; title?: string; desc?: string } | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  // Fetch link thumbnail + title (server-side og: tags) like the original panel.
  useEffect(() => {
    if (!/^https:\/\//i.test(link.trim())) {
      setLinkPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      setLinkLoading(true);
      try {
        const r = await fetch("/api/og", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: link.trim() }),
        });
        const d = await r.json();
        setLinkPreview(d && d.ok ? { image: d.image, title: d.title, desc: d.desc } : null);
      } catch {
        setLinkPreview(null);
      }
      setLinkLoading(false);
    }, 600);
    return () => clearTimeout(t);
  }, [link]);
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

  const charge = service ? Math.round(chargeFor(service, Number(quantity) || 0, Number(likes) || 0) * 100) / 100 : 0;
  // Bonus-likes only work when a likes service id is configured.
  const likesDisabled = !apiCfg.likesServiceId;

  const previewOrder = {
    id: "preview",
    serviceId: service?.id ?? "",
    serviceName: service?.name ?? "",
    kind: service?.kind ?? "views",
    link: "",
    quantity: Number(quantity) || 1000,
    likes: Number(likes) || 0,
    charge: 0,
    createdAt: previewCreatedAtRef.current,
    profile,
    ...(profile === "custom" ? { cMinDrop, cMaxDrop, cMinGap, cMaxGap } : {}),
    night,
    humanize,
    ...(durationMs ? { durationMs } : {}),
    ...(autoHuman ? { autoHuman: true } : {}),
  };

  if (services.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">New Order</h1>
        <Card className="space-y-3 p-6 text-center">
          <p className="text-sm text-slate-600">No services yet.</p>
          <p className="text-xs text-slate-500">
            Add a service from <strong>Services</strong> (or import via SMM API), then place an order here.
          </p>
        </Card>
      </div>
    );
  }

  const submit = async () => {
    if (!service) return setError("Select a service first.");
    if (!link.trim()) return setError("Enter a link.");
    const q = Number(quantity);
    if (!q || q < service.min) return setError(`Minimum quantity is ${service.min}.`);
    if (q > service.max) return setError(`Maximum quantity is ${service.max}.`);
    if (profile === "custom" && (cMaxDrop < cMinDrop || cMaxGap < cMinGap))
      return setError("Custom drop/gap values are invalid.");

    const createdAt = startTime ? new Date(startTime).getTime() : Date.now();
    if (Number.isNaN(createdAt)) return setError("Start time sahi nahi hai.");
    const order: Order = {
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
      ...(autoHuman ? { autoHuman: true } : {}),
    };

    // Simple provider send: if an SMM API key is configured, place the order
    // directly with the provider via our server-side proxy (api/smm.js).
    // Otherwise keep it as a local simulation.
    const providerConfigured = !!(apiCfg.key && apiCfg.key.trim().length >= 4);
    order.likes = Number(likes) || 0;
    order.simulated = !providerConfigured;

    if (providerConfigured) {
      try {
        const svcId = service.svcId || service.id;
        const res = await fetch("/api/smm", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Target": apiCfg.url || "https://yoyomedia.in/api/v2" },
          body: new URLSearchParams({
            key: apiCfg.key,
            action: "add",
            service: svcId,
            link: link.trim(),
            quantity: String(q),
          }).toString(),
        });
        const data = await res.json();
        if (res.ok && data && typeof data.error === "undefined") {
          const pid = data?.order != null ? String(data.order) : undefined;
          order.providerOrderId = pid;
          toast(pid ? `Order provider ko bhej diya (ID #${pid})` : "Order provider ko bhej diya.");
        } else {
          toast(`Provider order fail: ${data?.error ?? "unknown"} — simulated`, "error");
          order.simulated = true;
        }
      } catch (e) {
        toast("Provider call fail — simulated", "error");
        order.simulated = true;
      }
    } else {
      toast("Order place ho gaya! (simulated — provider ko nahi ja raha)");
    }

    addOrder(order);
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

        {linkLoading && <p className="text-xs text-slate-400">Preview load ho raha hai…</p>}
        {linkPreview && (linkPreview.image || linkPreview.title) && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            {linkPreview.image && (
              <img
                src={linkPreview.image}
                alt=""
                className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              />
            )}
            <div className="min-w-0">
              {linkPreview.title && (
                <p className="truncate text-sm font-medium text-slate-800">{linkPreview.title}</p>
              )}
              {linkPreview.desc && (
                <p className="truncate text-xs text-slate-500">{linkPreview.desc}</p>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Quantity (min ${service.min}, max ${service.max})`}>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </Field>
          <Field label="Bonus likes (0 = koi nahi)">
            <Input
              type="number"
              value={likes}
              disabled={likesDisabled}
              onChange={(e) => setLikes(Number(e.target.value))}
            />
            {likesDisabled && (
              <p className="mt-1 text-xs text-slate-400">
                Bonus-likes ke liye provider me likes service configure karo (likesServiceId).
              </p>
            )}
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
            <Select
              value={autoHuman ? "autosafe" : (durationMs?.toString() ?? "")}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "autosafe") {
                  setAutoHuman(true);
                  setDurationMs(undefined);
                } else {
                  setAutoHuman(false);
                  setDurationMs(v ? Number(v) : undefined);
                }
              }}
            >
              <option value="">Auto (profile ki speed)</option>
              <option value="autosafe">Auto (Bot-safe / human-like)</option>
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
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Delivery curve preview · {profile}
            {durationMs ? ` · ${Math.round(durationMs / 3600_000)}h` : ""}
            {autoHuman ? " · Auto (Bot-safe)" : ""}
          </h3>
          <DeliveryCurveChart order={previewOrder} now={Date.now()} />
          <p className="mt-2 text-xs text-slate-500">
            Profile ke hisaab se predicted delivery curve. Laal dot = current progress.
          </p>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={submit} className="w-full">Place Order</Button>
      </Card>
    </div>
  );
}
