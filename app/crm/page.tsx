'use client'

import { useState, useEffect, useCallback } from 'react'
import Shell from '@/components/dashboard/Shell'
import { Plus, Search, X } from 'lucide-react'

type Urgency = 'overdue' | 'today' | 'this_week' | 'later'
type View = 'kanban' | 'list'
type SubTab = 'people' | 'tasks' | 'content' | 'decisions' | 'captures'

interface TaskItem {
  id: string
  title: string
  description?: string
  owner?: string
  urgency: string
  tags: string[]
  entity_name?: string
  kind: string
  is_key: boolean
  created_at: string
}

interface Entity {
  id: string
  name: string
  kind: string
  metadata: Record<string, string>
  created_at: string
}

const URGENCY_COLS: { key: Urgency; label: string; color: string }[] = [
  { key: 'overdue', label: 'OVERDUE', color: 'oklch(0.65 0.22 25)' },
  { key: 'today', label: 'TODAY', color: 'oklch(0.72 0.18 145)' },
  { key: 'this_week', label: 'THIS WEEK', color: 'oklch(0.78 0.16 90)' },
  { key: 'later', label: 'LATER', color: 'oklch(0.60 0.10 230)' },
]

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'people', label: 'PEOPLE' },
  { key: 'tasks', label: 'TASKS' },
  { key: 'content', label: 'CONTENT' },
  { key: 'decisions', label: 'DECISIONS' },
  { key: 'captures', label: 'CAPTURES' },
]

const KIND_MAP: Record<SubTab, string | null> = {
  people: null,
  tasks: 'task',
  content: 'content',
  decisions: 'decision',
  captures: null,
}

