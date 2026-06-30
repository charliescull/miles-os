import Link from 'next/link'
import TaskList from '@/components/command/TaskList'
import CommandCalendar from '@/components/command/CommandCalendar'

export const metadata = { title: 'MILES // Mobile' }

// Installable mobile view (PWA start_url). Schedule + tasks only — no notes, to
// keep it tight vertically. Tasks check off here and sync with desktop/Telegram.
export default function MobilePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-black">
      <header className="flex items-center justify-between px-3 h-10 flex-shrink-0 border-b border-[oklch(0.82_0.13_225/0.22)] bg-black sticky top-0 z-50">
        <span className="display text-[11px] text-white glow">MILES <span className="text-[var(--jarvis-dim)]">// MOBILE</span></span>
        <Link href="/" className="hud text-[10px] tracking-[0.16em] text-[oklch(0.50_0_0)] hover:text-[var(--jarvis-bright)]">DESKTOP ›</Link>
      </header>

      <div className="flex-1 flex flex-col" style={{ gap: '1px', background: 'oklch(0.82 0.13 225 / 0.10)' }}>
        <div className="h-[46vh] min-h-[260px] flex flex-col bg-black">
          <CommandCalendar />
        </div>
        <div className="flex-1 min-h-[44vh] flex flex-col bg-black">
          <TaskList />
        </div>
      </div>
    </div>
  )
}
