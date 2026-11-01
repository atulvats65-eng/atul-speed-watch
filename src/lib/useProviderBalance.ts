import { useEffect, useState } from "react";
import { providerCall, parseBalance } from "./smmClient";
import { useApiCfg } from "./store";

const YOYO_URL = "https://yoyomedia.in/api/v2";
const POLL_MS = 60_000;

export type ProviderBalanceState = {
  loading: boolean;
  error: string | null;
  text: string | null;
  refresh: () => void;
};

// Fetches the SMM provider balance whenever an API key is configured, and keeps
// it fresh by polling every 60s. Renders nothing / stays idle when not connected.
export function useProviderBalance(): ProviderBalanceState {
  const cfg = useApiCfg();
  const connected = Boolean(cfg?.key && cfg.key.trim().length >= 4);

  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!connected) {
      setText(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const r = await providerCall(cfg.url || YOYO_URL, cfg.key, "balance");
        if (!active) return;
        if (!r.ok) {
          setError(r.error ?? "Connection failed");
          setText(null);
          return;
        }
        const parsed = parseBalance(r.data);
        if (!active) return;
        if (!parsed) {
          setError("Balance response sahi nahi mila.");
          setText(null);
          return;
        }
        setText(parsed.text);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Connect failed");
        setText(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    const id = window.setInterval(run, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [connected, cfg.url, cfg.key, tick]);

  return { loading, error, text, refresh };
}
