'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import CommandCalendar from '@/components/command/CommandCalendar'
import TaskList from '@/components/command/TaskList'

type QueueStatus = 'queued' | 'uploading' | 'processed' | 'failed'
interface QueueItem { id: string; text: string; status: QueueStatus; attempts: number; error?: string; nextAttemptAt?: number }
interface Nutrition { kcal: number; protein: number; carbs: number; fat: number }

const DB_NAME = 'miles-mobile'
const STORE = 'captures'

// IndexedDB is the source of truth. A small localStorage fallback keeps capture
// usable in browsers where IndexedDB is unavailable (private browsing, older PWA shells).
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function readQueue(): Promise<QueueItem[]> {
  try {
    const db = await openDb()
    const items = await new Promise<QueueItem[]>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result as QueueItem[])
      request.onerror = () => reject(request.error)
    })
    db.close()
    return items.map(item => item.status === 'uploading'
      ? { ...item, status: 'queued' as const, nextAttemptAt: undefined, error: 'Upload interrupted; ready to retry.' }
      : item).sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    try {
      const items = JSON.parse(localStorage.getItem('miles-capture-queue') ?? '[]') as QueueItem[]
      return items.map(item => item.status === 'uploading'
        ? { ...item, status: 'queued' as const, nextAttemptAt: undefined, error: 'Upload interrupted; ready to retry.' }
        : item)
    } catch { return [] }
  }
}
async function writeQueueItem(item: QueueItem) {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(item)
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error)
    })
    db.close()
  } catch {
    try {
      const items = await readQueue()
      const next = items.filter(existing => existing.id !== item.id).concat(item)
      localStorage.setItem('miles-capture-queue', JSON.stringify(next))
    } catch {}
  }
}
async function persist(item: QueueItem) {
  await writeQueueItem(item)
}
function Macro({ label, value, unit = 'g' }: { label: string; value: number; unit?: string }) {
  return <div><div className="card-label">{label}</div><div className="mono text-[13px] text-white">{Math.round(value)}<span className="text-[10px] text-[oklch(0.45_0_0)]">{unit}</span></div></div>
}

