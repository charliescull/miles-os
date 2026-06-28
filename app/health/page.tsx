'use client'

import { useState, useEffect } from 'react'
import Shell from '@/components/dashboard/Shell'
import HealthHeart from '@/components/health/HealthHeart'
import WhoopCard from '@/components/health/WhoopCard'
import { HatchStrip } from '@/components/hud'
import { config } from '@/lib/config'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkoutEntry { date: string; workout_type: string | null }

interface Exercise {
  id?: string
  section: string | null
  name: string
  raw: string | null
  sets: number | null
  reps: string | null
  note: string | null
  done: boolean
}

interface AnalysisResult {
  dish_name: string
  ingredients_parsed: string[]
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  food_score: number
  score_tag: string
  rationale: string
}

interface Recipe {
  id: string
  dish_name: string
  raw_input: string
  calories_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  food_score: number
  score_tag: string
  rationale: string
  taste_rating: number | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.timezone })
}

function buildLast10Days(): string[] {
  const days: string[] = []
  for (let i = 9; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toLocaleDateString('en-CA', { timeZone: config.timezone }))
  }
  return days
}

function fmtDayLabel(dateStr: string): { weekday: string; day: string } {
  const d = new Date(dateStr + 'T12:00:00')
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  }
}

function fmtDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  }
}

function calcStreak(days: string[], workoutMap: Map<string, string | null>): number {
  const today = localDateKey()
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    if (d > today) continue
    const type = workoutMap.get(d)
    if (type === undefined || type === null) {
      if (d < today) break
    } else if (type.toUpperCase() === 'REST') {
      continue
    } else {
      streak++
    }
  }
  return streak
}

function scoreColor(score: number): string {
  if (score >= 60) return 'text-[var(--signal-up)]'
  if (score >= 40) return 'text-white'
  return 'text-[var(--signal-down)]'
}

const CANONICAL_TYPES = [
  'PUSH', 'PULL', 'LEGS', 'CHEST + BACK', 'SHOULDERS + ARMS',
  'UPPER', 'LOWER', 'FULL BODY', 'CARDIO', 'MOBILITY', 'REST',
]

// ─── Module 09 // WORKOUT LOG ─────────────────────────────────────────────────

