/** Caution-stripe hatch block — section separators and dead-space filler. */
export default function HatchStrip({
  height = 8,
  dim = true,
  className = '',
}: {
  height?: number
  dim?: boolean
  className?: string
}) {
  return <div aria-hidden className={`${dim ? 'hatch-dim' : 'hatch'} w-full ${className}`} style={{ height }} />
}
