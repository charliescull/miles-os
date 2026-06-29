'use client'

import { useEffect, useState } from 'react'
import Panel from './Panel'
import { BlockGauge, SpecRow, Barcode, HatchStrip } from '@/components/hud'
import { config } from '@/lib/config'

/**
 * HOME left-column telemetry — diegetic "machine vitals" that fill the operator
 * column with on-brand HUD density (no new data dependencies). Session uptime
 * ticks client-side; the rest are status stamps in the Jarvis register.
 */
export default function SystemCard() {
  const [uptime, setUptime] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setUptime(u => u + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = String(Math.floor(uptime / 3600)).padStart(2, '0')
  const mm = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0')
  const ss = String(uptime % 60).padStart(2, '0')

  return (
    <Panel id="02" label="SYSTEM" className="min-h-0">
      <div className="space-y-2">
        <SpecRow label="BUILD" value="MILES OS · V3.1" />
        <SpecRow label="STATION" value={config.location.toUpperCase()} />
        <SpecRow label="UPLINK" value="SECURE" signal="up" />
        <SpecRow label="UPTIME" value={`${hh}:${mm}:${ss}`} />
      </div>

      <HatchStrip height={5} className="my-3 opacity-60" />

      {/* decorative subsystem load — pure HUD furniture */}
      <div className="space-y-2">
        <div>
          <p className="card-label mb-1">CAPTURE PIPELINE</p>
          <BlockGauge ratio={0.92} segments={14} />
        </div>
        <div>
          <p className="card-label mb-1">MEMORY LATTICE</p>
          <BlockGauge ratio={0.74} segments={14} />
        </div>
        <div>
          <p className="card-label mb-1">CLASSIFIER WARMTH</p>
          <BlockGauge ratio={0.86} segments={14} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="card-label text-[var(--jarvis-dim)]">CORE NOMINAL</span>
        <Barcode seed="system-card" bars={20} height={12} className="opacity-50" />
      </div>
    </Panel>
  )
}
