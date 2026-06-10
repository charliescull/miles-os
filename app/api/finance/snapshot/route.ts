import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'
import { localDateKey } from '@/lib/localDateKey'

const SENTINEL = '1901-01-01'

async function runFinancePipeline(): Promise<Record<string, unknown>> {
  const sheetId = process.env.GOOGLE_SHEETS_FINANCE_ID
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY

  if (!sheetId || !email || !key) {
    return { error: 'Finance env vars not configured' }
  }

  // Get Google OAuth token via service account
  const { SignJWT } = await import('jose')
  const privateKey = key.replace(/\\n/g, '\n')

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    str2ab(atob(privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''))),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/drive.readonly' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(cryptoKey)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const { access_token } = await tokenRes.json()

  // Download as XLSX
  const xlsxRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  )
  if (!xlsxRes.ok) return { error: 'Failed to download sheet' }

  const xlsxBuf = await xlsxRes.arrayBuffer()
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(xlsxBuf as any)

  // Build text dump of all sheets
  const dump: string[] = []
  wb.eachSheet(sheet => {
    dump.push(`\n== Sheet: ${sheet.name} ==`)
    sheet.eachRow(row => {
      const vals = (row.values as unknown[]).slice(1).map(v => (v === null || v === undefined ? '' : String(v)))
      dump.push(vals.join('\t'))
    })
  })

  // Send to Claude
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const msg = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    output_config: { effort: 'max' },
    max_tokens: 1024,
    system: `You are a financial data extractor. Extract from the spreadsheet dump: net_worth (number), liquid (number), invested (number), liabilities (number), currency (string), as_of (YYYY-MM-DD string), income_mo (number or null), burn_mo (number or null), save_rate (number or null, percent), runway_months (number or null), history (array of {period: string, net_worth, liquid, invested, liabilities, delta} for last 24 months). Avoid double-counting. Use only the most recent row of any time-series. Output only valid JSON, no explanation.`,
    messages: [{ role: 'user', content: dump.join('\n').slice(0, 20000) }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { error: 'Claude returned no JSON' }

  return JSON.parse(match[0])
}

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i)
  return buf
}

export async function GET(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const db = getServiceClient()

  // Always read the latest snapshot first
  const { data: latest } = await db
    .from('daily_logs')
    .select('notes, log_date')
    .eq('user_id', USER_ID)
    .eq('log_date', SENTINEL)
    .single()

  if (!refresh && latest?.notes) {
    try {
      const notes = typeof latest.notes === 'string' ? JSON.parse(latest.notes) : latest.notes
      if (notes?.finance) return NextResponse.json(notes.finance)
    } catch {}
  }

  // Run pipeline (refresh or no snapshot exists)
  const result = await runFinancePipeline()
  if (result.error) {
    // Return empty snapshot rather than error
    return NextResponse.json({ net_worth: 0, liquid: 0, invested: 0, liabilities: 0 })
  }

  // Persist snapshot
  const currentNotes = latest?.notes
    ? (typeof latest.notes === 'string' ? JSON.parse(latest.notes) : latest.notes)
    : {}

  await db.from('daily_logs').upsert({
    user_id: USER_ID,
    log_date: SENTINEL,
    notes: JSON.stringify({ ...currentNotes, finance: result }),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,log_date' })

  return NextResponse.json(result)
}
