export interface DailyCaptureEntry {
  id?: string | null
  text: string
  ts: string
  idempotency_key?: string
}

export type DailyLogNotes = Record<string, unknown>

/**
 * Appends a capture unless this retry already left the same keyed entry in
 * the daily log. Unkeyed captures intentionally retain the historical append
 * behavior used by web and Telegram.
 */
export function appendDailyCapture(
  captures: DailyCaptureEntry[],
  entry: DailyCaptureEntry,
): DailyCaptureEntry[] {
  if (entry.idempotency_key && captures.some((capture) => capture.idempotency_key === entry.idempotency_key)) {
    return captures
  }
  return [...captures, entry]
}

/**
 * Merges a capture into a day's notes without discarding unrelated note data.
 * The caller is responsible for surfacing persistence/read errors before
 * invoking this helper; an unavailable row is represented by null.
 */
export function mergeDailyLogCapture(
  notes: DailyLogNotes | null,
  entry: DailyCaptureEntry,
): DailyLogNotes {
  const current = notes ?? {}
  const captures = Array.isArray(current.captures)
    ? current.captures as DailyCaptureEntry[]
    : []
  return { ...current, captures: appendDailyCapture(captures, entry) }
}
