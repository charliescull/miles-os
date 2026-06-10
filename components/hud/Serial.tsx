import { serialFor } from './seed'

/** Diegetic serial code — stable per seed, pure furniture. */
export default function Serial({
  seed,
  groups,
  className = '',
}: {
  seed: string
  groups?: number[]
  className?: string
}) {
  return (
    <span className={`hud text-[9px] tracking-[0.2em] text-[oklch(0.30_0_0)] select-none ${className}`}>
      {serialFor(seed, groups)}
    </span>
  )
}
