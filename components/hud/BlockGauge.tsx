/**
 * Segmented block gauge — dense, calm, B&W. State color only when signal=true.
 */
export default function BlockGauge({
  ratio,
  segments = 20,
  signal,
  className = '',
}: {
  /** 0..1, clamped */
  ratio: number
  segments?: number
  /** 'up' | 'down' tints the lit blocks; omit for pure white */
  signal?: 'up' | 'down'
  className?: string
}) {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * segments)
  const litColor =
    signal === 'up' ? 'var(--signal-up)' : signal === 'down' ? 'var(--signal-down)' : 'oklch(1 0 0)'
  return (
    <div className={`flex gap-[2px] items-center ${className}`} role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="h-[8px] flex-1 min-w-[3px]"
          style={
            i < filled
              ? { background: litColor, boxShadow: `0 0 4px ${litColor}`, opacity: 0.95 }
              : { background: 'oklch(1 0 0 / 0.08)' }
          }
        />
      ))}
    </div>
  )
}
