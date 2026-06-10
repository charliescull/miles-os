import { ReactNode } from 'react'

/** One line of spec-sheet data: label left, dotted leader, value right. */
export default function SpecRow({
  label,
  value,
  signal,
  className = '',
}: {
  label: string
  value: ReactNode
  signal?: 'up' | 'down'
  className?: string
}) {
  const valueColor =
    signal === 'up' ? 'text-[var(--signal-up)]' : signal === 'down' ? 'text-[var(--signal-down)]' : 'text-[oklch(0.88_0_0)]'
  return (
    <div className={`flex items-baseline gap-2 text-[11px] leading-relaxed ${className}`}>
      <span className="card-label flex-shrink-0">{label}</span>
      <span aria-hidden className="flex-1 border-b border-dotted border-white/15 translate-y-[-3px]" />
      <span className={`mono ${valueColor}`}>{value}</span>
    </div>
  )
}
