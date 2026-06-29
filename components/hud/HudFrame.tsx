import { ReactNode } from 'react'

/**
 * Corner-bracket frame — the basic HUD surface. Brackets are drawn with
 * 4 absolutely-positioned spans so the border itself can stay hairline.
 */
export default function HudFrame({
  children,
  className = '',
  bracket = 10,
  lit = false,
}: {
  children: ReactNode
  className?: string
  /** bracket arm length in px */
  bracket?: number
  /** lit frames get the box bloom */
  lit?: boolean
}) {
  const b = `${bracket}px`
  const arm = 'absolute w-[var(--arm)] h-[var(--arm)] border-[oklch(0.85_0.13_222/0.65)] pointer-events-none'
  return (
    <div
      className={`relative border border-[oklch(0.82_0.13_225/0.16)] bg-[oklch(0.03_0_0)] ${lit ? 'glow-box' : ''} ${className}`}
      style={{ ['--arm' as string]: b }}
    >
      <span aria-hidden className={`${arm} top-[-1px] left-[-1px] border-t border-l`} />
      <span aria-hidden className={`${arm} top-[-1px] right-[-1px] border-t border-r`} />
      <span aria-hidden className={`${arm} bottom-[-1px] left-[-1px] border-b border-l`} />
      <span aria-hidden className={`${arm} bottom-[-1px] right-[-1px] border-b border-r`} />
      {children}
    </div>
  )
}
