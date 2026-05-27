import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const USER_ID = process.env.USER_ID ?? 'user'

// Lazy client creation — avoids build-time errors when env vars aren't set yet
let _service: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (_service) return _service

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Supabase env vars not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }

  _service = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _service
}

// Public client for client-side (currently unused — all reads go through service client server-side)
export function getPublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  return createClient(url, key)
}
