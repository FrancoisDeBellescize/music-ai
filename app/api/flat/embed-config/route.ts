import { NextResponse } from 'next/server'
import { getFlatToken } from '@/lib/flat'

export const runtime = 'edge'

export async function GET() {
  const token = await getFlatToken()
  return NextResponse.json({ connected: !!token?.access_token })
}


