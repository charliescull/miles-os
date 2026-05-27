import OpenAI from 'openai'
import { getServiceClient, USER_ID } from './supabase'

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

export async function embedAndStore(
  text: string,
  sourceType: string,
  sourceId: string | null,
) {
  const openai = getOpenAI()
  if (!openai) return

  try {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    })
    const embedding = res.data[0].embedding

    const db = getServiceClient()
    await db.from('memory_chunks').insert({
      user_id: USER_ID,
      source_type: sourceType,
      source_id: sourceId,
      text: text.slice(0, 2000),
      embedding,
    })
  } catch (err) {
    console.error('Memory embed failed:', err)
  }
}
