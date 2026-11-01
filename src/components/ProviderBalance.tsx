import { useApiCfg } from "../lib/store";
import { useProviderBalance } from "../lib/useProviderBalance";

// Header badge showing the live SMM provider balance. Visible only while an API
// key is configured; tap to refresh manually.
export default function ProviderBalance() {
  const cfg = useApiCfg();
  const connected = Boolean(cfg?.key && cfg.key.trim().length >= 4);
  const { loading, error, text, refresh } = useProviderBalance();

  if (!connected) return null;

  const hasText = Boolean(text);

  return (
    <button
      onClick={refresh}
      title={error ? `Error: ${error} — tap to retry` : "Provider balance — tap to refresh"}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        hasText
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : error
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span>
        {loading && !hasText
          ? "Balance…"
          : hasText
            ? text
            : error
              ? "Balance —"
              : "Balance…"}
      </span>
    </button>
  );
}
