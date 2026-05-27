import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const COOKIE_NAME = 'os-auth'
const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? 'dev-secret-change-me')

export async function signToken(): Promise<string> {
  return new SignJWT({ auth: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret)
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}

export async function getAuthCookie(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(COOKIE_NAME)?.value
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthCookie()
  if (!token) return false
  return verifyToken(token)
}

export function isAuthenticatedFromRequest(req: NextRequest): Promise<boolean> {
  // Check API secret header first (for cron / programmatic access)
  const apiSecret = req.headers.get('x-api-secret')
  if (apiSecret && apiSecret === process.env.API_SECRET) return Promise.resolve(true)

  const cronSecret = req.headers.get('authorization')
  if (cronSecret === `Bearer ${process.env.CRON_SECRET}`) return Promise.resolve(true)

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return Promise.resolve(false)
  return verifyToken(token)
}

export { COOKIE_NAME }
