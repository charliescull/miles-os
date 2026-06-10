import Anthropic from '@anthropic-ai/sdk'

// Lightweight router for the Telegram bot's TEXT / voice messages. One cheap Claude call decides
// where a free-form message goes. Task-completion ("finished X") is detected earlier by regex
// (lib/tasks/taskIntent) and photos are handled by vision — everything else flows through here.
// 'capture' falls back to the existing classifyCapture pipeline so nothing is ever lost.

export type TgIntent = 'calendar' | 'food' | 'recipe' | 'capture'

export async function classifyTelegramIntent(text: string): Promise<TgIntent> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      output_config: { effort: 'max' },
      max_tokens: 8,
      system: `Route the message to ONE destination. Reply with ONLY one lowercase word.
- calendar: scheduling an event/appointment/meeting at a specific date AND time.
- recipe: a dish or recipe to save to the recipe library (they say "recipe", or give ingredients/instructions to cook).
- food: logging something eaten or drunk (a meal, snack, or food item) for nutrition tracking.
- capture: everything else — tasks, todos, reminders, notes, ideas, blockers, decisions.
Answer with exactly one of: calendar, recipe, food, capture.`,
      messages: [{ role: 'user', content: text }],
    })
    const out = (msg.content[0]?.type === 'text' ? msg.content[0].text : '').toLowerCase()
    if (out.includes('calendar')) return 'calendar'
    if (out.includes('recipe')) return 'recipe'
    if (out.includes('food')) return 'food'
    return 'capture'
  } catch {
    return 'capture' // never lose a message on a classifier error
  }
}
