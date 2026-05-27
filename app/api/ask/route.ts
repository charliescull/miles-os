import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const { question } = await req.json()
  if (!question?.trim()) return NextResponse.json({ error: 'Empty question' }, { status: 400 })

  // Embed question
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  })
  const embedding = res.data[0].embedding

  // Find similar chunks
  const db = getServiceClient()
  const { data: chunks } = await db.rpc('match_memory_chunks', {
    query_embedding: embedding,
    match_user_id: USER_ID,
    match_count: 20,
  })

  const context = (chunks ?? [])
    .map((c: { id: string; text: string; source_type: string }) => `[${c.id.slice(0, 8)}] (${c.source_type}): ${c.text.slice(0, 200)}`)
    .join('\n\n')

  // Stream response from Claude
  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are the user's personal assistant with access to their captured notes, tasks, and history. Answer the question using ONLY the context provided. Cite sources by referring to capture IDs in [brackets]. If you don't have enough context, say so clearly.`,
    messages: [{
      role: 'user',
      content: `Context:\n${context || 'No relevant context found.'}\n\nQuestion: ${question}`,
    }],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
