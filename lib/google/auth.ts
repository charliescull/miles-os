// Shared service-account → OAuth access-token helper. Same JWT plumbing already used by
// lib/finance/sheets.ts (Drive) — generalized with a scope param so the calendar write path
// (Phase 4 of the Telegram agent) can reuse the SAME GOOGLE_SERVICE_ACCOUNT_EMAIL / _KEY env
// without a third copy. (Finance code keeps its own copy for now to avoid touching it.)

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i)
  return buf
}

// Obtain a Google OAuth2 access token for the given scope via the service-account JWT grant.
export async function getGoogleAccessToken(scope: string): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!email || !key) throw new Error('Google service account env vars not configured')

  const { SignJWT } = await import('jose')
  const privateKey = key.replace(/\\n/g, '\n')
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    str2ab(atob(privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''))),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(cryptoKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const json = await res.json()
  if (!json.access_token) throw new Error('Failed to obtain Google access token')
  return json.access_token
}
