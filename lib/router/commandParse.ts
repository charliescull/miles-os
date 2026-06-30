// Explicit command grammar for the Telegram bot, matched BEFORE the LLM intent
// router so the user's exact phrasing is honored deterministically.
//
//   set appointment <subject> at <time> [every <freq>]
//   change appointment <subject> at <oldtime> to <newtime>
//   X <note text>            (a daily note — bullet, not a task)
//
// Anything that doesn't match falls through to the normal routeText pipeline
// (tasks like "read 10 pages" still classify into the tasks list as today).

export type Command =
  | { kind: 'set_appointment'; summary: string; when: string; freq: string | null }
  | { kind: 'change_appointment'; summary: string; oldWhen: string; newWhen: string }
  | { kind: 'note'; text: string }
  | null

export function parseCommand(raw: string): Command {
  const text = raw.trim()

  // change appointment <subject> at <old> to <new>
  const change = text.match(/^change\s+appointment\s+(.+?)\s+at\s+(.+?)\s+to\s+(.+)$/i)
  if (change) {
    return { kind: 'change_appointment', summary: change[1].trim(), oldWhen: change[2].trim(), newWhen: change[3].trim() }
  }

  // set appointment <subject> at <time> [every <freq>]
  const set = text.match(/^(?:set|add|new|create)\s+appointment\s+(.+?)\s+at\s+(.+?)(?:\s+every\s+(.+))?$/i)
  if (set) {
    return { kind: 'set_appointment', summary: set[1].trim(), when: set[2].trim(), freq: set[3]?.trim() ?? null }
  }

  // X <note>  (a leading X token marks a note)
  const note = text.match(/^x[\s:.\-,]+(.+)$/i)
  if (note && note[1].trim()) {
    return { kind: 'note', text: note[1].trim() }
  }

  return null
}