function TaskCard({ task, onDone, onDelete }: { task: TaskItem; onDone: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div className="card rounded-sm p-3 space-y-2 hover:border-[oklch(1_0_0/0.12)] transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white truncate">{task.title}</p>
          {task.description && (
            <p className="text-[10px] text-[oklch(0.50_0_0)] mt-0.5 truncate">{task.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {task.is_key && (
            <span className="mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-[oklch(0.78_0.16_90/0.15)] text-[oklch(0.78_0.16_90)]">KEY</span>
          )}
          <button
            onClick={() => onDone(task.id)}
            title="Mark done"
            className="opacity-0 group-hover:opacity-100 text-[oklch(0.72_0.18_145)] hover:text-white transition-all p-0.5"
          >
            ✓
          </button>
          <button
            onClick={() => onDelete(task.id)}
            title="Delete"
            className="opacity-0 group-hover:opacity-100 text-[oklch(0.45_0_0)] hover:text-[oklch(0.65_0.22_25)] transition-all p-0.5"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="card-label">{task.owner ?? '—'}</span>
        {task.tags[0] && (
          <span className="mono text-[9px] px-1.5 py-0.5 border border-[oklch(1_0_0/0.10)] text-[oklch(0.50_0_0)] rounded-sm">
            {task.tags[0]}
          </span>
        )}
      </div>
    </div>
  )
}

function PersonCard({ entity }: { entity: Entity }) {
  return (
    <div className="card rounded-sm p-3 space-y-1.5 cursor-pointer hover:border-[oklch(1_0_0/0.12)] transition-colors">
      <p className="text-xs font-medium text-white">{entity.name}</p>
      <div className="flex items-center justify-between">
        <span className="card-label">{entity.kind.toUpperCase()}</span>
        {entity.metadata?.role && (
          <span className="mono text-[9px] text-[oklch(0.50_0_0)]">{entity.metadata.role}</span>
        )}
      </div>
    </div>
  )
}

interface NewTaskForm {
  title: string
  urgency: string
  kind: string
  is_key: boolean
  owner: string
  tags: string
}

interface NewPersonForm {
  name: string
  kind: string
  role: string
}

export default function CrmPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('kanban')
  const [subTab, setSubTab] = useState<SubTab>('tasks')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const [taskForm, setTaskForm] = useState<NewTaskForm>({
    title: '', urgency: 'today', kind: 'task', is_key: false, owner: '', tags: '',
  })
  const [personForm, setPersonForm] = useState<NewPersonForm>({
    name: '', kind: 'person', role: '',
  })

  const fetchTasks = useCallback(async () => {
    const kind = KIND_MAP[subTab]
    const url = kind ? `/api/tasks?status=open&kind=${kind}` : '/api/tasks?status=open'
    const res = await fetch(url)
    const data = res.ok ? await res.json() : []
    setTasks(data)
  }, [subTab])

  useEffect(() => {
    setLoading(true)
    const promises: Promise<void>[] = [fetchTasks().then(() => {})]
    if (subTab === 'people') {
      promises.push(
        fetch('/api/entities').then(r => r.ok ? r.json() : []).then(setEntities)
      )
    }
    Promise.all(promises).finally(() => setLoading(false))
  }, [subTab, fetchTasks])

  function getCol(urgency: Urgency) {
    const filtered = search
      ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
      : tasks
    if (urgency === 'overdue') return filtered.filter(t => t.urgency === 'overdue')
    if (urgency === 'today') return filtered.filter(t => t.urgency === 'today')
    if (urgency === 'this_week') return filtered.filter(t => t.urgency === 'this_week')
    return filtered.filter(t => !['overdue', 'today', 'this_week'].includes(t.urgency))
  }

  async function markDone(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done', completed_at: new Date().toISOString() }),
    })
  }

  async function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
  }

  async function saveTask() {
    if (!taskForm.title.trim()) return
    setSaving(true)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: taskForm.title,
        urgency: taskForm.urgency,
        kind: taskForm.kind,
        is_key: taskForm.is_key,
        owner: taskForm.owner || null,
        tags: taskForm.tags ? taskForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        priority_score: taskForm.is_key ? 100 : 50,
      }),
    })
    setSaving(false)
    setShowNew(false)
    setTaskForm({ title: '', urgency: 'today', kind: 'task', is_key: false, owner: '', tags: '' })
    fetchTasks()
  }

  async function savePerson() {
    if (!personForm.name.trim()) return
    setSaving(true)
    await fetch('/api/entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: personForm.name,
        kind: personForm.kind,
        metadata: personForm.role ? { role: personForm.role } : {},
      }),
    })
    setSaving(false)
    setShowNew(false)
    setPersonForm({ name: '', kind: 'person', role: '' })
    const data = await fetch('/api/entities').then(r => r.json())
    setEntities(data)
  }

  const filteredEntities = search
    ? entities.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : entities

  const counts: Record<SubTab, number> = {
    people: entities.length,
    tasks: tasks.length,
    content: tasks.length,
    decisions: tasks.length,
    captures: tasks.length,
  }

  return (
    <Shell>
      <div className="flex flex-col h-[calc(100vh-40px)]">
        {/* Sub-header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[oklch(1_0_0/0.06)]">
          <div className="flex items-center gap-1">
            <span className="card-label mr-2">CRM //</span>
            {SUB_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSubTab(key)}
                className={`px-3 py-1 text-[11px] font-semibold tracking-widest rounded-sm transition-colors ${
                  subTab === key
                    ? 'bg-white text-black'
                    : 'text-[oklch(0.45_0_0)] hover:text-[oklch(0.75_0_0)]'
                }`}
              >
                {label} <span className="opacity-60">{counts[key]}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-[oklch(1_0_0/0.08)] rounded-sm px-2 py-1">
              <Search size={11} className="text-[oklch(0.40_0_0)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter…"
                className="bg-transparent text-xs text-white outline-none placeholder-[oklch(0.35_0_0)] w-32"
              />
            </div>
            {subTab !== 'people' && (
              <div className="flex items-center gap-0.5">
                {(['kanban', 'list'] as View[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-2 py-1 text-[11px] font-semibold tracking-widest rounded-sm transition-colors ${
                      view === v ? 'bg-white text-black' : 'text-[oklch(0.45_0_0)] hover:text-[oklch(0.75_0_0)]'
                    }`}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-semibold tracking-widest bg-white text-black hover:bg-[oklch(0.90_0_0)] transition-colors"
            >
              <Plus size={12} />
              NEW
            </button>
          </div>
        </div>

        {/* People tab */}
        {subTab === 'people' && (
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="grid grid-cols-4 gap-2">
                {[1,2,3,4].map(i => <div key={i} className="h-16 bg-[oklch(0.12_0_0)] rounded-sm animate-pulse" />)}
              </div>
            ) : filteredEntities.length === 0 ? (
              <p className="text-[oklch(0.35_0_0)] text-xs">No people yet — click NEW to add someone.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {filteredEntities.map(e => <PersonCard key={e.id} entity={e} />)}
              </div>
            )}
          </div>
        )}

        {/* Kanban */}
        {subTab !== 'people' && view === 'kanban' && (
          <div className="flex-1 overflow-x-auto">
            <div className="grid grid-cols-4 h-full" style={{ gap: '1px', background: 'oklch(1 0 0 / 0.05)', minWidth: '900px' }}>
              {URGENCY_COLS.map(({ key, label, color }) => {
                const col = getCol(key)
                return (
                  <div key={key} className="flex flex-col bg-[oklch(0.08_0_0)] overflow-y-auto">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(1_0_0/0.05)] flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
                        <span className="card-label">{label}</span>
                      </div>
                      <span className="mono text-[10px] text-[oklch(0.40_0_0)]">{col.length}</span>
                    </div>
                    <div className="p-2 space-y-2 flex-1">
                      {loading ? (
                        [1, 2].map(i => <div key={i} className="h-16 bg-[oklch(0.12_0_0)] rounded-sm animate-pulse" />)
                      ) : col.length === 0 ? (
                        <p className="text-[oklch(0.30_0_0)] text-[10px] px-1 pt-1">Empty</p>
                      ) : (
                        col.map(t => <TaskCard key={t.id} task={t} onDone={markDone} onDelete={deleteTask} />)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* List view */}
        {subTab !== 'people' && view === 'list' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {(search ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : tasks).map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 card rounded-sm hover:border-[oklch(1_0_0/0.12)] transition-colors group">
                  <span className="text-xs text-white flex-1 truncate">{t.title}</span>
                  <span className="card-label">{t.urgency.replace('_', ' ')}</span>
                  {t.is_key && <span className="mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-[oklch(0.78_0.16_90/0.15)] text-[oklch(0.78_0.16_90)]">KEY</span>}
                  <button onClick={() => markDone(t.id)} className="opacity-0 group-hover:opacity-100 text-[oklch(0.72_0.18_145)] hover:text-white text-xs transition-all">✓</button>
                  <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-[oklch(0.45_0_0)] hover:text-[oklch(0.65_0.22_25)] text-xs transition-all">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New item modal */}
        {showNew && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
            <div className="card rounded-sm p-5 w-96 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <span className="card-label">{subTab === 'people' ? 'NEW PERSON' : 'NEW TASK'}</span>
                <button onClick={() => setShowNew(false)}><X size={14} className="text-[oklch(0.45_0_0)]" /></button>
              </div>

              {subTab === 'people' ? (
                <div className="space-y-3">
                  <input
                    autoFocus
                    value={personForm.name}
                    onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') savePerson() }}
                    placeholder="Name"
                    className="w-full bg-[oklch(0.12_0_0)] border border-[oklch(1_0_0/0.10)] rounded-sm px-3 py-2 text-xs text-white outline-none placeholder-[oklch(0.35_0_0)]"
                  />
                  <select
                    value={personForm.kind}
                    onChange={e => setPersonForm(f => ({ ...f, kind: e.target.value }))}
                    className="w-full bg-[oklch(0.12_0_0)] border border-[oklch(1_0_0/0.10)] rounded-sm px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="person">Person</option>
                    <option value="org">Organisation</option>
                    <option value="project">Project</option>
                  </select>
                  <input
                    value={personForm.role}
                    onChange={e => setPersonForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="Role (optional)"
                    className="w-full bg-[oklch(0.12_0_0)] border border-[oklch(1_0_0/0.10)] rounded-sm px-3 py-2 text-xs text-white outline-none placeholder-[oklch(0.35_0_0)]"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    autoFocus
                    value={taskForm.title}
                    onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveTask() }}
                    placeholder="Task title"
                    className="w-full bg-[oklch(0.12_0_0)] border border-[oklch(1_0_0/0.10)] rounded-sm px-3 py-2 text-xs text-white outline-none placeholder-[oklch(0.35_0_0)]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={taskForm.urgency}
                      onChange={e => setTaskForm(f => ({ ...f, urgency: e.target.value }))}
                      className="bg-[oklch(0.12_0_0)] border border-[oklch(1_0_0/0.10)] rounded-sm px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="today">Today</option>
                      <option value="this_week">This Week</option>
                      <option value="this_month">This Month</option>
                      <option value="someday">Someday</option>
                    </select>
                    <select
                      value={taskForm.kind}
                      onChange={e => setTaskForm(f => ({ ...f, kind: e.target.value }))}
                      className="bg-[oklch(0.12_0_0)] border border-[oklch(1_0_0/0.10)] rounded-sm px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="task">Task</option>
                      <option value="content">Content</option>
                      <option value="decision">Decision</option>
                      <option value="blocker">Blocker</option>
                    </select>
                  </div>
                  <input
                    value={taskForm.owner}
                    onChange={e => setTaskForm(f => ({ ...f, owner: e.target.value }))}
                    placeholder="Owner (optional)"
                    className="w-full bg-[oklch(0.12_0_0)] border border-[oklch(1_0_0/0.10)] rounded-sm px-3 py-2 text-xs text-white outline-none placeholder-[oklch(0.35_0_0)]"
                  />
                  <input
                    value={taskForm.tags}
                    onChange={e => setTaskForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="Tags (comma separated)"
                    className="w-full bg-[oklch(0.12_0_0)] border border-[oklch(1_0_0/0.10)] rounded-sm px-3 py-2 text-xs text-white outline-none placeholder-[oklch(0.35_0_0)]"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taskForm.is_key}
                      onChange={e => setTaskForm(f => ({ ...f, is_key: e.target.checked }))}
                      className="accent-white"
                    />
                    <span className="text-xs text-[oklch(0.60_0_0)]">Mark as KEY</span>
                  </label>
                </div>
              )}

              <button
                onClick={subTab === 'people' ? savePerson : saveTask}
                disabled={saving}
                className="w-full py-2 bg-white text-black text-xs font-semibold rounded-sm hover:bg-[oklch(0.90_0_0)] transition-colors disabled:opacity-50"
              >
                {saving ? 'SAVING...' : 'SAVE'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
