import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOpenAI, SYSTEM_PROMPT, MODEL_ID, FALLBACK_MODEL_ID } from '@/lib/openai'
import { isLikelyMusicXML, tryExtractMusicXML, normalizeMusicXML } from '@/lib/validate-musicxml'
import { rateLimitOk } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const InputSchema = z.object({
  prompt: z.string().min(1).max(2000),
  style: z.string().optional(),
  key: z.string().optional(),
  tempo: z.number().min(40).max(240).optional(),
  instrument: z.string().optional(),
  measures: z.number().int().min(1).max(128).optional(),
})

async function generateXml(input: z.infer<typeof InputSchema>): Promise<string> {
  const style = input.style ?? 'non spécifié'
  const key = input.key ?? 'non spécifié'
  const tempo = input.tempo != null ? `${input.tempo} BPM` : 'non spécifié'
  const instrument = input.instrument ?? 'non spécifié'
  const measures = input.measures != null ? String(input.measures) : 'non spécifié'
  const userPrompt = `Paramètres utilisateur:\n- Style: ${style}\n- Tonalité: ${key}\n- Tempo: ${tempo}\n- Instrument: ${instrument}\n- Nombre de mesures souhaité: ${measures}\n- Consignes: ${input.prompt}\n\nSi un paramètre est non spécifié, choisis des valeurs musicales plausibles et cohérentes. Si un nombre de mesures est fourni, limiter la composition à ce nombre.\n\nCONTRAINTE DE FORMAT (OBLIGATOIRE): Produit EXCLUSIVEMENT un document MusicXML 3.1 valide (score-partwise) respectant les règles du système, avec l'en-tête, le DOCTYPE et la structure <part-list>/<score-part id=\"P1\"> cohérente avec <part id=\"P1\">. Aucune explication ni code block.`
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 80_000)
    const completion = await getOpenAI().chat.completions.create(
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
    const completion = await getOpenAI().chat.completions.create({
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
        const normalized = normalizeMusicXML(extracted)
        if (normalized) {
          const bytes = Buffer.byteLength(normalized, 'utf8')
          return NextResponse.json({ xml: normalized, bytes })
        }
      }
      const completion = await getOpenAI().chat.completions.create({
        model: FALLBACK_MODEL_ID,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'Regénère en respectant strictement MusicXML 3.1 partwise + DOCTYPE + part-list/score-part P1 + part P1. Aucun texte, aucun ```.' },
        ],
      })
      xml = completion.choices?.[0]?.message?.content?.trim() || ''
      if (!isLikelyMusicXML(xml)) {
        const ex2 = tryExtractMusicXML(xml)
        if (ex2) {
          const normalized = normalizeMusicXML(ex2)
          if (normalized) {
            const bytes = Buffer.byteLength(normalized, 'utf8')
            return NextResponse.json({ xml: normalized, bytes })
          }
        }
        return NextResponse.json({ error: 'Invalid MusicXML from model' }, { status: 502 })
      }
    }
    const normalizedFinal = normalizeMusicXML(xml)
    if (!normalizedFinal) {
      return NextResponse.json({ error: 'Invalid MusicXML after normalization' }, { status: 502 })
    }
    const bytes = Buffer.byteLength(normalizedFinal, 'utf8')
    return NextResponse.json({ xml: normalizedFinal, bytes })
  } catch (e: any) {
    const message = e?.message || 'OpenAI error'
    return NextResponse.json({ error: 'OpenAI error', message }, { status: 500 })
  }
}


