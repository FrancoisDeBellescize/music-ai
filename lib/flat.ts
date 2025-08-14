import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

const COOKIE_NAME = 'flat_auth'
const ENC_SECRET = new TextEncoder().encode(process.env.FLAT_COOKIE_SECRET || 'dev-secret-must-change')

type TokenPayload = {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  obtained_at: number
}

export async function setFlatTokenCookie(token: Omit<TokenPayload, 'obtained_at'>) {
  const jwt = await new SignJWT({ ...token, obtained_at: Date.now() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(ENC_SECRET)
  cookies().set(COOKIE_NAME, jwt, { httpOnly: true, sameSite: 'lax', secure: true, path: '/' })
}

export async function getFlatToken(): Promise<TokenPayload | null> {
  const c = cookies().get(COOKIE_NAME)
  if (!c?.value) return null
  try {
    const { payload } = await jwtVerify(c.value, ENC_SECRET)
    return payload as any
  } catch {
    return null
  }
}

export function requireFlatTokenOrThrow(token: TokenPayload | null): asserts token is TokenPayload {
  if (!token?.access_token) throw new Error('FLAT_NOT_AUTHENTICATED')
}


