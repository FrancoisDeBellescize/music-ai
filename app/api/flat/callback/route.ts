import { NextRequest, NextResponse } from 'next/server'
import { setFlatTokenCookie } from '@/lib/flat'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))

  const tokenRes = await fetch('https://api.flat.io/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.FLAT_CLIENT_ID!,
      client_secret: process.env.FLAT_CLIENT_SECRET!,
      redirect_uri: process.env.FLAT_REDIRECT_URI!,
    }),
  })
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
  }
  const json = await tokenRes.json()
  await setFlatTokenCookie({ access_token: json.access_token, refresh_token: json.refresh_token, token_type: json.token_type, expires_in: json.expires_in })
  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
}


