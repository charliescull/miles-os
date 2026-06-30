import Shell from '@/components/dashboard/Shell'
import TaskList from '@/components/command/TaskList'
import CommandCalendar from '@/components/command/CommandCalendar'
import NotesPad from '@/components/command/NotesPad'

// COMMAND CENTER — replaces the old CRM. Telegram-fed: appointments → schedule
// (Google + mirror), actionable items → neon task rail, "X …" → daily notepad.
export default function CommandPage() {
  return (
    <Shell>
      <div
        className="flex flex-col lg:grid lg:h-[calc(100vh-40px)]"
        style={{
          gridTemplateColumns: 'minmax(250px, 25%) 1fr minmax(250px, 25%)',
          gap: '1px',
          background: 'oklch(0.82 0.13 225 / 0.10)',
        }}
      >
        <div className="flex flex-col bg-black min-h-[40vh] lg:min-h-0">
          <TaskList />
        </div>
        <div className="flex flex-col bg-black min-h-[50vh] lg:min-h-0">
          <CommandCalendar />
        </div>
        <div className="flex flex-col bg-black min-h-[40vh] lg:min-h-0">
          <NotesPad />
        </div>
      </div>
    </Shell>
  )
}
