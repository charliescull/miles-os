'use client'

import dynamic from 'next/dynamic'
import { Serial, useReducedMotion } from '@/components/hud'

// 3D stack stays out of the first-paint bundle
const SceneCanvas = dynamic(() => import('./SceneCanvas'), { ssr: false })
const Brain = dynamic(() => import('./Brain'), { ssr: false })

/**
 * HOME's centerpiece: the living brain with diegetic stage furniture.
 * Gold-standard organ pattern — HEALTH/CRM/FINANCE clone this layout
 * with their own organ inside SceneCanvas.
 */
export default function BrainStage({
  liveliness = 0.5,
  className = '',
}: {
  liveliness?: number
  className?: string
}) {
  const reduced = useReducedMotion()

  return (
    <div className={`relative ${className}`} data-brain-stage>
      <SceneCanvas className="absolute inset-0" camera={{ position: [0, 0.15, 3.1], fov: 42 }}>
        <Brain liveliness={liveliness} paused={reduced} />
      </SceneCanvas>

      {/* stage furniture — margins of the specimen chamber */}
      <div aria-hidden className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between hud text-[9px] tracking-[0.2em] text-[oklch(0.38_0_0)]">
        <div className="flex justify-between">
          <span>NEURAL CORE // CTX-2600</span>
          <span className="drift-breathe text-[oklch(0.60_0_0)]">ROTATION: CONTINUOUS</span>
        </div>
        <div className="flex justify-between items-end">
          <Serial seed="brain-stage" groups={[3, 4, 2]} />
          <span>ACTIVITY {Math.round(liveliness * 100).toString().padStart(3, '0')}%</span>
        </div>
      </div>

      {/* hairline crosshair through the specimen */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[oklch(0.82_0.13_225/0.07)]" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[oklch(0.82_0.13_225/0.07)]" />
      </div>
    </div>
  )
}
