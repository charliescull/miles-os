'use client'

import dynamic from 'next/dynamic'
import { Serial, useReducedMotion } from '@/components/hud'
import EkgLine from './EkgLine'

const SceneCanvas = dynamic(() => import('./SceneCanvas'), { ssr: false })
const Heart = dynamic(() => import('./Heart'), { ssr: false })

/**
 * HEALTH centerpiece: beating heart + locked EKG strip + diegetic furniture.
 * Clones the brain-stage pattern (organ in SceneCanvas, margins as HUD).
 */
export default function HeartStage({
  bpm = 64,
  className = '',
}: {
  bpm?: number
  className?: string
}) {
  const reduced = useReducedMotion()

  return (
    <div className={`relative ${className}`}>
      <SceneCanvas className="absolute inset-0" camera={{ position: [0, 0.05, 3.0], fov: 42 }}>
        <Heart bpm={bpm} paused={reduced} />
      </SceneCanvas>

      {/* EKG strip across the bottom */}
      <div className="absolute left-0 right-0 bottom-7 px-4 pointer-events-none">
        <EkgLine bpm={bpm} className="w-full h-[54px]" />
      </div>

      {/* furniture */}
      <div aria-hidden className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between hud text-[9px] tracking-[0.2em] text-[oklch(0.38_0_0)]">
        <div className="flex justify-between">
          <span>CARDIAC CORE // HRT-Σ</span>
          <span className="text-[oklch(0.60_0_0)]">{bpm} BPM · SINUS</span>
        </div>
        <div className="flex justify-between items-end">
          <Serial seed="heart-stage" groups={[3, 4, 2]} />
          <span>RHYTHM: STABLE</span>
        </div>
      </div>
    </div>
  )
}
