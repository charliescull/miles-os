'use client'

import dynamic from 'next/dynamic'
import { Serial } from '@/components/hud'

const SceneCanvas = dynamic(() => import('./SceneCanvas'), { ssr: false })
const Constellation = dynamic(() => import('./Constellation'), { ssr: false })

export default function CrmStage({
  nodeCount = 80,
  staleRatio = 0.3,
  className = '',
}: {
  nodeCount?: number
  staleRatio?: number
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <SceneCanvas className="absolute inset-0" camera={{ position: [0, 0, 4.2], fov: 42 }}>
        <Constellation nodeCount={nodeCount} staleRatio={staleRatio} />
      </SceneCanvas>
      <div aria-hidden className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between hud text-[9px] tracking-[0.2em] text-[oklch(0.38_0_0)]">
        <div className="flex justify-between">
          <span>RELATIONSHIP MESH // NET-{String(nodeCount).padStart(3, '0')}</span>
          <span className="text-[oklch(0.60_0_0)]">{Math.round((1 - staleRatio) * 100)}% ACTIVE</span>
        </div>
        <div className="flex justify-between items-end">
          <Serial seed="crm-stage" groups={[3, 4, 2]} />
          <span>ROTATION: CONTINUOUS</span>
        </div>
      </div>
    </div>
  )
}
