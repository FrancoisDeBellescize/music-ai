import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getFlatToken, requireFlatTokenOrThrow } from '@/lib/flat'
import { isLikelyMusicXML } from '@/lib/validate-musicxml'

export const runtime = 'nodejs'

const Body = z.object({ xml: z.string().min(1) })

export async function POST(req: NextRequest) {
  const { xml } = Body.parse(await req.json())
  if (!isLikelyMusicXML(xml)) return NextResponse.json({ error: 'Invalid XML' }, { status: 400 })
  const token = await getFlatToken()
  try {
    requireFlatTokenOrThrow(token)
  } catch {
    return NextResponse.json({ error: 'Not authenticated with Flat' }, { status: 401 })
  }

  const form = new FormData()
  const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' })
  form.append('file', blob, 'composition.musicxml')
  form.append('title', 'Music IA Composition')

  const res = await fetch('https://api.flat.io/v2/scores', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token!.access_token}` },
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return NextResponse.json({ error: 'Flat API error', details: text }, { status: 502 })
  }
  const data = await res.json()
  const scoreId = data.id || data._id
  const shareUrl = `https://flat.io/score/${scoreId}`
  return NextResponse.json({ scoreId, shareUrl })
}


