import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOpenAI, SYSTEM_PROMPT, MODEL_ID, FALLBACK_MODEL_ID, PLANNER_PROMPT } from '@/lib/openai'
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
  timeSignature: z.string().optional(),
  form: z.string().optional(),
  complexity: z.number().int().min(1).max(5).optional(),
  polyphony: z.enum(['mono', 'two-voices', 'chords', 'multi-part']).optional(),
  mood: z.string().optional(),
  instrumentation: z.array(z.string()).optional(),
})

async function generateXml(input: z.infer<typeof InputSchema>): Promise<string> {
  const style = input.style ?? 'non spécifié'
  const key = input.key ?? 'non spécifié'
  const tempoText = input.tempo != null ? `${input.tempo} BPM` : 'non spécifié'
  const instrument = input.instrument ?? 'non spécifié'
  const measures = input.measures != null ? String(input.measures) : 'non spécifié'
  const timeSignature = input.timeSignature ?? 'non spécifié'
  const form = input.form ?? 'non spécifié'
  const complexity = input.complexity != null ? String(input.complexity) : 'non spécifié'
  const polyphony = input.polyphony ?? 'non spécifié'
  const mood = input.mood ?? 'non spécifié'
  const instrumentation = input.instrumentation?.join(', ') ?? (instrument !== 'non spécifié' ? instrument : 'non spécifié')

  const briefPrompt = `Brief de composition:\n- Style & influences: ${style}\n- Humeur & énergie: ${mood}\n- Forme & longueur: ${form} sur ${measures} mesures\n- Mesure & tempo: ${timeSignature}, ${tempoText}\n- Tonalité & armure: ${key}\n- Instrumentation: ${instrumentation}\n- Polyphonie: ${polyphony}\n- Complexité (1–5): ${complexity}\n- Consignes: ${input.prompt}\n\nRendu attendu:\n- Respecter strictement MusicXML 3.1 (score-partwise) conformément au message système.\n- Utiliser 1 à 3 parties selon l’instrumentation. Assurer accompagnement/contrepoint si pertinent.\n- Varier motifs, inclure développement thématique, voicings/idiomes du style.\n- Si complexité ≥ 3: enrichir harmonie/contrepoint/layering selon le style.\n- Fin de section avec cadence/fill selon le style.`
  try {
    // Pass 1: Plan JSON
    const planRes = await getOpenAI().chat.completions.create({
      model: FALLBACK_MODEL_ID,
      temperature: 0.4,
      messages: [
        { role: 'system', content: PLANNER_PROMPT },
        { role: 'user', content: briefPrompt },
      ],
      max_tokens: 1200,
    })
    const plan = planRes.choices?.[0]?.message?.content?.trim() || '{}'

    // Pass 2: Rendu MusicXML
    const renderPrompt = `Plan (JSON):\n${plan}\n\nGénère maintenant la partition selon ce plan.`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 90_000)
    const completion = await getOpenAI().chat.completions.create(
      {
        model: MODEL_ID,
        temperature: 1.05,
        top_p: 0.95,
        presence_penalty: 0.6,
        frequency_penalty: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: briefPrompt },
          { role: 'user', content: renderPrompt },
        ],
        max_tokens: 8192,
      },
      { signal: controller.signal as AbortSignal }
    )
    clearTimeout(t)
    let xmlOut = completion.choices?.[0]?.message?.content?.trim() || ''

    // Anti-silence: si quasi uniquement des silences, redemander un rendu avec contraintes anti-silence
    const count = (re: RegExp, s: string) => (s.match(re) || []).length
    const rests = count(/<rest\b/gi, xmlOut)
    const pitches = count(/<pitch\b/gi, xmlOut)
    const needsAntiSilence = pitches === 0 || rests > pitches * 1.2
    if (needsAntiSilence) {
      const antiSilencePrompt = `Le rendu ci-dessus contient trop de silences ou aucun <pitch>. Regénère en évitant les silences prédominants:
- Minimum 80% de la durée totale en notes avec <pitch>.
- Aucune section composée uniquement de silences.
- Inclure une mélodie principale clairement définie et un accompagnement/contrepoint selon l’instrumentation.
- N'utiliser <rest> que ponctuellement (respirations, fins de phrases).` 
      const fix = await getOpenAI().chat.completions.create({
        model: MODEL_ID,
        temperature: 1.05,
        top_p: 0.95,
        presence_penalty: 0.6,
        frequency_penalty: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: briefPrompt },
          { role: 'user', content: `Plan (JSON):\n${plan}` },
          { role: 'user', content: antiSilencePrompt },
        ],
        max_tokens: 8192,
      })
      xmlOut = fix.choices?.[0]?.message?.content?.trim() || xmlOut
    }

    return xmlOut
  } catch (err) {
    // Fallback single-pass si la 2-pass échoue
    const completion = await getOpenAI().chat.completions.create({
      model: FALLBACK_MODEL_ID,
      temperature: 0.9,
      top_p: 0.95,
      presence_penalty: 0.5,
      frequency_penalty: 0.25,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: briefPrompt },
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
          { role: 'user', content: 'Regénère en respectant strictement MusicXML 3.1 partwise + DOCTYPE + part-list cohérente avec les <part id="..."> correspondants. Aucun texte, aucun ```.' },
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


