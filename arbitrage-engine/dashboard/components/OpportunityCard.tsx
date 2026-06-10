"use client";

import { useState } from "react";
import { ExternalLink, Activity, Package, Brain, Check } from "lucide-react";
import type { Opportunity } from "@/lib/types";
import { usd, pct, ago } from "@/lib/format";

const ACCENT = "oklch(0.78 0.16 145)";
const DANGER = "oklch(0.72 0.18 25)";

function statusChip(s: string) {
  if (s === "bought" || s === "sold") return "chip chip-ok";
  if (s === "reviewing") return "chip chip-warm";
  if (s === "passed") return "chip chip-muted";
  return "chip chip-cool";
}

function SpreadBar({ o }: { o: Opportunity }) {
  const total = o.target_sell_price || 1;
  const fees = Math.max(0, o.total_cost - o.ask_price);
  const seg = (v: number) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-sm" style={{ background: "oklch(0.16 0 0)" }}>
        <div style={{ width: seg(o.ask_price), background: "oklch(0.40 0 0)" }} title={`Ask ${usd(o.ask_price)}`} />
        <div style={{ width: seg(fees), background: "oklch(0.78 0.16 90 / 0.8)" }} title={`Fees + freight ${usd(fees)}`} />
        <div style={{ width: seg(o.net_profit), background: ACCENT }} title={`Net ${usd(o.net_profit)}`} />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[10px]" style={{ color: "oklch(0.55 0 0)" }}>
        <Dot c="oklch(0.40 0 0)" /> Ask {usd(o.ask_price)}
        <Dot c="oklch(0.78 0.16 90)" /> Fees {usd(fees)}
        <Dot c={ACCENT} /> <span className="mono" style={{ color: ACCENT }}>Net {usd(o.net_profit)}</span>
      </div>
    </div>
  );
}
const Dot = ({ c }: { c: string }) => (
  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c }} />
);

function RoiGauge({ roi }: { roi: number }) {
  const max = 1.5;
  const fill = Math.max(2, Math.min(100, (roi / max) * 100));
  const tick = (0.25 / max) * 100;
  const col = roi >= 0.5 ? ACCENT : roi >= 0.25 ? "oklch(0.84 0.14 90)" : DANGER;
  return (
    <div className="relative mt-1 h-1.5 w-full overflow-visible rounded-full" style={{ background: "oklch(0.16 0 0)" }}>
      <div className="h-full rounded-full" style={{ width: `${fill}%`, background: col }} />
      <div className="absolute top-[-2px] h-[10px] w-px" style={{ left: `${tick}%`, background: "oklch(0.85 0 0 / 0.6)" }} title="25% trigger" />
    </div>
  );
}

/** Model's predicted realized profit vs. the deterministic estimate. */
function ModelLine({ o }: { o: Opportunity }) {
  if (o.model_score == null) return null;
  const conf = o.model_confidence ?? 0;
  const learning = conf < 0.05;
  const delta = o.model_score - o.net_profit;
  return (
    <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[11px]"
      style={{ background: "oklch(0.6 0.1 230 / 0.08)", border: "1px solid oklch(0.6 0.1 230 / 0.2)" }}>
      <Brain size={12} style={{ color: "oklch(0.72 0.1 230)" }} />
      <span className="card-label" style={{ color: "oklch(0.6 0.1 230)" }}>Model</span>
      <span className="mono text-white">{usd(o.model_score)}</span>
      <span style={{ color: "oklch(0.5 0 0)" }}>est. realized</span>
      {!learning && Math.abs(delta) >= 1 && (
        <span className="mono" style={{ color: delta >= 0 ? ACCENT : DANGER }}>
          ({delta >= 0 ? "+" : ""}{usd(delta)} vs math)
        </span>
      )}
      <span className="ml-auto mono text-[10px]" style={{ color: "oklch(0.45 0 0)" }}>
        {learning ? "learning…" : `conf ${pct(conf)}`}
      </span>
    </div>
  );
}

