"use client";

import { useEffect, useState } from "react";

type Conn = "demo" | "live" | "offline" | "loading";

const CONN: Record<Conn, { label: string; color: string }> = {
  live: { label: "LIVE", color: "oklch(0.78 0.16 145)" },
  demo: { label: "DEMO DATA", color: "oklch(0.84 0.14 90)" },
  offline: { label: "NO DB", color: "oklch(0.72 0.18 25)" },
  loading: { label: "CONNECTING", color: "oklch(0.6 0 0)" },
};

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const up = () =>
      setT(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    up();
    const id = setInterval(up, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="mono text-xs text-white tabular-nums">{t}</span>;
}

export default function TopRail({ conn }: { conn: Conn }) {
  const c = CONN[conn];
  return (
    <header
      className="sticky top-0 z-50 flex h-11 flex-shrink-0 items-center justify-between border-b px-4 backdrop-blur-sm"
      style={{ borderColor: "oklch(1 0 0 / 0.06)", background: "oklch(0.08 0 0 / 0.95)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="mono text-xs font-semibold text-white whitespace-nowrap">
          ARBITRAGE<span style={{ color: "oklch(0.78 0.16 145)" }}>{" // "}</span>STRATEGY&nbsp;B
        </span>
        <span className="card-label hidden sm:inline">Business &amp; Industrial Desk</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="online-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
          <span className="mono text-[10px] font-semibold tracking-wider" style={{ color: c.color }}>{c.label}</span>
        </span>
        <Clock />
      </div>
    </header>
  );
}
