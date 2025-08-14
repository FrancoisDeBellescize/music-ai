import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { put } from '@vercel/blob'
import { isLikelyMusicXML, tryExtractMusicXML } from '@/lib/validate-musicxml'
import { XMLValidator } from 'fast-xml-parser'

export const runtime = 'nodejs'

const Body = z.object({ xml: z.string().min(1), title: z.string().optional() })

export async function POST(req: NextRequest) {
  const { xml, title } = Body.parse(await req.json())
  let candidate = xml?.trim()
  if (!isLikelyMusicXML(candidate)) {
    const extracted = tryExtractMusicXML(candidate)
    if (extracted) {
      candidate = extracted
    }
  }
  if (!isLikelyMusicXML(candidate)) {
    const validateResult = XMLValidator.validate(candidate || '')
    const reason = typeof validateResult === 'object' ? validateResult.err?.msg : 'XML not recognized as MusicXML'
    return NextResponse.json({ error: 'Invalid XML', reason }, { status: 400 })
  }

  try {
    // Ensure Blob is configured: on Vercel, enable Blob storage; for local dev, set BLOB_READ_WRITE_TOKEN
    const filename = `music-ia-${Date.now()}.musicxml`
    const uploaded = await put(filename, candidate!, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/vnd.recordare.musicxml+xml; charset=utf-8',
    })
    const t = title || 'Music IA Composition'
    const importUrl = `https://flat.io/score/import-url?url=${encodeURIComponent(uploaded.url)}&title=${encodeURIComponent(t)}&app=${encodeURIComponent(process.env.FLAT_CLIENT_ID || '')}`
    return NextResponse.json({ importUrl, publicUrl: uploaded.url })
  } catch (e: any) {
    return NextResponse.json({ error: 'Blob upload failed', message: e?.message || 'unknown' }, { status: 500 })
  }
}


