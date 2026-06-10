'use client'

import dynamic from 'next/dynamic'
import { Serial } from '@/components/hud'

const SceneCanvas = dynamic(() => import('./SceneCanvas'), { ssr: false })
const Core = dynamic(() => import('./Core'), { ssr: false })

export default function FinanceStage({
  pnlSign = 0,
  tickers = [],
  className = '',
}: {
  pnlSign?: number
  tickers?: { weight: number; label?: string }[]
  className?: string
}) {
  const state = pnlSign > 0 ? 'UP' : pnlSign < 0 ? 'DOWN' : 'FLAT'
  const stateColor = pnlSign > 0 ? 'text-[var(--signal-up)]' : pnlSign < 0 ? 'text-[var(--signal-down)]' : 'text-[oklch(0.60_0_0)]'
  return (
    <div className={`relative ${className}`}>
      <SceneCanvas className="absolute inset-0" camera={{ position: [0, 0, 4.4], fov: 42 }}>
        <Core pnlSign={pnlSign} tickers={tickers} />
      </SceneCanvas>
      <div aria-hidden className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between hud text-[9px] tracking-[0.2em] text-[oklch(0.38_0_0)]">
        <div className="flex justify-between">
          <span>NET-WORTH CORE // VAL-Σ</span>
          <span className={stateColor}>DAY P/L: {state}</span>
        </div>
        <div className="flex justify-between items-end">
          <Serial seed="finance-stage" groups={[3, 4, 2]} />
          <span>{tickers.length} POSITIONS ORBITING</span>
        </div>
      </div>
    </div>
  )
}