export default function MobileCommandCenter() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [draft, setDraft] = useState('')
  const [nutrition, setNutrition] = useState<Nutrition>({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const [online, setOnline] = useState(true)
  const queueRef = useRef<QueueItem[]>([])
  const inFlight = useRef(new Set<string>())

  useEffect(() => { queueRef.current = queue }, [queue])

  const update = useCallback((item: QueueItem) => {
    queueRef.current = queueRef.current.map(x => x.id === item.id ? item : x)
    setQueue(queueRef.current)
    void persist(item).catch(() => {})
  }, [])

  const send = useCallback(async (item: QueueItem) => {
    if (!navigator.onLine || item.status === 'processed' || inFlight.current.has(item.id)) return
    inFlight.current.add(item.id)
    update({ ...item, status: 'uploading', error: undefined, nextAttemptAt: undefined })
    try {
      const response = await fetch('/api/quick', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.id },
        body: JSON.stringify({ text: item.text, idempotency_key: item.id }),
      })
      if (!response.ok) throw new Error(`Upload failed (${response.status})`)
      const payload = await response.json().catch(() => ({})) as { state?: string; message?: string }
      if (payload.state === 'in_progress') throw new Error('Capture is still processing')
      update({ ...item, status: 'processed', error: undefined, nextAttemptAt: undefined })
    } catch (error) {
      const attempts = item.attempts + 1
      const delay = Math.min(5 * 60 * 1000, 1000 * 2 ** Math.min(attempts - 1, 8))
      update({ ...item, status: 'failed', attempts, nextAttemptAt: Date.now() + delay, error: error instanceof Error ? error.message : 'Upload failed' })
    } finally {
      inFlight.current.delete(item.id)
    }
  }, [update])

  const retry = useCallback(() => {
    if (!navigator.onLine) return
    const now = Date.now()
    queueRef.current.filter(item => (item.status === 'queued' || item.status === 'failed') && (!item.nextAttemptAt || item.nextAttemptAt <= now)).forEach(item => void send(item))
  }, [send])

  const retryNow = useCallback(() => {
    if (!navigator.onLine) return
    queueRef.current.filter(item => item.status === 'queued' || item.status === 'failed').forEach(item => {
      const ready = { ...item, status: 'queued' as const, nextAttemptAt: undefined }
      update(ready)
      void send(ready)
    })
  }, [send, update])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void readQueue().then(items => {
        const byId = new Map(items.map(item => [item.id, item]))
        for (const item of queueRef.current) byId.set(item.id, item)
        const merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
        queueRef.current = merged
        setQueue(merged)
        merged.filter(item => item.status === 'queued' || item.status === 'failed').forEach(item => void send(item))
      })
      setOnline(navigator.onLine)
    }, 0)
    const onOnline = () => { setOnline(true); setTimeout(() => retry(), 0) }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline)
    const interval = window.setInterval(retry, 1000)
    return () => { window.clearTimeout(initialLoad); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.clearInterval(interval) }
  }, [retry, send])

  useEffect(() => {
    fetch('/api/nutrition').then(r => r.ok ? r.json() : { meals: [] }).then(data => {
      const meals = Array.isArray(data.meals) ? data.meals : []
      setNutrition(meals.reduce((sum: Nutrition, meal: Partial<Nutrition>) => ({
        kcal: sum.kcal + (meal.kcal ?? 0), protein: sum.protein + (meal.protein ?? 0), carbs: sum.carbs + (meal.carbs ?? 0), fat: sum.fat + (meal.fat ?? 0),
      }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }))
    }).catch(() => {})
  }, [])

  function capture() {
    const text = draft.trim(); if (!text) return
    const item: QueueItem = { id: crypto.randomUUID(), text, status: 'queued', attempts: 0 }
    queueRef.current = [...queueRef.current, item]
    setQueue(queueRef.current)
    void persist(item).catch(() => {})
    setDraft(''); void send(item)
  }

  const pending = queue.filter(item => item.status !== 'processed')
  const recentProcessed = queue.filter(item => item.status === 'processed').slice(-2)
  const visibleQueue = [...pending.slice(-3), ...recentProcessed].slice(-4)

  return <div className="flex-1 flex flex-col gap-px bg-[oklch(0.82_0.13_225/0.10)]">
    <section className="bg-black px-3 py-3">
      <div className="flex items-center justify-between mb-2"><span className="card-label text-[var(--jarvis)]">QUICK CAPTURE</span><span className={`card-label ${online ? 'text-[var(--signal-up)]' : 'text-[var(--signal-down)]'}`}>{online ? 'ONLINE' : 'OFFLINE'}</span></div>
      <div className="flex gap-2"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') capture() }} placeholder="What should MILES remember?" className="min-w-0 flex-1 bg-[oklch(0.04_0_0)] border border-[oklch(1_0_0/0.12)] px-3 py-3 text-[13px] text-white outline-none focus:border-[oklch(1_0_0/0.35)]" /><button onClick={capture} disabled={!draft.trim()} className="hud px-3 text-[11px] text-black bg-white disabled:opacity-30">DROP</button></div>
      <div className="mt-2 flex items-center justify-between"><span className="mono text-[10px] text-[oklch(0.45_0_0)]">{pending.length} PENDING</span>{recentProcessed.length > 0 && <span className="mono text-[10px] text-[var(--signal-up)]">RECENT SYNC OK</span>}</div>
    </section>
    <section className="bg-black px-3 py-3"><div className="flex items-center justify-between mb-2"><span className="card-label text-[var(--jarvis)]">FOOD // TODAY</span><span className="mono text-[11px] text-white">{Math.round(nutrition.kcal)} kcal</span></div><div className="grid grid-cols-3 gap-3"><Macro label="PROTEIN" value={nutrition.protein} /><Macro label="CARBS" value={nutrition.carbs} /><Macro label="FAT" value={nutrition.fat} /></div></section>
    <div className="h-[42vh] min-h-[250px] flex flex-col bg-black"><CommandCalendar /></div>
    <div className="min-h-[38vh] flex flex-col bg-black"><TaskList /></div>
    {visibleQueue.length > 0 && <section className="bg-black px-3 py-3"><div className="flex items-center justify-between mb-2"><span className="card-label text-[var(--jarvis)]">SYNC QUEUE</span><button onClick={retryNow} className="hud text-[10px] text-[var(--jarvis-bright)]">RETRY</button></div>{visibleQueue.map(item => <div key={item.id} className="flex justify-between gap-2 py-1 mono text-[10px]"><span className="truncate text-white">{item.text}</span><span className={item.status === 'failed' ? 'text-[var(--signal-down)]' : item.status === 'processed' ? 'text-[var(--signal-up)]' : 'text-[oklch(0.55_0_0)]'}>{item.status.toUpperCase()}</span></div>)}</section>}
  </div>
}
