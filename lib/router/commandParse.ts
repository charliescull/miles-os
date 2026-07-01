// Explicit command grammar for the Telegram bot, matched BEFORE the LLM intent
// router so the user's exact phrasing is honored deterministically.
//
//   set appointment <subject> at <time> [every <freq>]
//   change appointment <subject> at <oldtime> to <newtime>
//   cancel appointment <subject> [at <time>]
//   bought <n> <ticker> [@ <price>]   /   sold <all|n> <ticker> [@ <price>]   (portfolio trade)
//   spent <amt> <what>  /  $<amt> <what>  /  <category> <amt>   (free spend log)
//   X <note text>            (a daily note — bullet, not a task)
//
// Anything that doesn't match falls through to the normal routeText pipeline
// (tasks like "read 10 pages" still classify into the tasks list as today).

export type Command =
  | { kind: 'set_appointment'; summary: string; when: string; freq: string | null }
  | { kind: 'change_appointment'; summary: string; oldWhen: string; newWhen: string }
  | { kind: 'cancel_appointment'; summary: string; when: string | null }
  | { kind: 'trade'; side: 'buy' | 'sell'; ticker: string; shares: number | 'all'; price: number | null }
  | { kind: 'spend'; amount: number; category: string; merchant: string | null }
  | { kind: 'note'; text: string }
  | null

// Known spend-category words → normalized category (also gates the "coffee 6" shorthand so it
// doesn't swallow arbitrary "<word> <number>" messages like "read 10").
const SPEND_WORDS: Record<string, string> = {
  coffee: 'coffee', food: 'food', lunch: 'food', dinner: 'food', breakfast: 'food', groceries: 'food',
  gas: 'transport', uber: 'transport', lyft: 'transport', transport: 'transport',
  shopping: 'shopping', amazon: 'shopping', entertainment: 'entertainment', movie: 'entertainment',
}

function categoryFor(text: string): string {
  const w = text.toLowerCase()
  for (const [key, cat] of Object.entries(SPEND_WORDS)) if (w.includes(key)) return cat
  return 'other'
}

export function parseCommand(raw: string): Command {
  const text = raw.trim()

  // change appointment <subject> at <old> to <new>
  const change = text.match(/^change\s+appointment\s+(.+?)\s+at\s+(.+?)\s+to\s+(.+)$/i)
  if (change) {
    return { kind: 'change_appointment', summary: change[1].trim(), oldWhen: change[2].trim(), newWhen: change[3].trim() }
  }

  // cancel appointment <subject> [at <time>]
  const cancel = text.match(/^(?:cancel|delete|remove)\s+appointment\s+(.+?)(?:\s+at\s+(.+))?$/i)
  if (cancel) {
    return { kind: 'cancel_appointment', summary: cancel[1].trim(), when: cancel[2]?.trim() ?? null }
  }

  // set appointment <subject> at <time> [every <freq>]
  const set = text.match(/^(?:set|add|new|create)\s+appointment\s+(.+?)\s+at\s+(.+?)(?:\s+every\s+(.+))?$/i)
  if (set) {
    return { kind: 'set_appointment', summary: set[1].trim(), when: set[2].trim(), freq: set[3]?.trim() ?? null }
  }

  // bought 10 NVDA @ 120  /  buy 2 AAPL at 190
  const buy = text.match(/^(?:bought|buy)\s+(\d+(?:\.\d+)?)\s+([a-zA-Z.]{1,8})(?:\s*(?:@|at)\s*\$?(\d+(?:\.\d+)?))?$/i)
  if (buy) {
    return { kind: 'trade', side: 'buy', ticker: buy[2].toUpperCase(), shares: parseFloat(buy[1]), price: buy[3] ? parseFloat(buy[3]) : null }
  }

  // sold all TSLA @ 240  /  sold 5 AAPL @ 190  /  sell 3 MU
  const sell = text.match(/^(?:sold|sell)\s+(all|\d+(?:\.\d+)?)\s+([a-zA-Z.]{1,8})(?:\s*(?:@|at)\s*\$?(\d+(?:\.\d+)?))?$/i)
  if (sell) {
    return { kind: 'trade', side: 'sell', ticker: sell[2].toUpperCase(), shares: /^all$/i.test(sell[1]) ? 'all' : parseFloat(sell[1]), price: sell[3] ? parseFloat(sell[3]) : null }
  }

  // spent 12 lunch  /  spent $12 on lunch
  const spent = text.match(/^spent\s+\$?(\d+(?:\.\d+)?)\s+(?:on\s+)?(.+)$/i)
  if (spent) {
    const what = spent[2].trim()
    return { kind: 'spend', amount: parseFloat(spent[1]), category: categoryFor(what), merchant: what }
  }

  // $40 gas
  const dollarFirst = text.match(/^\$(\d+(?:\.\d+)?)\s+(.+)$/)
  if (dollarFirst) {
    const what = dollarFirst[2].trim()
    return { kind: 'spend', amount: parseFloat(dollarFirst[1]), category: categoryFor(what), merchant: what }
  }

  // coffee 6  /  gas $40  (only for known spend-category words, so "read 10" stays a task)
  const catFirst = text.match(/^([a-z]+)\s+\$?(\d+(?:\.\d+)?)$/i)
  if (catFirst && Object.keys(SPEND_WORDS).includes(catFirst[1].toLowerCase())) {
    return { kind: 'spend', amount: parseFloat(catFirst[2]), category: categoryFor(catFirst[1]), merchant: catFirst[1].toLowerCase() }
  }

  // X <note>  (a leading X token marks a note)
  const note = text.match(/^x[\s:.\-,]+(.+)$/i)
  if (note && note[1].trim()) {
    return { kind: 'note', text: note[1].trim() }
  }

  return null
}
