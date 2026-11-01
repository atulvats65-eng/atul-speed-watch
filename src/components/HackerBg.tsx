import { useEffect, useRef } from "react";

// Decorative "digital rain" matrix background + grid + scanlines. Purely visual
// (pointer-events: none), sits behind the app content.
export default function HackerBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const glyphs = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF#$%&@<>*+-=".split("");

    let width = 0;
    let height = 0;
    let rows = 0;
    let streams: number[] = [];
    const fontSize = 14;
    const SPEED = 6; // px per frame — fast right→left data stream

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      rows = Math.floor(height / fontSize);
      // each row starts somewhere off to the right (streaming in)
      streams = Array.from({ length: rows }, () => width + Math.random() * width);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = 0;

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 33) return; // ~30fps — smooth but not heavy
      last = ts;

      ctx.fillStyle = "rgba(4, 8, 10, 0.09)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `bold ${fontSize}px monospace`;
      for (let i = 0; i < rows; i++) {
        const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        const y = i * fontSize;
        const x = streams[i]!;
        // leading edge = leftmost (right→left motion)
        const lead = x < fontSize * 1.5 && x > -fontSize;
        ctx.fillStyle = lead ? "#d1fae5" : Math.random() > 0.92 ? "#86efac" : "#22c55e";
        ctx.shadowColor = lead ? "#22c55e" : "transparent";
        ctx.shadowBlur = lead ? 12 : 0;
        ctx.fillText(ch!, x, y);
        ctx.shadowBlur = 0;
        streams[i] = x - SPEED;
        if (streams[i]! < -fontSize * 2) {
          streams[i] = width + Math.random() * width * 0.4;
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Floating data particles (deterministic positions).
  const particles = Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 17 + 5) % 100}%`,
    animationDuration: `${7 + (i % 5) * 2}s`,
    animationDelay: `${(i % 7) * 1.3}s`,
    scale: 0.5 + (i % 3) * 0.35,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* base + grid */}
      <div className="absolute inset-0 bg-[#04070a]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,197,94,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* matrix rain */}
      <canvas ref={canvasRef} className="absolute inset-0 opacity-70" />

      {/* floating data particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          className="particle"
          style={{ left: p.left, animationDuration: p.animationDuration, animationDelay: p.animationDelay, transform: `scale(${p.scale})` }}
        />
      ))}

      {/* scanlines */}
      <div
        className="absolute inset-0 opacity-[0.10] mix-blend-overlay"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.7) 0px, rgba(255,255,255,0.7) 1px, transparent 1px, transparent 3px)",
        }}
      />
      {/* moving scan bar */}
      <div className="hacker-scan" />

      {/* CRT flicker overlay */}
      <div className="crt-flicker absolute inset-0" />

      {/* rotating targeting reticle */}
      <div className="spin-slow absolute left-1/2 top-1/2 hidden h-40 w-40 -translate-x-1/2 -translate-y-1/2 opacity-10 lg:block">
        <svg viewBox="0 0 100 100" width="160" height="160" fill="none" stroke="#22c55e" strokeWidth="1.5">
          <circle cx="50" cy="50" r="46" />
          <circle cx="50" cy="50" r="2" className="pulse-glow" fill="#22c55e" stroke="none" />
          <path d="M50 0V16M50 84V100M0 50H16M84 50H100" />
          <path d="M12 12 22 22M78 78 88 88M88 12 78 22M12 88 22 78" />
        </svg>
      </div>

      {/* boot sequence terminal */}
      <div className="glitch-jitter absolute bottom-6 left-4 hidden w-72 rounded-lg border border-emerald-500/30 bg-black/60 p-3 font-mono text-[10px] leading-relaxed text-emerald-300/90 backdrop-blur-md sm:block">
        <div className="mb-2 flex gap-1.5">
          <span className="size-2 rounded-full bg-red-500/80" />
          <span className="size-2 rounded-full bg-amber-500/80" />
          <span className="size-2 rounded-full bg-emerald-500/80" />
        </div>
        <p>&gt; boot.sequence … <span className="text-emerald-200">OK</span></p>
        <p>&gt; initializing delivery.engine …</p>
        <p className="text-emerald-200">
          <span className="pulse-glow inline-block size-1.5 rounded-full bg-emerald-400 align-middle" /> drips armed · seed 0x5F
        </p>
        <p>&gt; net.socket 0x1F3A … <span className="text-emerald-200">linked</span></p>
        <p className="type-caret">&gt; waiting for orders…</p>
        <p className="text-emerald-200/60">&gt; ciphers AES-256 · handshake stable</p>
      </div>

      {/* secondary terminal */}
      <div className="absolute right-4 top-20 hidden w-60 rounded-lg border border-emerald-500/25 bg-black/50 p-3 font-mono text-[10px] leading-relaxed text-emerald-300/70 backdrop-blur-md lg:block">
        <p>&gt; decrypt payload… <span className="text-emerald-200">done</span></p>
        <p>&gt; trace ▸ 127.0.0.1:8080</p>
        <p>&gt; heartbeat 1.5s</p>
        <p className="text-emerald-200/60">OK · all systems nominal</p>
      </div>

      {/* HUD corner brackets */}
      <div className="absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-emerald-400/60" />
      <div className="absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-emerald-400/60" />
      <div className="absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-emerald-400/60" />
      <div className="absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-emerald-400/60" />

      {/* vignette */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.7))" }} />
      <style>{`
        @keyframes hackerScanMove { 0% { top: -2%; } 100% { top: 100%; } }
        .hacker-scan {
          position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(74,222,128,0.9), transparent);
          filter: blur(1px);
          animation: hackerScanMove 6s linear infinite;
        }
        @keyframes cursorBlink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        .hacker-cursor { display: inline-block; animation: cursorBlink 1s steps(1) infinite; }
      `}</style>
    </div>
  );
}
