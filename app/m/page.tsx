import Link from 'next/link'
import MobileCommandCenter from '@/components/mobile/MobileCommandCenter'

export const metadata = { title: 'MILES // Mobile' }

export default function MobilePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-black">
      <header className="flex items-center justify-between px-3 h-10 flex-shrink-0 border-b border-[oklch(0.82_0.13_225/0.22)] bg-black sticky top-0 z-50">
        <span className="display text-[11px] text-white glow">MILES <span className="text-[var(--jarvis-dim)]">{'// MOBILE'}</span></span>
        <Link href="/" className="hud text-[10px] tracking-[0.16em] text-[oklch(0.50_0_0)] hover:text-[var(--jarvis-bright)]">DESKTOP ›</Link>
      </header>

      <MobileCommandCenter />
    </div>
  )
}
