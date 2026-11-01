import { useEffect, useState } from "react";

type Kind = "success" | "error";
interface Msg {
  id: number;
  text: string;
  kind: Kind;
}

let seq = 0;
const listeners = new Set<(m: Msg) => void>();

export function toast(text: string, kind: Kind = "success") {
  seq += 1;
  const m: Msg = { id: seq, text, kind };
  listeners.forEach((l) => l(m));
}

export function Toaster() {
  const [items, setItems] = useState<Msg[]>([]);
  useEffect(() => {
    const l = (m: Msg) => {
      setItems((i) => [...i, m]);
      window.setTimeout(() => setItems((i) => i.filter((x) => x.id !== m.id)), 3200);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="fixed right-4 top-4 z-50 space-y-2">
      {items.map((m) => (
        <div
          key={m.id}
          className={`rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            m.kind === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
