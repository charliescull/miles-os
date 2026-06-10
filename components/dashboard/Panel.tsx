import { ReactNode } from 'react'
import { HudFrame, Serial } from '@/components/hud'

interface PanelProps {
  id?: string
  label?: string
  badge?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  noPadding?: boolean
}

/**
 * B&W 2.0 panel — corner-bracket HUD frame with a spec-sheet header.
 * API unchanged from V3.1 so every existing card keeps working.
 */
export default function Panel({ id, label, badge, action, children, className = '', noPadding }: PanelProps) {
  return (
    <HudFrame className={`flex flex-col ${className}`}>
      {(id || label) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            {id && <span className="hud text-[oklch(0.30_0_0)] text-[10px]">{id} //</span>}
            {label && <span className="card-label text-[oklch(0.70_0_0)]">{label}</span>}
            {badge && <span>{badge}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {action}
            <Serial seed={`panel:${id ?? label ?? 'x'}`} groups={[2, 4]} className="hidden lg:inline" />
          </div>
        </div>
      )}
      <div className={noPadding ? 'flex-1 min-h-0' : 'flex-1 min-h-0 p-3'}>
        {children}
      </div>
    </HudFrame>
  )
}
