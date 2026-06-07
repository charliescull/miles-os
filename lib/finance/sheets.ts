import type { Workbook, Worksheet, Row } from 'exceljs'
import type { Holding, ParsedSheet } from './types'
import { SHEET_TABS, metaFor } from './constants'

// Reads the finance Google Sheet deterministically (column/label based) — unlike the
// legacy /api/finance/snapshot route which dumps the sheet to Claude. Reuses the same
// service-account JWT → Drive XLSX export → exceljs plumbing. See spec §2 + verified
// structure notes in docs/vault/specs/finance-tab-rebuild-v1.md.

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i)
  return buf
}

// Coerce an exceljs cell value (number | string | Date | formula-result | rich text) to a number.
function cellNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'object') {
    // exceljs formula cell: { formula, result } ; treat result recursively
    const r = (v as { result?: unknown }).result
    if (r !== undefined) return cellNum(r)
    return null
  }
  // string: strip currency formatting
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map(t => t.text).join('').trim()
    if (o.text !== undefined) return String(o.text).trim()
    if (o.result !== undefined) return cellStr(o.result)
  }
  return String(v).trim()
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!email || !key) throw new Error('Google service account env vars not configured')

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

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const json = await res.json()
  if (!json.access_token) throw new Error('Failed to obtain Google access token')
  return json.access_token
}

async function getWorkbook(): Promise<Workbook> {
  const sheetId = process.env.GOOGLE_SHEETS_FINANCE_ID
  if (!sheetId) throw new Error('GOOGLE_SHEETS_FINANCE_ID not configured')
  const token = await getAccessToken()

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Failed to download sheet (${res.status})`)
  const buf = await res.arrayBuffer()

  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)
  return wb
}

function findSheet(wb: Workbook, keyword: string): Worksheet | null {
  const lower = keyword.toLowerCase()
  let found: Worksheet | null = null
  wb.eachSheet(ws => {
    if (!found && ws.name.toLowerCase().includes(lower)) found = ws
  })
  return found
}

// Locate the header row by scanning column A for an expected label (case-insensitive).
function findHeaderRow(ws: Worksheet, colAEquals: string): number {
  let target = -1
  ws.eachRow((row: Row, rowNumber: number) => {
    if (target === -1 && cellStr(row.getCell(1).value).toLowerCase() === colAEquals.toLowerCase()) {
      target = rowNumber
    }
  })
  return target
}

function parseInvestments(wb: Workbook): { holdings: Holding[]; buyingPower: number } {
  const ws = findSheet(wb, 'investment')
  if (!ws) throw new Error(`Sheet "${SHEET_TABS.investments}" not found`)

  const headerRow = findHeaderRow(ws, 'Ticker')
  if (headerRow === -1) throw new Error('Investments header row (Ticker) not found')

  const holdings: Holding[] = []
  let buyingPower = 0
  const last = ws.rowCount

  for (let r = headerRow + 1; r <= last; r++) {
    const row = ws.getRow(r)
    const rawTicker = cellStr(row.getCell(1).value)
    if (!rawTicker) break // first fully-blank ticker ends the table

    const shares = cellNum(row.getCell(3).value)
    const avgCost = cellNum(row.getCell(4).value)

    if (rawTicker.toLowerCase().includes('buying power')) {
      // Cash row: amount lives in whichever of Shares(C)/AvgCost(D) is populated (D in the live sheet).
      buyingPower = avgCost ?? shares ?? 0
      continue
    }

    const ticker = rawTicker.toUpperCase()
    const meta = metaFor(ticker)
    holdings.push({
      ticker,
      rawTicker,
      shares: shares ?? 0,
      avgCost, // null when blank (e.g. GOOGL) → no cost basis
      dateRecorded: cellStr(row.getCell(2).value) || null,
      instrument: meta.instrument,
      sector: meta.sector,
    })
  }

  return { holdings, buyingPower }
}

function parseAccounts(wb: Workbook): Pick<ParsedSheet, 'accounts' | 'liabilities'> {
  const ws = findSheet(wb, 'asset')
  if (!ws) throw new Error(`Sheet "${SHEET_TABS.accounts}" not found`)

  // Assets block: label col A, value col C. Liabilities block: label col D, value col F.
  // Collect by fuzzy keyword match so "(11 Weeks)" / "(Refund)" suffixes don't break lookups.
  const assetPairs: { label: string; value: number | null }[] = []
  const liabPairs: { label: string; value: number | null }[] = []

  ws.eachRow((row: Row) => {
    const aLabel = cellStr(row.getCell(1).value)
    if (aLabel) assetPairs.push({ label: aLabel.toLowerCase(), value: cellNum(row.getCell(3).value) })
    const dLabel = cellStr(row.getCell(4).value)
    if (dLabel) liabPairs.push({ label: dLabel.toLowerCase(), value: cellNum(row.getCell(6).value) })
  })

  const pick = (pairs: { label: string; value: number | null }[], kw: string): number | null =>
    pairs.find(p => p.label.includes(kw))?.value ?? null

  return {
    accounts: {
      bankAccount: pick(assetPairs, 'bank account'),
      robinhood: pick(assetPairs, 'robinhood'),
      takeHome11wk: pick(assetPairs, 'take home'),
      federalRefund: pick(assetPairs, 'federal tax'),
      stateRefund: pick(assetPairs, 'state tax'),
    },
    liabilities: {
      hertz: pick(liabPairs, 'hertz'),
      rent: pick(liabPairs, 'total rent'), // 'rent' alone also matches "Hertz Car Rental"
      groceryWeekly: pick(liabPairs, 'grocery'),
      evCharging: pick(liabPairs, 'ev charging'),
      julyReserve: pick(liabPairs, '4th of july'),
    },
  }
}

export async function readFinanceSheet(): Promise<ParsedSheet> {
  const wb = await getWorkbook()
  const { holdings, buyingPower } = parseInvestments(wb)
  const { accounts, liabilities } = parseAccounts(wb)
  return { holdings, buyingPower, accounts, liabilities }
}
