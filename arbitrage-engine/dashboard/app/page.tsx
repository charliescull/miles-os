"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Boxes, Percent, Trophy, SlidersHorizontal } from "lucide-react";
import TopRail from "@/components/TopRail";
import OpportunityCard from "@/components/OpportunityCard";
import { DEMO_MODE, getSupabase } from "@/lib/supabaseClient";
import { DEMO_OPPORTUNITIES } from "@/lib/demo";
import { usd, pct } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

type Conn = "demo" | "live" | "offline" | "loading";
type Sort = "roi" | "net" | "new";
const SORTS: { key: Sort; label: string }[] = [
  { key: "roi", label: "ROI" },
  { key: "net", label: "Net $" },
  { key: "new", label: "Newest" },
];
const STATUSES = ["all", "new", "reviewing", "bought"] as const;

export default function Page() {
  const [items, setItems] = useState<Opportunity[]>(() => (DEMO_MODE ? DEMO_OPPORTUNITIES : []));
  const [conn, setConn] = useState<Conn>(() => (DEMO_MODE ? "demo" : getSupabase() ? "loading" : "offline"));
  const [sort, setSort] = useState<Sort>("roi");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  useEffect(() => {
    if (DEMO_MODE) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;

    supabase
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (!active) return;
        if (data) setItems(data as Opportunity[]);
        setConn("live");
      });

    const channel = supabase
      .channel("opportunities-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "opportunities" },
        (p) => setItems((prev) => [p.new as Opportunity, ...prev]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "opportunities" },
        (p) => setItems((prev) => prev.map((o) => (o.id === (p.new as Opportunity).id ? (p.new as Opportunity) : o))))
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  const stats = useMemo(() => {
    const open = items.filter((o) => o.status !== "passed");
    const net = open.reduce((s, o) => s + (o.net_profit || 0), 0);
    const avg = open.length ? open.reduce((s, o) => s + (o.roi || 0), 0) / open.length : 0;
    const best = open.reduce((m, o) => Math.max(m, o.roi || 0), 0);
    return { count: open.length, net, avg, best };
  }, [items]);

  const shown = useMemo(() => {
    let list = status === "all" ? items : items.filter((o) => o.status === status);
    list = [...list].sort((a, b) =>
      sort === "roi" ? b.roi - a.roi : sort === "net" ? b.net_profit - a.net_profit
      : +new Date(b.created_at) - +new Date(a.created_at));
    return list;
  }, [items, sort, status]);

  return (
    <main className="min-h-screen">
      <TopRail conn={conn} />

      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {/* title */}
        <div className="mb-4">
          <h1 className="text-lg font-bold tracking-tight text-white">Opportunity Feed</h1>
          <p className="text-xs" style={{ color: "oklch(0.5 0 0)" }}>
            Human-in-the-loop arbitrage alerts · verify condition &amp; secure resale exemption before buying
          </p>
        </div>

        {/* stat rail */}
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={<Boxes size={14} />} label="Open opportunities" value={String(stats.count)} />
          <StatCard icon={<TrendingUp size={14} />} label="Total net (if all flip)" value={usd(stats.net)} accent />
          <StatCard icon={<Percent size={14} />} label="Avg ROI" value={pct(stats.avg)} />
          <StatCard icon={<Trophy size={14} />} label="Best ROI" value={pct(stats.best)} />
        </section>

        {/* controls */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal size={12} style={{ color: "oklch(0.45 0 0)" }} />
            <span className="card-label">Sort</span>
            <div className="flex gap-1">
              {SORTS.map((s) => (
                <button key={s.key} onClick={() => setSort(s.key)}
                  className="mono rounded-sm px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors"
                  style={pillStyle(sort === s.key)}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="card-label">Status</span>
            <div className="flex gap-1">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className="rounded-sm px-2 py-1 text-[10px] font-semibold capitalize tracking-wide transition-colors"
                  style={pillStyle(status === s)}>{s}</button>
              ))}
            </div>
          </div>
          <span className="ml-auto mono text-[10px]" style={{ color: "oklch(0.4 0 0)" }}>
            {shown.length} shown
          </span>
        </div>

        {/* feed */}
        {conn === "loading" ? (
          <Grid>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}</Grid>
        ) : shown.length === 0 ? (
          <EmptyState conn={conn} />
        ) : (
          <Grid>{shown.map((o, i) => (
            <OpportunityCard key={o.id} o={o} index={i}
              onUpdated={(u) => setItems((prev) => prev.map((x) => (x.id === u.id ? u : x)))} />
          ))}</Grid>
        )}
      </div>
    </main>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">{children}</section>;
}

function pillStyle(active: boolean): React.CSSProperties {
  return active
    ? { background: "oklch(0.96 0 0)", color: "oklch(0.1 0 0)" }
    : { background: "oklch(0.14 0 0)", color: "oklch(0.6 0 0)", border: "1px solid var(--card-border)" };
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="card rounded-sm p-3.5">
      <div className="flex items-center gap-1.5" style={{ color: "oklch(0.5 0 0)" }}>
        {icon}<span className="card-label">{label}</span>
      </div>
      <div className="mono mt-1.5 text-2xl font-bold leading-none" style={{ color: accent ? "oklch(0.78 0.16 145)" : "white" }}>
        {value}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="card rounded-sm p-3.5">
      <div className="skeleton h-3 w-24 rounded-sm" />
      <div className="skeleton mt-2 h-4 w-full rounded-sm" />
      <div className="skeleton mt-4 h-8 w-1/2 rounded-sm" />
      <div className="skeleton mt-3 h-2 w-full rounded-sm" />
      <div className="skeleton mt-4 h-8 w-full rounded-sm" />
    </div>
  );
}

function EmptyState({ conn }: { conn: Conn }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 rounded-sm p-16 text-center">
      <Boxes size={28} style={{ color: "oklch(0.35 0 0)" }} />
      <div className="text-sm font-semibold text-white">No opportunities yet</div>
      <p className="max-w-sm text-xs leading-relaxed" style={{ color: "oklch(0.5 0 0)" }}>
        {conn === "offline"
          ? "Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, or NEXT_PUBLIC_DEMO=1 to preview."
          : "The scraper hasn't pushed any qualifying deals yet. New opportunities appear here in real time as they clear the 25% ROI + liquidity bar."}
      </p>
    </div>
  );
}
