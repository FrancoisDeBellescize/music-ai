import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { openai, SYSTEM_PROMPT, MODEL_ID, FALLBACK_MODEL_ID } from '@/lib/openai'
import { isLikelyMusicXML, tryExtractMusicXML } from '@/lib/validate-musicxml'
import { rateLimitOk } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const InputSchema = z.object({
  prompt: z.string().min(1).max(2000),
  style: z.string().min(1),
  key: z.string().min(1),
  tempo: z.number().min(40).max(240),
  instrument: z.string().min(1),
})

async function generateXml(input: z.infer<typeof InputSchema>): Promise<string> {
  const userPrompt = `Contexte utilisateur:\nStyle: ${input.style}\nTonalité: ${input.key}\nTempo: ${input.tempo} BPM\nInstrument: ${input.instrument}\nConsignes: ${input.prompt}\n\nRéponds uniquement par un document MusicXML valide.`
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 80_000)
    const completion = await openai.chat.completions.create(
      {
        model: MODEL_ID,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 8192,
      },
      { signal: controller.signal as AbortSignal }
    )
    clearTimeout(t)
    return completion.choices?.[0]?.message?.content?.trim() || ''
  } catch (err) {
    // Fallback to a faster/smaller model
    const completion = await openai.chat.completions.create({
      model: FALLBACK_MODEL_ID,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8192,
    })
    return completion.choices?.[0]?.message?.content?.trim() || ''
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI error', message: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
  if (!rateLimitOk(typeof ip === 'string' ? ip : 'unknown')) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const json = await req.json().catch(() => null)
  const parsed = InputSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  try {
    let xml = await generateXml(parsed.data)
    if (!isLikelyMusicXML(xml)) {
      const extracted = tryExtractMusicXML(xml)
      if (extracted) {
        const bytes = Buffer.byteLength(extracted, 'utf8')
        return NextResponse.json({ xml: extracted, bytes })
      }
      const completion = await openai.chat.completions.create({
        model: FALLBACK_MODEL_ID,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'ONLY VALID MUSICXML. No text. Regenerate.' },
        ],
      })
      xml = completion.choices?.[0]?.message?.content?.trim() || ''
      if (!isLikelyMusicXML(xml)) {
        const ex2 = tryExtractMusicXML(xml)
        if (ex2) {
          const bytes = Buffer.byteLength(ex2, 'utf8')
          return NextResponse.json({ xml: ex2, bytes })
        }
        return NextResponse.json({ error: 'Invalid MusicXML from model' }, { status: 502 })
      }
    }
    const bytes = Buffer.byteLength(xml, 'utf8')
    return NextResponse.json({ xml, bytes })
  } catch (e: any) {
    const message = e?.message || 'OpenAI error'
    return NextResponse.json({ error: 'OpenAI error', message }, { status: 500 })
  }
}


