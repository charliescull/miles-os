'use client'

import { useEffect, useMemo, useState } from 'react'
import Shell from '@/components/dashboard/Shell'
import styles from './capital.module.css'

interface Holding {
  ticker: string
  companyName: string | null
  shares: number
  price: number | null
  positionValue: number | null
  move7dAbs: number | null
  move7dPct: number | null
  sector: string
}

interface FinanceView {
  netWorth: number
  investmentsSide: number
  buyingPower: number
  bankBalance: number
  income?: number
  spendWeek?: number
  total7dAbs: number
  total7dPct: number
  holdings: Holding[]
  sectorPie: { label: string; value: number }[]
  capPie: { label: string; value: number }[]
  fetchedAt: string
}

const usd = (value: number | null | undefined, digits = 0) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value)

const pct = (value: number | null | undefined) =>
  value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`

const ventures = [
  { name: 'VENTURE I', status: 'BUILDING', note: 'Roadmap · operating plan · linked workspace' },
  { name: 'VENTURE II', status: 'RESEARCH', note: 'Market map · thesis · next decision' },
  { name: 'PROJECTS', status: 'ACTIVE', note: 'Ideas, experiments and capital allocation' },
]

export default function CapitalPage() {
  const [data, setData] = useState<FinanceView | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/finance')
      .then(async res => {
        if (!res.ok) throw new Error('finance request failed')
        return res.json()
      })
      .then(value => {
        if (!cancelled) setData(value)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const topHoldings = useMemo(
    () => [...(data?.holdings ?? [])].sort((a, b) => (b.positionValue ?? 0) - (a.positionValue ?? 0)).slice(0, 6),
    [data],
  )

  const sectors = useMemo(
    () => [...(data?.sectorPie ?? [])].sort((a, b) => b.value - a.value).slice(0, 5),
    [data],
  )

  return (
    <Shell>
      <main className={styles.page}>
        <div className={styles.grain} aria-hidden />
        <header className={styles.hero}>
          <div className={styles.heroArchitecture} aria-hidden>
            <div className={styles.towerLeft} />
            <div className={styles.towerCenter} />
            <div className={styles.towerRight} />
            <div className={styles.sunburst} />
          </div>

          <div className={styles.heroTopline}>
            <span>THINK TANK</span>
            <span>CAPITAL HOUSE</span>
            <span>{data?.fetchedAt ? `UPDATED ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'LIVE LEDGER'}</span>
          </div>

          <div className={styles.heroContent}>
            <p className={styles.kicker}>PRIVATE CAPITAL · MARKETS · VENTURES</p>
            <h1>Capital</h1>
            <p className={styles.heroCopy}>A single command room for money, markets, ventures and assets.</p>
          </div>

          <div className={styles.heroLedger}>
            <Metric label="NET WORTH" value={loading ? '—' : usd(data?.netWorth)} />
            <Metric label="INVESTED" value={loading ? '—' : usd(data?.investmentsSide)} />
            <Metric label="CASH" value={loading ? '—' : usd(data?.bankBalance)} />
            <Metric label="BUYING POWER" value={loading ? '—' : usd(data?.buyingPower)} />
          </div>
        </header>

        <section className={styles.marketBand}>
          <div>
            <span className={styles.eyebrow}>SEVEN DAY POSITION</span>
            <strong className={(data?.total7dAbs ?? 0) >= 0 ? styles.positive : styles.negative}>
              {loading ? '—' : `${pct(data?.total7dPct)} · ${usd(data?.total7dAbs, 2)}`}
            </strong>
          </div>
          <div className={styles.flowCopy}>
            <span>{usd(data?.income ?? 0)} IN</span>
            <i />
            <span>{usd(data?.spendWeek ?? 0)} WEEKLY OUT</span>
          </div>
        </section>

        <section className={styles.grid}>
          <DecoPanel className={styles.holdingsPanel} title="MARKETS" subtitle="Largest positions">
            <div className={styles.holdingList}>
              {topHoldings.length ? topHoldings.map((holding, index) => (
                <div className={styles.holdingRow} key={holding.ticker}>
                  <span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span>
                  <div className={styles.holdingName}>
                    <strong>{holding.ticker}</strong>
                    <small>{holding.companyName || holding.sector || 'POSITION'}</small>
                  </div>
                  <span>{usd(holding.positionValue)}</span>
                  <span className={(holding.move7dAbs ?? 0) >= 0 ? styles.positive : styles.negative}>{pct(holding.move7dPct)}</span>
                </div>
              )) : <EmptyState text={loading ? 'Opening the market ledger…' : 'No positions found.'} />}
            </div>
          </DecoPanel>

          <DecoPanel className={styles.sectorPanel} title="EXPOSURE" subtitle="Portfolio architecture">
            <div className={styles.sectorList}>
              {sectors.length ? sectors.map((sector, index) => {
                const max = sectors[0]?.value || 1
                return (
                  <div className={styles.sectorRow} key={sector.label}>
                    <div><span>{sector.label}</span><b>{Math.round(sector.value)}%</b></div>
                    <div className={styles.bar}><i style={{ width: `${Math.max(6, (sector.value / max) * 100)}%` }} /></div>
                    <small>0{index + 1}</small>
                  </div>
                )
              }) : <EmptyState text="Exposure data will appear here." />}
            </div>
          </DecoPanel>

          <DecoPanel className={styles.venturesPanel} title="VENTURES" subtitle="Build, operate, allocate">
            <div className={styles.ventureGrid}>
              {ventures.map(item => (
                <button key={item.name} className={styles.ventureCard} type="button">
                  <span>{item.status}</span>
                  <strong>{item.name}</strong>
                  <p>{item.note}</p>
                  <b>OPEN ROOM →</b>
                </button>
              ))}
            </div>
          </DecoPanel>

          <DecoPanel className={styles.assetPanel} title="ASSETS" subtitle="Targets and objects">
            <div className={styles.assetStage}>
              <div className={styles.carSilhouette} aria-hidden>
                <div className={styles.carRoof} />
                <div className={styles.carBody} />
                <div className={styles.wheelOne} />
                <div className={styles.wheelTwo} />
              </div>
              <div className={styles.assetCopy}>
                <span>2022 PORSCHE 718 CAYMAN GTS 4.0</span>
                <h3>The target should feel earned, not decorative.</h3>
                <p>This stage is prepared for the improved Three.js Cayman scene and asset milestone data.</p>
              </div>
            </div>
          </DecoPanel>
        </section>
      </main>
    </Shell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>
}

function DecoPanel({ title, subtitle, className = '', children }: { title: string; subtitle: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`${styles.panel} ${className}`}>
      <div className={styles.panelCap}><i /><span>◆</span><i /></div>
      <header><div><span>{subtitle}</span><h2>{title}</h2></div><b>TT · C</b></header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.empty}>{text}</div>
}
