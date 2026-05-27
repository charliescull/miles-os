import { ReactNode } from 'react'

interface PanelProps {
  id?: string
  label?: string
  badge?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export default function Panel({ id, label, badge, action, children, className = '', noPadding }: PanelProps) {
  return (
    <div className={`card rounded-sm flex flex-col ${className}`}>
      {(id || label) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(1_0_0/0.05)]">
          <div className="flex items-center gap-2">
            {id && (
              <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">{id} //</span>
            )}
            {label && (
              <span className="card-label">{label}</span>
            )}
            {badge && <span>{badge}</span>}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={noPadding ? 'flex-1 min-h-0' : 'flex-1 min-h-0 p-3'}>
        {children}
      </div>
    </div>
  )
}
