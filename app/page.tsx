import Shell from '@/components/dashboard/Shell'
import BootGate from '@/components/boot/BootGate'
import HomeBrain from '@/components/dashboard/HomeBrain'
import OperatorCard from '@/components/dashboard/OperatorCard'
import FinancePulseCard from '@/components/dashboard/FinancePulseCard'
import KeyBlockersCard from '@/components/dashboard/KeyBlockersCard'
import SessionCard from '@/components/dashboard/SessionCard'
import HabitsCard from '@/components/dashboard/HabitsCard'
import CalendarCard from '@/components/dashboard/CalendarCard'
import NutritionCard from '@/components/dashboard/NutritionCard'
import { HatchStrip } from '@/components/hud'

export default function HomePage() {
  return (
    <Shell>
      <BootGate>
        <div
          className="flex flex-col lg:grid lg:h-[calc(100vh-40px)]"
          style={{
            gridTemplateColumns: '280px 1fr 280px',
            gap: '1px',
            background: 'oklch(1 0 0 / 0.06)',
          }}
        >
          {/* Left column — operator + money + blockers */}
          <div className="flex flex-col overflow-y-auto bg-black" style={{ gap: '1px' }}>
            <OperatorCard />
            <FinancePulseCard />
            <KeyBlockersCard />
          </div>

          {/* Centre column — the living organ, HUD furniture beneath */}
          <div className="flex flex-col overflow-y-auto bg-black" style={{ gap: '1px' }}>
            <HomeBrain className="flex-none h-[44vh] min-h-[300px]" />
            <HatchStrip height={6} />
            <SessionCard />
            <HabitsCard />
            <CalendarCard />
          </div>

          {/* Right column — fuel */}
          <div className="flex flex-col overflow-y-auto bg-black">
            <NutritionCard />
          </div>
        </div>
      </BootGate>
    </Shell>
  )
}
