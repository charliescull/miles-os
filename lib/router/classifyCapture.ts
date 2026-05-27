import Anthropic from '@anthropic-ai/sdk'

export interface Classification {
  kind: 'task' | 'blocker' | 'decision' | 'content' | 'note' | 'habit'
  urgency: 'today' | 'this_week' | 'this_month' | 'someday'
  entity_id: string | null
  tags: string[]
  summary: string
  is_key: boolean
  owner: string | null
}

const SYSTEM =`You are a capture classifier for a personal OS. Given text, return JSON with:
- kind: "task" | "blocker" | "decision" | "content" | "note" | "habit"
- urgency: "today" | "this_week" | "this_month" | "someday"
- entity_id: null (always null — caller validates against DB)
- tags: string[] (1-3 relevant tags)
- summary: string (one sentence, clean)
- is_key: boolean (true if flagged as KEY, important, or critical)
- owner: string | null (who owns it, null if not mentioned)
Output only JSON, no explanation.`

export async function classifyCapture(text: string): Promise<Classification> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 256,
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')

    const parsed = JSON.parse(match[0])
    return {
      kind: parsed.kind ?? 'note',
      urgency: parsed.urgency ?? 'someday',
      entity_id: null, // always null — validated against DB before use
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [],
      summary: String(parsed.summary ?? text.slice(0, 100)),
      is_key: Boolean(parsed.is_key),
      owner: parsed.owner ?? null,
    }
  } catch {
    // Fallback: regex-based classification
    return regexClassify(text)
  }
}

function regexClassify(text: string): Classification {
  const lower = text.toLowerCase()
  const kind = lower.includes('block') || lower.includes('stuck') ? 'blocker'
    : lower.includes('decide') || lower.includes('decision') ? 'decision'
    : lower.includes('write') || lower.includes('post') || lower.includes('publish') ? 'content'
    : 'task'

  const urgency = lower.includes('today') || lower.includes('asap') || lower.includes('urgent') ? 'today'
    : lower.includes('this week') || lower.includes('by friday') ? 'this_week'
    : lower.includes('this month') ? 'this_month'
    : 'someday'

  return {
    kind,
    urgency,
    entity_id: null,
    tags: [],
    summary: text.slice(0, 100),
    is_key: lower.includes('key') || lower.includes('critical') || lower.includes('important'),
    owner: null,
  }
}
