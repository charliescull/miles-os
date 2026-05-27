import Shell from '@/components/dashboard/Shell'
import OperatorCard from '@/components/dashboard/OperatorCard'
import FinancePulseCard from '@/components/dashboard/FinancePulseCard'
import KeyBlockersCard from '@/components/dashboard/KeyBlockersCard'
import SessionCard from '@/components/dashboard/SessionCard'
import HabitsCard from '@/components/dashboard/HabitsCard'
import CalendarCard from '@/components/dashboard/CalendarCard'
import NutritionCard from '@/components/dashboard/NutritionCard'

export default function HomePage() {
  return (
    <Shell>
      <div
        className="grid h-[calc(100vh-40px)]"
        style={{
          gridTemplateColumns: '280px 1fr 280px',
          gap: '1px',
          background: 'oklch(1 0 0 / 0.05)',
        }}
      >
        {/* Left column */}
        <div className="flex flex-col overflow-y-auto bg-[oklch(0.08_0_0)]" style={{ gap: '1px' }}>
          <OperatorCard />
          <FinancePulseCard />
          <KeyBlockersCard />
        </div>

        {/* Centre column */}
        <div className="flex flex-col overflow-y-auto bg-[oklch(0.08_0_0)]" style={{ gap: '1px' }}>
          <SessionCard />
          <HabitsCard />
          <CalendarCard />
        </div>

        {/* Right column */}
        <div className="flex flex-col overflow-y-auto bg-[oklch(0.08_0_0)]">
          <NutritionCard />
        </div>
      </div>
    </Shell>
  )
}
