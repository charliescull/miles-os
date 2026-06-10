import { seededRandom } from './seed'

/** CSS barcode — deterministic bar widths from seed. Pure furniture. */
export default function Barcode({
  seed,
  bars = 28,
  height = 14,
  className = '',
}: {
  seed: string
  bars?: number
  height?: number
  className?: string
}) {
  const rnd = seededRandom(seed)
  const widths = Array.from({ length: bars }, () => (rnd() < 0.32 ? 3 : rnd() < 0.6 ? 2 : 1))
  return (
    <div className={`flex items-stretch gap-[1.5px] select-none ${className}`} style={{ height }} aria-hidden>
      {widths.map((w, i) => (
        <span
          key={i}
          style={{ width: w, opacity: w === 3 ? 0.9 : w === 2 ? 0.65 : 0.4 }}
          className="bg-white"
        />
      ))}
    </div>
  )
}
