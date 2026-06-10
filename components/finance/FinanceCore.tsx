'use client'

import { useEffect, useState } from 'react'
import FinanceStage from '@/components/three/FinanceStage'

/**
 * FINANCE organ wrapper. Core flashes green/red by daily P/L sign; orbiting
 * ticker nodes sized by position value. Reuses /api/finance/snapshot (sign) and
 * /api/finance (holding weights) with graceful fallback.
 */
export default function FinanceCore({ className = '' }: { className?: string }) {
  const [pnlSign, setPnlSign] = useState(0)
  const [tickers, setTickers] = useState<{ weight: number; label?: string }[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/finance/snapshot')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d && typeof d.daily_delta === 'number') setPnlSign(Math.sign(d.daily_delta)) })
      .catch(() => {})

    fetch('/api/finance')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d?.holdings) return
        const ts = d.holdings
          .filter((h: { positionValue: number | null }) => h.positionValue)
          .map((h: { positionValue: number; ticker: string }) => ({ weight: h.positionValue, label: h.ticker }))
        if (ts.length) setTickers(ts)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return <FinanceStage pnlSign={pnlSign} tickers={tickers} className={className} />
}
