import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getServiceClient, USER_ID } from '@/lib/supabase'
import { isAuthenticatedFromRequest } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!await isAuthenticatedFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query } = await req.json()
  if (!query?.trim()) return NextResponse.json([])

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const embedding = res.data[0].embedding

  const db = getServiceClient()
  const { data, error } = await db.rpc('match_memory_chunks', {
    query_embedding: embedding,
    match_user_id: USER_ID,
    match_count: 20,
  })

  if (error) {
    // Fallback: plain text search if RPC doesn't exist yet
    const { data: fallback } = await db
      .from('memory_chunks')
      .select('*')
      .eq('user_id', USER_ID)
      .ilike('text', `%${query}%`)
      .limit(20)
    return NextResponse.json(fallback ?? [])
  }

  return NextResponse.json(data ?? [])
}