function WorkoutLogModule() {
  const days = buildLast10Days()
  const today = localDateKey()

  const [workoutMap, setWorkoutMap] = useState<Map<string, string | null>>(new Map())
  const [selected, setSelected] = useState<string>(today)
  const [title, setTitle] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [addDraft, setAddDraft] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    fetch('/api/workouts?days=10')
      .then(r => r.ok ? r.json() : [])
      .then((data: WorkoutEntry[]) => {
        const map = new Map<string, string | null>()
        data.forEach(e => map.set(e.date, e.workout_type))
        setWorkoutMap(map)
      })
      .catch(() => {})
  }, [])

  // Load the selected day's detail (title + exercises).
  useEffect(() => {
    let cancelled = false
    setLoadingDetail(true)
    fetch(`/api/workouts?date=${selected}`)
      .then(r => r.ok ? r.json() : { title: null, exercises: [] })
      .then((d: { title: string | null; exercises: Exercise[] }) => {
        if (cancelled) return
        setTitle(d.title ?? '')
        setExercises(d.exercises ?? [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingDetail(false) })
    return () => { cancelled = true }
  }, [selected])

  const streak = calcStreak(days, workoutMap)
  const filtered = CANONICAL_TYPES.filter(t => titleDraft === '' || t.includes(titleDraft.toUpperCase()))

  async function saveTitle(value: string) {
    const t = value.trim() || null
    setTitle(t ?? '')
    setEditingTitle(false)
    setWorkoutMap(prev => new Map(prev).set(selected, t))
    await fetch('/api/workouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: selected, workout_type: t }),
    })
  }

  async function persist(next: Exercise[]) {
    setExercises(next)
    await fetch('/api/workouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: selected, title: title || null, exercises: next }),
    })
  }

  function addExercise() {
    const text = addDraft.trim()
    if (!text) return
    const parts = text.split(/\s+/)
    const lastTok = parts[parts.length - 1]
    let name = text
    let raw: string | null = null
    if (parts.length > 1 && /\d/.test(lastTok) && /[x×]/i.test(lastTok)) {
      raw = lastTok
      name = parts.slice(0, -1).join(' ')
    }
    persist([...exercises, { section: null, name, raw, sets: null, reps: null, note: null, done: true }])
    setAddDraft('')
  }

  // Group by section, preserving order.
  const groups: { section: string | null; items: { ex: Exercise; idx: number }[] }[] = []
  exercises.forEach((ex, idx) => {
    let g = groups.find(x => x.section === (ex.section ?? null))
    if (!g) { g = { section: ex.section ?? null, items: [] }; groups.push(g) }
    g.items.push({ ex, idx })
  })

  const selLabel = fmtDayLabel(selected)

  return (
    <div className="card rounded-sm flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(1_0_0/0.05)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">09 //</span>
          <span className="card-label">WORKOUT LOG</span>
        </div>
        <span className="card-label">
          LAST 10 DAYS · <span className="text-[var(--signal-up)]">STREAK {streak} DAY{streak !== 1 ? 'S' : ''}</span>
        </span>
      </div>

      {/* Day strip — click to select */}
      <div className="flex gap-1.5 px-3 pt-3 pb-2 flex-shrink-0">
        {days.map(date => {
          const { weekday, day } = fmtDayLabel(date)
          const type = workoutMap.get(date)
          const isToday = date === today
          const isPast = date < today
          const isSel = date === selected
          return (
            <button
              key={date}
              onClick={() => setSelected(date)}
              className={`flex-1 flex flex-col items-center gap-1 p-1.5 border transition-colors
                ${isSel
                  ? 'border-white/60 bg-white/5 glow-box'
                  : isToday
                    ? 'border-white/20 hover:border-white/40'
                    : 'border-[oklch(1_0_0/0.06)] hover:border-[oklch(1_0_0/0.15)]'}`}
            >
              <span className="card-label">{weekday}</span>
              <span className="mono text-xs text-white">{day}</span>
              <span className={`text-[8px] leading-none min-h-[10px] ${type ? 'text-[var(--signal-up)]' : isPast ? 'text-[var(--signal-down)]' : 'text-[oklch(0.30_0_0)]'}`}>
                {type ? '●' : isPast ? '○' : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* Selected-day detail */}
      <div className="flex flex-col flex-1 min-h-0 border-t border-[oklch(1_0_0/0.05)]">
        {/* Title */}
        <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 gap-2">
          {editingTitle ? (
            <div className="relative flex-1">
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(titleDraft); if (e.key === 'Escape') setEditingTitle(false) }}
                onBlur={() => setTimeout(() => setEditingTitle(false), 150)}
                placeholder="workout title…"
                className="w-full bg-transparent outline-none text-sm text-white border-b border-white/40 pb-0.5"
              />
              {filtered.length > 0 && titleDraft && (
                <div className="absolute top-full left-0 mt-1 z-20 card rounded-sm w-40 overflow-hidden">
                  {filtered.map(t => (
                    <button key={t} onMouseDown={() => saveTitle(t)} className="w-full text-left px-2 py-1 text-[10px] text-[oklch(0.70_0_0)] hover:bg-[oklch(1_0_0/0.05)] hover:text-white transition-colors">
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => { setTitleDraft(title); setEditingTitle(true) }} className="text-sm text-white font-medium hover:glow transition-colors text-left truncate flex-1">
              {title ? title : <span className="text-[oklch(0.40_0_0)] italic font-normal">+ set workout title</span>}
            </button>
          )}
          <span className="mono text-[10px] text-[oklch(0.40_0_0)] flex-shrink-0">
            {selected === today ? 'TODAY' : `${selLabel.weekday} ${selLabel.day}`}
          </span>
        </div>

        {/* Exercise list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3">
          {loadingDetail ? (
            <p className="text-[oklch(0.35_0_0)] text-xs py-2">loading…</p>
          ) : exercises.length === 0 ? (
            <p className="text-[oklch(0.35_0_0)] text-xs py-2">No exercises logged — send a workout screenshot to the bot, or add one below.</p>
          ) : (
            groups.map((g, gi) => (
              <div key={gi}>
                {g.section && <p className="card-label text-[oklch(0.55_0_0)] mt-2 mb-0.5">{g.section.toUpperCase()}</p>}
                {g.items.map(({ ex, idx }) => (
                  <div key={idx} className="group flex items-center gap-2 py-1 border-b border-[oklch(1_0_0/0.03)]">
                    <button
                      onClick={() => persist(exercises.map((e, i) => i === idx ? { ...e, done: !e.done } : e))}
                      className={`text-[10px] flex-shrink-0 w-4 ${ex.done ? 'text-[var(--signal-up)]' : 'text-[oklch(0.40_0_0)]'}`}
                    >
                      {ex.done ? '✓' : '○'}
                    </button>
                    <span className={`text-xs flex-1 truncate ${ex.done ? 'text-[oklch(0.80_0_0)]' : 'text-[oklch(0.45_0_0)] line-through'}`}>
                      {ex.name}{ex.note ? <span className="text-[oklch(0.45_0_0)]"> · {ex.note}</span> : null}
                    </span>
                    <span className="mono text-[10px] text-[oklch(0.60_0_0)] flex-shrink-0">
                      {ex.raw ?? (ex.sets && ex.reps ? `${ex.sets}x${ex.reps}` : '')}
                    </span>
                    <button
                      onClick={() => persist(exercises.filter((_, i) => i !== idx))}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-[oklch(0.40_0_0)] hover:text-[var(--signal-down)] flex-shrink-0 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Add exercise */}
        <div className="flex gap-2 items-center px-3 py-2 border-t border-[oklch(1_0_0/0.05)] flex-shrink-0">
          <input
            value={addDraft}
            onChange={e => setAddDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addExercise() }}
            placeholder="add exercise — e.g. Bench press 3x10"
            className="flex-1 bg-transparent text-xs text-white outline-none placeholder-[oklch(0.35_0_0)]"
          />
          <button onClick={addExercise} disabled={!addDraft.trim()} className="card-label text-white hover:glow disabled:opacity-30 transition-colors">ADD</button>
        </div>
      </div>
    </div>
  )
}

// ─── Module 10 // RECIPE INTAKE ───────────────────────────────────────────────

function RecipeIntakeModule({ onSaved }: { onSaved: () => void }) {
  const [input, setInput] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [tasteRating, setTasteRating] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function analyze() {
    if (!input.trim() || analyzing) return
    setAnalyzing(true)
    setResult(null)
    setError('')
    setTasteRating(null)
    try {
      const res = await fetch('/api/recipes/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      setResult(await res.json())
    } catch {
      setError('Analysis failed — check your connection and try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function save() {
    if (!result || saving) return
    setSaving(true)
    try {
      await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result, raw_input: input, taste_rating: tasteRating }),
      })
      setInput('')
      setResult(null)
      setTasteRating(null)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const active = hoverRating ?? tasteRating ?? 0

  return (
    <div className="card rounded-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(1_0_0/0.05)]">
        <div className="flex items-center gap-2">
          <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">10 //</span>
          <span className="card-label">RECIPE INTAKE</span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Input bar */}
        <div className={`
          flex gap-2 items-center border px-3 py-2 transition-colors
          ${analyzing
            ? 'border-white/40 glow-box'
            : 'border-[oklch(1_0_0/0.08)]'
          }
        `}>
          <span className="card-label text-[oklch(0.35_0_0)] flex-shrink-0">↗</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') analyze() }}
            disabled={analyzing}
            placeholder={`Enter dish name + ingredients — e.g. "grilled chicken w/ rice, broccoli"`}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder-[oklch(0.35_0_0)] disabled:opacity-50"
          />
          <button
            onClick={analyze}
            disabled={analyzing || !input.trim()}
            className="
              flex items-center gap-1.5 px-2.5 py-1 hud text-[10px] tracking-[0.18em]
              bg-white text-black hover:bg-[oklch(0.90_0_0)]
              disabled:opacity-30 disabled:cursor-not-allowed transition-colors
            "
          >
            {analyzing ? 'ANALYZING…' : 'ANALYZE'}
          </button>
        </div>

        {analyzing && (
          <div className="h-0.5 bg-[oklch(0.14_0_0)] overflow-hidden">
            <div className="h-full bg-white animate-scanning" style={{ boxShadow: '0 0 8px oklch(1 0 0 / 0.6)' }} />
          </div>
        )}

        {error && <p className="text-[10px] text-[var(--signal-down)]">{error}</p>}

        {result && (
          <>
            {/* Taste rating */}
            <div>
              <p className="card-label mb-1.5">TASTE RATING · 1–10</p>
              <div className="flex gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                  const filled = n <= active
                  const isRed = n <= 5
                  return (
                    <button
                      key={n}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(null)}
                      onClick={() => setTasteRating(prev => prev === n ? null : n)}
                      className={`
                        w-7 h-7 border text-[10px] font-bold mono transition-colors
                        ${filled
                          ? isRed
                            ? 'bg-[oklch(0.64_0.21_27/0.8)] border-[var(--signal-down)] text-white'
                            : 'bg-[oklch(0.78_0.17_150/0.8)] border-[var(--signal-up)] text-black'
                          : 'border-[oklch(1_0_0/0.12)] text-[oklch(0.40_0_0)] hover:border-[oklch(1_0_0/0.25)]'
                        }
                      `}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Score + macros */}
            <div className="flex items-start justify-between gap-4 border-t border-[oklch(1_0_0/0.05)] pt-3">
              <div>
                <p className="card-label mb-1">{result.dish_name.toUpperCase()}</p>
                <div className="flex items-baseline gap-2">
                  <span title={result.rationale} className={`mono text-3xl font-light cursor-help ${scoreColor(result.food_score)}`}>
                    {result.food_score}
                  </span>
                  <span className="card-label">/ 100</span>
                </div>
                <p className="card-label text-[oklch(0.55_0_0)] mt-0.5">{result.score_tag.toUpperCase()}</p>
              </div>

              <div className="grid grid-cols-4 gap-4 text-right">
                {[
                  { label: 'KCAL', val: result.calories_kcal, unit: '' },
                  { label: 'PROTEIN', val: result.protein_g, unit: 'g' },
                  { label: 'CARBS', val: result.carbs_g, unit: 'g' },
                  { label: 'FAT', val: result.fat_g, unit: 'g' },
                ].map(({ label, val, unit }) => (
                  <div key={label}>
                    <p className="card-label">{label}</p>
                    <p className="mono text-sm text-white">{val}{unit}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={save}
                disabled={saving}
                className="
                  px-3 py-1.5 rounded-sm text-[11px] font-bold tracking-widest
                  bg-white text-black hover:bg-[oklch(0.90_0_0)]
                  disabled:opacity-40 transition-colors flex-shrink-0
                "
              >
                {saving ? 'SAVING…' : 'SAVE'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Module 11 // RECIPE HISTORY ──────────────────────────────────────────────

function RecipeHistoryModule({ refreshKey }: { refreshKey: number }) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  async function load(before?: string) {
    const url = before ? `/api/recipes?limit=10&before=${before}` : '/api/recipes?limit=10'
    const res = await fetch(url)
    const data = res.ok ? await res.json() : { recipes: [], hasMore: false }
    return data as { recipes: Recipe[]; hasMore: boolean }
  }

  useEffect(() => {
    setLoading(true)
    load().then(({ recipes: r, hasMore: h }) => {
      setRecipes(r)
      setHasMore(h)
    }).finally(() => setLoading(false))
  }, [refreshKey])

  async function loadMore() {
    if (!recipes.length) return
    setLoadingMore(true)
    const last = recipes[recipes.length - 1].created_at
    const { recipes: more, hasMore: h } = await load(last)
    setRecipes(prev => [...prev, ...more])
    setHasMore(h)
    setLoadingMore(false)
  }

  async function deleteRecipe(id: string) {
    setRecipes(prev => prev.filter(r => r.id !== id))
    setConfirming(null)
    await fetch(`/api/recipes?id=${id}`, { method: 'DELETE' })
  }

  return (
    <div className="card rounded-sm flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(1_0_0/0.05)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="mono text-[oklch(0.40_0_0)] text-[10px] font-medium">11 //</span>
          <span className="card-label">RECIPE HISTORY</span>
        </div>
        <span className="card-label">SHOWING {recipes.length}</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-[oklch(0.12_0_0)] rounded-sm animate-pulse" />
            ))}
          </div>
        ) : recipes.length === 0 ? (
          <p className="p-3 text-[oklch(0.35_0_0)] text-xs">No recipes saved yet.</p>
        ) : (
          <div>
            {recipes.map(r => {
              const { date, time } = fmtDateTime(r.created_at)
              const isExpanded = expanded === r.id
              const isConfirming = confirming === r.id

              return (
                <div key={r.id} className="border-b border-[oklch(1_0_0/0.04)] last:border-0">
                  <div
                    onClick={() => setExpanded(isExpanded ? null : r.id)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-[oklch(1_0_0/0.02)] cursor-pointer group transition-colors"
                  >
                    <span className="mono text-[10px] text-[oklch(0.40_0_0)] flex-shrink-0 w-20">
                      {date} · {time}
                    </span>
                    <span className="text-xs text-white flex-1 truncate font-medium">
                      {r.dish_name?.toUpperCase() ?? r.raw_input.toUpperCase()}
                    </span>
                    <span className={`mono text-[11px] font-medium flex-shrink-0 ${scoreColor(r.food_score)}`}>
                      {r.food_score}/100
                    </span>
                    {r.taste_rating && (
                      <span className="mono text-[10px] text-[oklch(0.55_0_0)] flex-shrink-0">
                        ★ {r.taste_rating}
                      </span>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 bg-[oklch(1_0_0/0.01)]">
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: 'KCAL', val: r.calories_kcal, unit: '' },
                          { label: 'PROTEIN', val: r.protein_g, unit: 'g' },
                          { label: 'CARBS', val: r.carbs_g, unit: 'g' },
                          { label: 'FAT', val: r.fat_g, unit: 'g' },
                        ].map(({ label, val, unit }) => (
                          <div key={label}>
                            <p className="card-label">{label}</p>
                            <p className="mono text-xs text-white">{val}{unit}</p>
                          </div>
                        ))}
                      </div>
                      {r.rationale && (
                        <p className="text-[10px] text-[oklch(0.50_0_0)] leading-relaxed">{r.rationale}</p>
                      )}
                      <div className="flex justify-end">
                        {isConfirming ? (
                          <div className="flex items-center gap-2">
                            <span className="card-label text-[var(--signal-down)]">CONFIRM DELETE?</span>
                            <button
                              onClick={() => deleteRecipe(r.id)}
                              className="card-label text-[var(--signal-down)] hover:text-white transition-colors px-2 py-0.5 border border-[oklch(0.64_0.21_27/0.4)] rounded-sm"
                            >
                              YES
                            </button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="card-label text-[oklch(0.45_0_0)] hover:text-white transition-colors"
                            >
                              CANCEL
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirming(r.id)}
                            className="card-label text-[oklch(0.40_0_0)] hover:text-[var(--signal-down)] transition-colors"
                          >
                            DELETE
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-[oklch(1_0_0/0.05)] p-3">
        {hasMore ? (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full card-label text-[oklch(0.55_0_0)] hover:text-white transition-colors disabled:opacity-40 py-1"
          >
            {loadingMore ? 'LOADING…' : 'SHOW MORE +10'}
          </button>
        ) : (
          <p className="card-label text-[oklch(0.30_0_0)] text-center py-1">
            {recipes.length > 0 ? 'END OF HISTORY' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HealthPage() {
  const [historyKey, setHistoryKey] = useState(0)

  return (
    <Shell>
      {/* Scrollable column: WHOOP is the hero, the heart is a slim accent,
          the workout log + recipes live beneath (scroll down to reach them). */}
      <div className="flex flex-col min-h-[calc(100vh-40px)] bg-black overflow-y-auto">
        {/* Slim cardiac accent — the living heart + locked EKG */}
        <HealthHeart className="flex-none h-[15vh] min-h-[120px]" />
        <HatchStrip height={6} />

        {/* WHOOP hero — live recovery / sleep / strain */}
        <WhoopCard className="flex-none" />
        <HatchStrip height={6} />

        {/* Workout log + recipes — beneath the fold */}
        <div
          className="flex flex-col lg:flex-row flex-1"
          style={{ gap: '1px', background: 'oklch(1 0 0 / 0.06)', minHeight: '72vh' }}
        >
          {/* Left column — 75% on desktop, full-width stacked on small */}
          <div className="flex flex-col bg-black lg:[flex:0_0_75%]" style={{ gap: '1px' }}>
            {/* 09 // WORKOUT LOG — fills remaining space */}
            <div className="flex flex-col" style={{ flex: '1 1 0', minHeight: 0 }}>
              <WorkoutLogModule />
            </div>

            {/* 10 // RECIPE INTAKE — natural height */}
            <div className="flex-shrink-0 bg-black">
              <RecipeIntakeModule onSaved={() => setHistoryKey(k => k + 1)} />
            </div>
          </div>

          {/* Right column — 25% on desktop, full-width stacked on small */}
          <div className="flex flex-col bg-black lg:[flex:0_0_25%]">
            <RecipeHistoryModule refreshKey={historyKey} />
          </div>
        </div>
      </div>
    </Shell>
  )
}
