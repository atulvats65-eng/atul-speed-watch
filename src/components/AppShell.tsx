import type { ReactNode } from "react";
import { signOut, useSession } from "../lib/store";
import { GhostButton } from "./ui";
import ProviderBalance from "./ProviderBalance";
import HackerBg from "./HackerBg";

export type View = "dashboard" | "new-order" | "orders" | "order-detail" | "services" | "smm-api" | "admin" | "settings";

const NAV: { id: View; label: string; adminOnly?: boolean }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "new-order", label: "New Order" },
  { id: "orders", label: "Orders" },
  { id: "services", label: "Services" },
  { id: "smm-api", label: "SMM API" },
  { id: "admin", label: "Admin", adminOnly: true },
  { id: "settings", label: "Settings" },
];

export default function AppShell({ view, onNavigate, children }: { view: View; onNavigate: (v: View) => void; children: ReactNode }) {
  const session = useSession();

  return (
    <div className="relative min-h-screen bg-[#04070a]">
      <div className="fixed inset-0 z-0"><HackerBg /></div>

      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#070d10]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <button className="flex items-center gap-2.5" onClick={() => onNavigate("dashboard")}>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.7)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="logo-glitch text-lg font-bold tracking-tight text-emerald-300">ATUL</span>
          </button>
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-300/90 md:flex">
            <span className="pulse-glow inline-block size-1.5 rounded-full bg-emerald-400" />
            system online
          </div>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.filter((n) => !n.adminOnly || session?.admin).map((n) => (
              <button
                key={n.id}
                onClick={() => onNavigate(n.id)}
                className={`neon-sweep shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === n.id ? "bg-emerald-500 text-black" : "text-emerald-200/70 hover:bg-white/10"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <ProviderBalance />
          <GhostButton className="text-emerald-200/80 hover:bg-white/10" onClick={() => signOut()}>Logout</GhostButton>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-6">{children}</main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 overflow-hidden border-t border-emerald-500/20 bg-[#04070a]/70 text-emerald-300/60">
        <div className="hacker-ticker whitespace-nowrap px-4 py-1 font-mono text-[10px] tracking-widest">
          SYS.MONITOR ▸ DRIP ENGINE ONLINE ▸ PROVIDER LINK OK ▸ ENCRYPTION AES-256 ▸ TRACE ROUTE 127.0.0.1 ▸ HEARTBEAT 1.5s ▸ ALL SYSTEMS NOMINAL ▸&nbsp;
        </div>
      </div>

      <style>{`
        @keyframes glitchText {
          0%, 100% { text-shadow: 0 0 8px rgba(52,211,153,0.8); }
          18% { transform: translate(-2px, 0); text-shadow: -3px 0 #ff2d55, 3px 0 #00e5ff; clip-path: inset(10% 0 40% 0); }
          22% { transform: translate(2px, 0); clip-path: inset(60% 0 10% 0); }
          40% { transform: translate(-1px, 0); text-shadow: 2px 0 #ff2d55, -2px 0 #00e5ff; }
          58% { transform: translate(1px, -1px); }
          80% { transform: translate(-1px, 1px); }
        }
        .logo-glitch { display: inline-block; animation: glitchText 3.2s infinite steps(1); }
        @keyframes tickerScroll { from { transform: translateX(100%); } to { transform: translateX(-100%); } }
        .hacker-ticker { display: inline-block; animation: tickerScroll 18s linear infinite; }
      `}</style>
    </div>
  );
}
