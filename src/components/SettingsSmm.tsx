import { useState } from "react";
import { saveApiCfg, saveApiServices, useApiCfg, useApiServices } from "../lib/store";
import type { ApiService } from "../lib/store";
import { providerCall, guessKind, parseBalance } from "../lib/smmClient";
import { Button, Card, Field, Input } from "./ui";
import { toast } from "./Toast";

const YOYO_URL = "https://yoyomedia.in/api/v2";

export default function SettingsSmm() {
  const saved = useApiCfg();
  const imported = useApiServices();
  const [url, setUrl] = useState(saved.url || YOYO_URL);
  const [key, setKey] = useState(saved.key);
  const [backupUrl, setBackupUrl] = useState(saved.backupUrl);
  const [backupKey, setBackupKey] = useState(saved.backupKey);
  const [likesSvc, setLikesSvc] = useState(saved.likesServiceId ?? "");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);

  const persist = (withBackup = true) => {
    saveApiCfg({
      url: url.trim() || YOYO_URL,
      key: key.trim(),
      backupUrl: withBackup ? backupUrl.trim() : "",
      backupKey: withBackup ? backupKey.trim() : "",
      likesServiceId: likesSvc.trim() || undefined,
    });
    toast("API config save ho gayi.");
  };

  const connect = async () => {
    if (!/^https:\/\//i.test(url.trim()) || key.trim().length < 4) {
      toast("API URL (https) aur key (4+ chars) daaliye.", "error");
      return;
    }
    setBusy(true);
    setBalance(null);
    try {
      const r = await providerCall(url, key, "balance");
      if (!r.ok) {
        toast(r.error ?? "Connection failed", "error");
        return;
      }
      const parsed = parseBalance(r.data);
      if (!parsed) {
        toast("Balance response sahi nahi mila.", "error");
        return;
      }
      setBalance(parsed.text);
      persist(true);
      toast.success("API connected & saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Connect failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const importServices = async () => {
    if (!saved.key) {
      toast("Pehle Connect & Test dabayein (key save ho jayegi).", "error");
      return;
    }
    setBusy(true);
    try {
      const r = await providerCall(saved.url || YOYO_URL, saved.key, "services");
      if (!r.ok) {
        toast(r.error ?? "Services load nahi hui", "error");
        return;
      }
      const list = r.data as { service: string; name: string; category?: string; type?: string; rate: string | number; min: string | number; max: string | number }[];
      if (!Array.isArray(list)) {
        toast("Services array nahi mila.", "error");
        return;
      }
      const mapped: ApiService[] = list.slice(0, 500).map((s) => ({
        apiServiceId: String(s.service),
        name: String(s.name),
        category: String(s.category || "API"),
        kind: guessKind(String(s.name) + " " + String(s.type ?? "")),
        rate: Number(s.rate) || 0,
        min: Number(s.min) || 1,
        max: Number(s.max) || 100000,
      }));
      saveApiServices(mapped);
      toast.success(`${mapped.length} services import ho gayi`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const configured = !!saved.key;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">SMM API</h1>

      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            YoYo Media API v2 pre-set hai. Bas apni API key daalo aur Connect dabao.
          </p>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              configured ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {configured ? "Connected" : "Not configured"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="API URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="API Key">
            <Input type="password" placeholder="••••••••" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <Field label="Backup URL (optional)">
            <Input placeholder="https://backup.example.com/api/v2" value={backupUrl} onChange={(e) => setBackupUrl(e.target.value)} />
          </Field>
          <Field label="Backup Key (optional)">
            <Input type="password" placeholder="••••••••" value={backupKey} onChange={(e) => setBackupKey(e.target.value)} />
          </Field>
          <Field label="Likes Service ID (optional — bonus likes)">
            <Input placeholder="Provider likes service id" value={likesSvc} onChange={(e) => setLikesSvc(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">
              Isse set karo to New Order me Bonus likes use ho sakta hai (provider mode me).
            </p>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={connect} disabled={busy}>
            {busy ? "Working…" : "Connect & Test"}
          </Button>
          <Button onClick={importServices} disabled={busy || !configured} className="bg-slate-200 text-slate-800 hover:bg-slate-300">
            Import services
          </Button>
          <Button onClick={() => persist(true)} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
            Save
          </Button>
        </div>

        {balance && (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-500">Provider balance: </span>
            <span className="font-semibold">{balance}</span>
          </div>
        )}

        {imported.length > 0 && (
          <p className="text-xs text-slate-500">
            {imported.length} services import hui hain — ye <strong>Services</strong> page par
            dikhengi aur Naya Order me use ho sakti hain.
          </p>
        )}
      </Card>

      <Card className="p-6 text-sm text-slate-600">
        <h2 className="mb-2 font-semibold text-slate-800">Yeh kaise kaam karta hai</h2>
        <p>
          <strong>Connect & Test</strong> provider par <code className="rounded bg-slate-100 px-1.5 py-0.5">action=balance</code>{" "}
          bhejta hai — balance aaye to connection sahi hai.
        </p>
        <p className="mt-2">
          <strong>Import services</strong> <code className="rounded bg-slate-100 px-1.5 py-0.5">action=services</code>{" "}
          se provider ki services laata hai aur New Order me jodta hai. Sab requests
          aapke server-side proxy ({`/api/smm`}) se jaati hain — isliye CORS block nahi aata.
        </p>
      </Card>
    </div>
  );
}
