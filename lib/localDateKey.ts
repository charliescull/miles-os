// Returns YYYY-MM-DD in the user's local timezone, not server UTC.
// Use this everywhere we ask "what day is it?" to avoid the 4am reset bug.
export function localDateKey(date: Date = new Date()): string {
  const tz = process.env.USER_TIMEZONE ?? 'UTC'
  return date.toLocaleDateString('en-CA', { timeZone: tz }) // en-CA gives YYYY-MM-DD
}

export function localNow(): Date {
  return new Date()
}
