import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const clientId = process.env.FLAT_CLIENT_ID!
  const redirectUri = process.env.FLAT_REDIRECT_URI!
  const scopes = encodeURIComponent('scores account.public_profile')
  const authUrl = `https://flat.io/auth/oauth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}`
  return NextResponse.redirect(authUrl)
}


