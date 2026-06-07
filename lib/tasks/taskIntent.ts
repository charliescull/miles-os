import { getServiceClient, USER_ID } from '@/lib/supabase'

// Task completion intent for the Telegram agent: detect "I finished X" style messages and
// fuzzy-match them to an open task to check off. The webhook tries this BEFORE normal capture;
// if no task matches, it falls through to capture so nothing is lost.

export interface TaskRow {
  id: string
  title: string
  status: string
  kind: string
  urgency: string
}

const STOP = new Set(['the', 'a', 'an', 'my', 'to', 'for', 'of', 'with', 'on', 'is', 'please', 'task', 'off'])

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w))
}

// Detect a completion message and extract the task description to match against.
export function detectCompletionIntent(text: string): { isCompletion: boolean; query: string } {
  const t = text.trim()
  const patterns: RegExp[] = [
    /^mark\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)\s*$/i,
    /^[✓✅]\s*(.+)$/,
    /(?:^|\b)(?:done with|finished|completed|checked off|check off|checkoff)\s+(.+)$/i,
    /^(?:done|complete)\s*[:\-]\s*(.+)$/i,
    /^(.+?)\s+(?:is\s+)?(?:done|finished|completed)\s*$/i,
  ]
  for (const re of patterns) {
    const m = t.match(re)
    if (m && m[1] && m[1].trim()) return { isCompletion: true, query: m[1].trim() }
  }
  return { isCompletion: false, query: '' }
}

// 1.0 if one fully contains the other, else fraction of the query's words present in the title.
function score(query: string, title: string): number {
  const q = tokens(query)
  const ti = tokens(title)
  if (!q.length || !ti.length) return 0
  const qs = q.join(' ')
  const ts = ti.join(' ')
  if (ts.includes(qs) || qs.includes(ts)) return 1
  const tset = new Set(ti)
  const inter = q.filter(w => tset.has(w)).length
  return inter / q.length
}

// Find the best-matching open/blocked task and mark it done. Threshold avoids wrong matches.
export async function completeTaskByQuery(query: string): Promise<{ matched: TaskRow | null; score: number }> {
  const db = getServiceClient()
  const { data } = await db
    .from('tasks')
    .select('id,title,status,kind,urgency')
    .eq('user_id', USER_ID)
    .in('status', ['open', 'blocked'])
    .limit(200)

  const tasks = (data ?? []) as TaskRow[]
  let best: TaskRow | null = null
  let bestScore = 0
  for (const tk of tasks) {
    const s = score(query, tk.title)
    if (s > bestScore) { bestScore = s; best = tk }
  }

  if (!best || bestScore < 0.5) return { matched: null, score: bestScore }

  const now = new Date().toISOString()
  await db
    .from('tasks')
    .update({ status: 'done', completed_at: now, updated_at: now })
    .eq('id', best.id)
    .eq('user_id', USER_ID)

  return { matched: best, score: bestScore }
}
