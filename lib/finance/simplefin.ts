import Anthropic from '@anthropic-ai/sdk'
import { getServiceClient } from '@/lib/supabase'

// SimpleFIN Bridge daily sync (finance overhaul v2 §10.3). Read-only SoFi feed via MX. The
// permanent Access URL (with HTTP Basic creds embedded) lives in SIMPLEFIN_ACCESS_URL. We pull
// transactions since the last sync, upsert into fin_spend (source='simplefin', dedupe on ext_id),
// and auto-categorize new debits with Claude. Everything fails soft when the env var is absent.

interface SfTxn { id: string; posted: number; amount: string; description?: string; payee?: string }
interface SfAccount { id: string; name: string; balance: string; transactions?: SfTxn[] }

// The Access URL embeds basic-auth creds — split them into a header (undici won't use inline creds).
function splitAccessUrl(access: string): { base: string; auth: string } | null {
  try {
    const u = new URL(access)
    const auth = u.username ? 'Basic ' + Buffer.from(`${u.username}:${u.password}`).toString('base64') : ''
    u.username = ''; u.password = ''
    return { base: u.toString().replace(/\/$/, ''), auth }
  } catch {
    return null
  }
}

async function categorize(descriptions: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!descriptions.length || !process.env.ANTHROPIC_API_KEY) return out
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `Map each merchant/description to ONE category from: coffee, food, transport, shopping, entertainment, bills, health, other. Return ONLY JSON { "<description>": "<category>", ... }.`,
      messages: [{ role: 'user', content: descriptions.slice(0, 40).join('\n') }],
    })
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) Object.assign(out, JSON.parse(m[0]))
  } catch { /* fail soft → uncategorized */ }
  return out
}

export async function syncSimplefin(): Promise<{ ok: boolean; synced: number; balances?: Record<string, number>; reason?: string }> {
  const access = process.env.SIMPLEFIN_ACCESS_URL
  if (!access) return { ok: false, synced: 0, reason: 'SIMPLEFIN_ACCESS_URL not set' }
  const parts = splitAccessUrl(access)
  if (!parts) return { ok: false, synced: 0, reason: 'bad access url' }

  const db = getServiceClient()

  // Since the newest simplefin row, else last 14 days.
  const { data: last } = await db
    .from('fin_spend').select('spent_at').eq('source', 'simplefin').order('spent_at', { ascending: false }).limit(1).maybeSingle()
  const sinceSec = last ? Math.floor(new Date(last.spent_at).getTime() / 1000) : Math.floor((Date.now() - 14 * 86400_000) / 1000)

  let json: { accounts?: SfAccount[] }
  try {
    const res = await fetch(`${parts.base}/accounts?start-date=${sinceSec}`, {
      headers: parts.auth ? { Authorization: parts.auth } : {},
    })
    if (!res.ok) return { ok: false, synced: 0, reason: `simplefin ${res.status}` }
    json = await res.json()
  } catch (e) {
    return { ok: false, synced: 0, reason: e instanceof Error ? e.message : 'fetch failed' }
  }

  const balances: Record<string, number> = {}
  const pending: { txn: SfTxn; accountName: string; desc: string }[] = []
  for (const acct of json.accounts ?? []) {
    balances[acct.name] = parseFloat(acct.balance)
    for (const t of acct.transactions ?? []) {
      const amt = parseFloat(t.amount)
      if (!(amt < 0)) continue // debits only (money out); SimpleFIN debits are negative
      pending.push({ txn: t, accountName: acct.name, desc: t.payee || t.description || 'unknown' })
    }
  }

  const cats = await categorize([...new Set(pending.map(p => p.desc))])

  let synced = 0
  for (const p of pending) {
    const { error } = await db.from('fin_spend').upsert({
      amount: Math.abs(parseFloat(p.txn.amount)),
      merchant: p.desc,
      category: cats[p.desc] ?? 'other',
      source: 'simplefin',
      spent_at: new Date(p.txn.posted * 1000).toISOString(),
      ext_id: p.txn.id,
      account_name: p.accountName,
      raw: JSON.stringify(p.txn),
    }, { onConflict: 'ext_id', ignoreDuplicates: true })
    if (!error) synced++
  }

  return { ok: true, synced, balances }
}
