'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import Panel from './Panel'
import { config } from '@/lib/config'

interface Meal {
  id: string
  time: string
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  estimated: boolean
}

function localDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.timezone })
}

function fmt(n: number) { return Math.round(n) }

export default function NutritionCard() {
  const today = localDateKey()
  const storageKey = `os-nutrition-${today}`
  const dirtyRef = useRef(false)

  const [meals, setMeals] = useState<Meal[]>([])
  const [input, setInput] = useState('')
  const [estimating, setEstimating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goals = config.nutritionGoals

  useEffect(() => {
    const cached = localStorage.getItem(storageKey)
    if (cached) {
      try { setMeals(JSON.parse(cached)) } catch {}
    }

    fetch(`/api/nutrition?date=${today}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.meals && !dirtyRef.current) {
          setMeals(data.meals)
          localStorage.setItem(storageKey, JSON.stringify(data.meals))
        }
      })
      .catch(() => {})
  }, [today, storageKey])

  function save(updated: Meal[]) {
    dirtyRef.current = true
    setMeals(updated)
    localStorage.setItem(storageKey, JSON.stringify(updated))
    fetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, meals: updated }),
    }).catch(console.error)
  }

  async function addMeal() {
    if (!input.trim()) return
    setEstimating(true)
    try {
      const res = await fetch('/api/nutrition/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      const macros = res.ok ? await res.json() : { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      const meal: Meal = {
        id: Date.now().toString(),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        name: input,
        kcal: macros.kcal,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        estimated: true,
      }
      save([...meals, meal])
      setInput('')
    } finally {
      setEstimating(false)
    }
  }

  function updateMacro(id: string, field: keyof Meal, raw: string) {
    const val = parseFloat(raw) || 0
    const updated = meals.map(m => {
      if (m.id !== id) return m
      const next = { ...m, [field]: val, estimated: false }
      if (field !== 'kcal') {
        next.kcal = fmt(4 * next.protein + 4 * next.carbs + 9 * next.fat)
      } else {
        // Debounce redistribute
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
          const res = await fetch('/api/nutrition/redistribute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: m.name, kcal: val }),
          })
          if (res.ok) {
            const r = await res.json()
            const patched = meals.map(x => x.id === id ? { ...x, kcal: val, ...r, estimated: false } : x)
            save(patched)
          }
        }, 600)
      }
      return next
    })
    save(updated)
  }

  const totals = meals.reduce((acc, m) => ({
    kcal: acc.kcal + m.kcal,
    protein: acc.protein + m.protein,
    carbs: acc.carbs + m.carbs,
    fat: acc.fat + m.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })

  const kcalPct = Math.min(100, (totals.kcal / goals.kcal) * 100)
  const remaining = goals.kcal - totals.kcal

  // Cutoff time
  const now = new Date()
  const cutoffMs = new Date().setHours(goals.cutoffHour, 0, 0, 0)
  const minsUntilCutoff = Math.max(0, Math.round((cutoffMs - now.getTime()) / 60000))
  const pastCutoff = now.getTime() > cutoffMs

  return (
    <Panel
      id="08"
      label="NUTRITION"
      action={
        <div className="flex gap-1">
          <button className="card-label px-2 py-0.5 border border-[oklch(1_0_0/0.08)] rounded-sm text-white">TODAY</button>
          <a href="/health" className="card-label px-2 py-0.5 border border-[oklch(1_0_0/0.08)] rounded-sm hover:text-white transition-colors">HISTO</a>
        </div>
      }
      noPadding
      className="min-h-0"
    >
      {/* Kcal summary */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-baseline justify-between">
          <span className="mono text-3xl font-light text-white">{fmt(totals.kcal)}</span>
          <span className="card-label">of {goals.kcal} kcal</span>
        </div>
        <p className={`mono text-xs mt-0.5 ${remaining >= 0 ? 'text-[oklch(0.45_0_0)]' : 'text-[oklch(0.65_0.22_25)]'}`}>
          {remaining >= 0 ? `−${fmt(remaining)} deficit` : `+${fmt(-remaining)} over`}
        </p>

        {/* Progress bar */}
        <div className="mt-2 h-0.5 bg-[oklch(0.18_0_0)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[oklch(0.72_0.18_145)] transition-all duration-500"
            style={{ width: `${kcalPct}%` }}
          />
        </div>

        {/* Macros */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { label: 'PROTEIN', val: totals.protein, goal: goals.protein },
            { label: 'CARBS', val: totals.carbs, goal: goals.carbs },
            { label: 'FAT', val: totals.fat, goal: goals.fat },
          ].map(({ label, val, goal }) => (
            <div key={label}>
              <p className="card-label">{label}</p>
              <p className="mono text-xs text-white">{fmt(val)}/{goal}g</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add meal */}
      <div className="px-3 pb-2 flex gap-1.5 border-t border-[oklch(1_0_0/0.05)] pt-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addMeal() }}
          placeholder={`Log a meal — try "estimate 500 cals"`}
          className="flex-1 bg-transparent text-xs text-white outline-none placeholder-[oklch(0.35_0_0)]"
        />
        <button
          onClick={addMeal}
          disabled={estimating || !input.trim()}
          className="text-[oklch(0.45_0_0)] hover:text-white disabled:opacity-30 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Cutoff */}
      <div className="px-3 pb-2 flex items-center justify-between border-t border-[oklch(1_0_0/0.05)] pt-2">
        <span className="card-label">
          · CUTOFF · {goals.cutoffHour}:00 {goals.cutoffHour >= 12 ? 'PM' : 'AM'}
        </span>
        <span className={`card-label ${pastCutoff ? 'text-[oklch(0.65_0.22_25)]' : ''}`}>
          {pastCutoff ? 'CUTOFF PASSED' : `CUTOFF IN ${Math.floor(minsUntilCutoff / 60)}h ${minsUntilCutoff % 60}m`}
        </span>
      </div>

      {/* Meals list */}
      <div className="border-t border-[oklch(1_0_0/0.05)]">
        <div className="px-3 py-1.5">
          <p className="card-label">TODAY · HOVER TO EDIT</p>
        </div>
        {meals.length === 0 ? (
          <p className="px-3 pb-2 text-[oklch(0.35_0_0)] text-xs">No meals logged</p>
        ) : (
          meals.map((meal, i) => (
            <div
              key={meal.id}
              className={`
                flex items-center gap-2 px-3 py-1.5 group
                ${i < meals.length - 1 ? 'border-b border-[oklch(1_0_0/0.04)]' : ''}
                hover:bg-[oklch(1_0_0/0.02)] transition-colors
              `}
            >
              <span className="mono text-[10px] text-[oklch(0.40_0_0)] flex-shrink-0 w-8">{meal.time}</span>
              <span className="text-xs text-[oklch(0.70_0_0)] flex-1 truncate">{meal.name}</span>
              {editId === meal.id ? (
                <div className="flex items-center gap-1">
                  {(['kcal', 'protein'] as const).map(f => (
                    <input
                      key={f}
                      defaultValue={meal[f]}
                      onBlur={e => updateMacro(meal.id, f, e.target.value)}
                      className="w-10 bg-[oklch(0.15_0_0)] border border-[oklch(1_0_0/0.1)] rounded px-1 mono text-[10px] text-white outline-none text-right"
                    />
                  ))}
                  <button onClick={() => setEditId(null)} className="text-[oklch(0.40_0_0)] text-[10px]">✕</button>
                </div>
              ) : (
                <button onClick={() => setEditId(meal.id)} className="mono text-[10px] text-[oklch(0.45_0_0)] hover:text-white transition-colors">
                  {fmt(meal.kcal)}k {fmt(meal.protein)}p
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}
