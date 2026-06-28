import { getServiceClient, USER_ID } from '@/lib/supabase'

/**
 * Server-side WHOOP helper. Holds all secret-bearing logic: OAuth token
 * exchange/refresh and the authenticated API proxy. Tokens are persisted in the
 * `whoop_tokens` Supabase table (see migration 0006) so they survive restarts
 * and are shared across every browser — the client never sees them.
 */

const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const V2_BASE = 'https://api.prod.whoop.com/developer/v2'
const V1_BASE = 'https://api.prod.whoop.com/developer/v1' // only /cycle still lives here

export const WHOOP_SCOPES =
  'read:recovery read:sleep read:workout read:cycles read:profile read:body_measurement offline'

export function whoopEnv() {
  const clientId = process.env.WHOOP_CLIENT_ID
  const clientSecret = process.env.WHOOP_CLIENT_SECRET
  return { clientId, clientSecret }
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const { clientId } = whoopEnv()
  const p = new URLSearchParams({
    client_id: clientId ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: WHOOP_SCOPES,
    state,
  })
  return `${AUTH_URL}?${p.toString()}`
}

interface StoredTokens {
  access: string
  refresh: string | null
  expiresAt: number // epoch ms
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('whoop_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', USER_ID)
    .single()
  if (!data?.access_token) return null
  return {
    access: data.access_token,
    refresh: data.refresh_token ?? null,
    expiresAt: new Date(data.expires_at).getTime(),
  }
}

async function saveTokens(t: StoredTokens): Promise<void> {
  const db = getServiceClient()
  await db.from('whoop_tokens').upsert({
    user_id: USER_ID,
    access_token: t.access,
    refresh_token: t.refresh,
    expires_at: new Date(t.expiresAt).toISOString(),
    updated_at: new Date().toISOString(),
  })
}

export async function clearTokens(): Promise<void> {
  const db = getServiceClient()
  await db.from('whoop_tokens').delete().eq('user_id', USER_ID)
}

function tokensFromResponse(json: Record<string, unknown>, prevRefresh: string | null): StoredTokens {
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600
  return {
    access: String(json.access_token ?? ''),
    refresh: (json.refresh_token as string) ?? prevRefresh,
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

/** Exchange an authorization code for tokens and persist them. The redirect_uri
 *  must be byte-identical to the one used in the authorize step. */
export async function exchangeCode(code: string, redirectUri: string): Promise<StoredTokens> {
  const { clientId, clientSecret } = whoopEnv()
  if (!clientId || !clientSecret) throw new Error('WHOOP env not configured')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`token exchange failed: ${text}`)
  const tokens = tokensFromResponse(JSON.parse(text), null)
  await saveTokens(tokens)
  return tokens
}

async function refresh(prev: StoredTokens): Promise<StoredTokens | null> {
  const { clientId, clientSecret } = whoopEnv()
  if (!prev.refresh || !clientId || !clientSecret) return null
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: prev.refresh,
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'offline',
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) return null
  const tokens = tokensFromResponse(await res.json(), prev.refresh)
  await saveTokens(tokens)
  return tokens
}

/** A valid access token, refreshing if it's within 60s of expiry. Null = not connected. */
export async function getValidAccessToken(): Promise<string | null> {
  let t = await getStoredTokens()
  if (!t) return null
  if (Date.now() > t.expiresAt - 60_000) {
    const next = await refresh(t)
    if (next) t = next
  }
  return t.access
}

/** Authenticated WHOOP API GET. `path` starts with '/'. v1 for /cycle, v2 otherwise. */
export async function whoopApiFetch(path: string, accessToken: string): Promise<Response> {
  const base = path.startsWith('/cycle') ? V1_BASE : V2_BASE
  return fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
}