export default function OpportunityCard({
  o, index = 0, onUpdated,
}: { o: Opportunity; index?: number; onUpdated?: (o: Opportunity) => void }) {
  const roiCol = o.roi >= 0.25 ? ACCENT : DANGER;
  const [busy, setBusy] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [price, setPrice] = useState(String(o.target_sell_price));
  const [days, setDays] = useState("");

  const sold = o.realized_sale_price != null;
  const bought = o.decision === "bought";
  const passed = o.decision === "passed";

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    const optimistic = { ...o, ...body } as Opportunity;
    try {
      const res = await fetch("/api/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, ...body }),
      });
      const json = await res.json();
      onUpdated?.(res.ok && json.opportunity ? (json.opportunity as Opportunity) : optimistic);
    } catch {
      onUpdated?.(optimistic); // demo/offline: reflect locally so the UI still responds
    } finally {
      setBusy(false);
      setSellOpen(false);
    }
  }

  return (
    <article className="opp-card card rise flex flex-col gap-3 rounded-sm p-3.5"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "oklch(0.55 0 0)" }}>
            <Package size={11} style={{ color: ACCENT }} />
            <span className="font-semibold uppercase tracking-wider">{o.source}</span>
            {o.model_number && <span className="mono truncate">· {o.model_number}</span>}
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-snug text-white line-clamp-2">{o.title}</h3>
        </div>
        <span className={statusChip(o.status)}>{o.status}</span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="card-label">Net profit</div>
          <div className="mono text-2xl font-bold leading-none" style={{ color: ACCENT }}>{usd(o.net_profit)}</div>
        </div>
        <div className="text-right">
          <div className="card-label">ROI</div>
          <div className="mono text-2xl font-bold leading-none" style={{ color: roiCol }}>{pct(o.roi)}</div>
        </div>
      </div>
      <RoiGauge roi={o.roi} />
      <SpreadBar o={o} />

      <div className="grid grid-cols-3 gap-2 border-t pt-2.5" style={{ borderColor: "var(--card-border)" }}>
        <Stat label="Ask" value={usd(o.ask_price)} />
        <Stat label="Target sell" value={usd(o.target_sell_price)} />
        <Stat label="Total cost" value={usd(o.total_cost)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={o.liquidity_ok ? "chip chip-ok" : "chip chip-hot"}>
          <Activity size={10} />
          {o.liquidity_ok ? "Liquid" : "Illiquid"}
          {o.est_days_to_liquidate != null && o.est_days_to_liquidate < 9999 && ` · ~${o.est_days_to_liquidate}d`}
        </span>
        {o.sold_count_30d != null && <span className="chip chip-muted">{o.sold_count_30d} sold/30d</span>}
        <span className="ml-auto mono text-[10px]" style={{ color: "oklch(0.4 0 0)" }}>{ago(o.created_at)}</span>
      </div>

      <ModelLine o={o} />

      {/* realized outcome / decision actions — the training labels */}
      {sold ? (
        <div className="flex items-center gap-2 rounded-sm px-2 py-2 text-xs mono"
          style={{ background: "oklch(0.72 0.18 145 / 0.12)", color: ACCENT, border: "1px solid oklch(0.72 0.18 145 / 0.3)" }}>
          <Check size={13} /> Sold {usd(o.realized_sale_price)}
          {o.realized_days_to_sell != null && ` · ${o.realized_days_to_sell}d`}
        </div>
      ) : sellOpen ? (
        <div className="flex flex-col gap-2 rounded-sm p-2" style={{ background: "oklch(0.13 0 0)", border: "1px solid var(--card-border)" }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px]" style={{ color: "oklch(0.55 0 0)" }}>
              Sale price
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                className="mono mt-0.5 w-full rounded-sm bg-[oklch(0.1_0_0)] px-2 py-1 text-sm text-white outline-none"
                style={{ border: "1px solid var(--card-border)" }} />
            </label>
            <label className="text-[10px]" style={{ color: "oklch(0.55 0 0)" }}>
              Days to sell
              <input type="number" value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 8"
                className="mono mt-0.5 w-full rounded-sm bg-[oklch(0.1_0_0)] px-2 py-1 text-sm text-white outline-none"
                style={{ border: "1px solid var(--card-border)" }} />
            </label>
          </div>
          <div className="flex gap-2">
            <Btn primary disabled={busy || !price} onClick={() => send({
              realized_sale_price: Number(price),
              ...(days ? { realized_days_to_sell: Number(days) } : {}),
            })}>Save sale</Btn>
            <Btn onClick={() => setSellOpen(false)}>Cancel</Btn>
          </div>
        </div>
      ) : bought ? (
        <div className="flex gap-2">
          <Btn primary disabled={busy} onClick={() => setSellOpen(true)}>Mark sold</Btn>
        </div>
      ) : passed ? (
        <div className="flex items-center gap-2">
          <span className="chip chip-muted">Passed</span>
          <button disabled={busy} onClick={() => send({ decision: "undecided" })}
            className="text-[10px] underline" style={{ color: "oklch(0.5 0 0)" }}>undo</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Btn primary disabled={busy} onClick={() => send({ decision: "bought" })}>Bought</Btn>
          <Btn disabled={busy} onClick={() => send({ decision: "passed" })}>Pass</Btn>
        </div>
      )}

      <a href={o.source_url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-xs font-semibold tracking-wide transition-opacity hover:opacity-85"
        style={{ background: "oklch(0.72 0.18 145 / 0.14)", color: ACCENT, border: "1px solid oklch(0.72 0.18 145 / 0.35)" }}>
        View source listing <ExternalLink size={12} />
      </a>
    </article>
  );
}

function Btn({ children, onClick, primary, disabled }: {
  children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex-1 rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide transition-opacity disabled:opacity-40"
      style={primary
        ? { background: "oklch(0.72 0.18 145 / 0.16)", color: ACCENT, border: "1px solid oklch(0.72 0.18 145 / 0.4)" }
        : { background: "oklch(0.14 0 0)", color: "oklch(0.6 0 0)", border: "1px solid var(--card-border)" }}>
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="card-label">{label}</div>
      <div className="mono mt-0.5 text-sm text-white">{value}</div>
    </div>
  );
}
