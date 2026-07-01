// Shared Telegram push helper (finance overhaul v2 §9.4 / §10.2). Mirrors the sender in
// app/api/cron/alerts/route.ts; fails soft when the bot token / user id aren't configured.

export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_USER_ID
  if (!token || !chatId) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(() => {})
}
