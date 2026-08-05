import Shell from '@/components/dashboard/Shell'
import BootGate from '@/components/boot/BootGate'
import HomeBrain from '@/components/dashboard/HomeBrain'
import OperatorCard from '@/components/dashboard/OperatorCard'
import SystemCard from '@/components/dashboard/SystemCard'
import SessionCard from '@/components/dashboard/SessionCard'
import HabitsCard from '@/components/dashboard/HabitsCard'
import CalendarCard from '@/components/dashboard/CalendarCard'
import NutritionCard from '@/components/dashboard/NutritionCard'
import { HatchStrip } from '@/components/hud'

export default function HomePage() {
  return (
    <Shell>
      <BootGate>
        {/* Mobile is schedule-only: everything but the calendar is lg-and-up. */}
        <div
          className="flex flex-col h-[calc(100vh-40px)] lg:grid"
          style={{
            gridTemplateColumns: 'minmax(280px, 300px) 1fr minmax(280px, 300px)',
            gap: '1px',
            background: 'oklch(0.82 0.13 225 / 0.10)',
          }}
        >
          {/* Left column — operator + system vitals */}
          <div className="hidden lg:flex flex-col overflow-y-auto bg-black" style={{ gap: '1px' }}>
            <OperatorCard />
            <SystemCard />
          </div>

          {/* Centre column — the living organ, HUD furniture beneath */}
          <div className="flex flex-1 min-h-0 lg:flex-none flex-col overflow-y-auto bg-black" style={{ gap: '1px' }}>
            <HomeBrain className="hidden lg:block flex-none h-[28vh] min-h-[220px]" />
            <div className="hidden lg:block">
              <HatchStrip height={6} />
            </div>
            <div className="hidden lg:contents">
              <SessionCard />
              <HabitsCard />
            </div>
            <CalendarCard className="flex-1 min-h-0 lg:flex-none" />
          </div>

          {/* Right column — fuel */}
          <div className="hidden lg:flex flex-col overflow-y-auto bg-black">
            <NutritionCard />
          </div>
        </div>
      </BootGate>
    </Shell>
  )
}
