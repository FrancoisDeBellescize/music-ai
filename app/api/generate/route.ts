import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOpenAI, SYSTEM_PROMPT, MODEL_ID, FALLBACK_MODEL_ID, PLANNER_PROMPT } from '@/lib/openai'
import { isLikelyMusicXML, tryExtractMusicXML, normalizeMusicXML, countMeasures } from '@/lib/validate-musicxml'
import { rateLimitOk } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

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

async function generateXml(input: z.infer<typeof InputSchema>, deadlineAt: number): Promise<string> {
  const msLeft = () => Math.max(0, deadlineAt - Date.now())
  const hasTimeFor = (neededMs: number) => msLeft() > neededMs
  const extractMeasuresFromPrompt = (text: string): number | undefined => {
    if (!text) return undefined
    const m = text.match(/mesures?\s*[:=]?\s*(\d{1,3})/i)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n >= 1 && n <= 128) return n
    }
    return undefined
  }
  const style = input.style ?? 'non spécifié'
  const key = input.key ?? 'non spécifié'
  const isBossa = (style.toLowerCase().includes('bossa') || input.prompt.toLowerCase().includes('bossa'))
  const inferredTempo = input.tempo ?? (isBossa ? 130 : undefined)
  const tempoText = inferredTempo != null ? `${inferredTempo} BPM` : 'non spécifié'
  const instrument = input.instrument ?? 'non spécifié'
  const measures = input.measures != null ? String(input.measures) : 'non spécifié'
  const timeSignature = input.timeSignature ?? (isBossa ? '4/4' : 'non spécifié')
  const form = input.form ?? 'non spécifié'
  const complexity = String(input.complexity ?? 3)
  const polyphony = input.polyphony ?? 'non spécifié'
  const mood = input.mood ?? 'non spécifié'
  const instrumentation = input.instrumentation?.join(', ') ?? (instrument !== 'non spécifié' ? instrument : 'non spécifié')

  const targetMeasures = input.measures ?? extractMeasuresFromPrompt(input.prompt)
  const styleGuidance = isBossa
    ? `\n- Idiomes bossa nova: basse MG syncopée (binaire), anacrouses/anticipations (\"et\" de 2), accords enrichis MD (7, 9, 11, 13), voix intérieures en mouvement conjoint, ii–V–I fréquents, substitutions tritonique occasionnelles, dynamique douce.`
    : ''
  const isPiano = (instrument.toLowerCase().includes('piano') || instrumentation.toLowerCase().includes('piano') || input.prompt.toLowerCase().includes('piano'))
  const measuresLine = typeof targetMeasures === 'number'
    ? `Forme & longueur: ${form} sur ${targetMeasures} mesures (EXACTEMENT ${targetMeasures} mesures, pas plus, pas moins)`
    : `Forme & longueur: ${form} (nombre de mesures libre si non précisé)`
  const pianoLine = isPiano
    ? `\n- Pour piano: 2 portées (clef de sol et clef de fa) dans une seule <part id=\"P1\"> avec <attributes><staves>2</staves></attributes>. Déclarer deux <clef>. Taguer chaque note avec <staff>1</staff> (MD) ou <staff>2</staff> (MG).`
    : ''
  const strictMeasuresLine = typeof targetMeasures === 'number'
    ? `\n- IMPORTANT: Produire EXACTEMENT ${targetMeasures} balises <measure>. Aucune mesure en plus ni en moins.`
    : ''
  const briefPrompt = `Brief de composition:\n- Style & influences: ${style}\n- Humeur & énergie: ${mood}\n- ${measuresLine}\n- Mesure & tempo: ${timeSignature}, ${tempoText}\n- Tonalité & armure: ${key}\n- Instrumentation: ${instrumentation}\n- Polyphonie: ${polyphony}\n- Complexité (1–5): ${complexity}\n- Consignes: ${input.prompt}${styleGuidance}\n\nRendu attendu:\n- Respecter strictement MusicXML 3.1 (score-partwise) conformément au message système.${pianoLine}\n- Varier motifs, inclure développement thématique, voicings/idiomes du style.\n- Si complexité ≥ 3: enrichir harmonie/contrepoint/layering selon le style.\n- Fin de section avec cadence/fill selon le style.${strictMeasuresLine}`
  try {
    // Pass 1: Plan JSON (only if we have comfortable budget)
    let plan = '{}'
    if (hasTimeFor(44_000)) {
      const planTimeout = Math.min(8_000, Math.max(3_000, msLeft() - 38_000))
      const planRes = await getOpenAI().chat.completions.create({
        model: FALLBACK_MODEL_ID,
        temperature: 0.4,
        messages: [
          { role: 'system', content: PLANNER_PROMPT },
          { role: 'user', content: briefPrompt },
        ],
        max_tokens: 800,
      }, { timeout: planTimeout } as any)
      plan = planRes.choices?.[0]?.message?.content?.trim() || '{}'
    }

    // Pass 2: Rendu MusicXML
    const renderPrompt = `Plan (JSON):\n${plan}\n\nGénère maintenant la partition selon ce plan.`
    const controller = new AbortController()
    const mainBudget = Math.min(42_000, Math.max(3_000, msLeft() - 3_000))
    const t = setTimeout(() => controller.abort(), mainBudget)
    const completion = await getOpenAI().chat.completions.create(
      {
        model: hasTimeFor(40_000) ? MODEL_ID : FALLBACK_MODEL_ID,
        temperature: 1.05,
        top_p: 0.95,
        presence_penalty: 0.6,
        frequency_penalty: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: briefPrompt },
          { role: 'user', content: renderPrompt },
        ],
        max_tokens: 4096,
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
    if (needsAntiSilence && hasTimeFor(9_000)) {
      const antiSilencePrompt = `Le rendu ci-dessus contient trop de silences ou aucun <pitch>. Regénère en évitant les silences prédominants:
- Minimum 80% de la durée totale en notes avec <pitch>.
- Aucune section composée uniquement de silences.
- Inclure une mélodie principale clairement définie et un accompagnement/contrepoint selon l’instrumentation.
- N'utiliser <rest> que ponctuellement (respirations, fins de phrases).` 
      const fixTimeout = Math.min(8_000, Math.max(3_000, msLeft() - 2_000))
      const fix = await getOpenAI().chat.completions.create({
        model: hasTimeFor(12_000) ? MODEL_ID : FALLBACK_MODEL_ID,
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
        max_tokens: 2048,
      }, { timeout: fixTimeout } as any)
      xmlOut = fix.choices?.[0]?.message?.content?.trim() || xmlOut
    }

    // Mesure count enforcement (only if a target is specified)
    if (typeof targetMeasures === 'number' && hasTimeFor(9_000)) {
      const measureCount = countMeasures(xmlOut)
      if (measureCount !== targetMeasures) {
        const measureFixTimeout = Math.min(8_000, Math.max(3_000, msLeft() - 2_000))
        const fixMeasures = await getOpenAI().chat.completions.create({
          model: hasTimeFor(12_000) ? MODEL_ID : FALLBACK_MODEL_ID,
          temperature: 0.9,
          top_p: 0.95,
          presence_penalty: 0.3,
          frequency_penalty: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: briefPrompt },
            { role: 'user', content: `Le rendu précédent contient ${measureCount} mesures, mais il en faut EXACTEMENT ${targetMeasures}. Regénère le même contenu en ajustant le phrasé et la mise en page pour respecter strictement ${targetMeasures} balises <measure> (pas plus, pas moins).` },
          ],
          max_tokens: 2048,
        }, { timeout: measureFixTimeout } as any)
        xmlOut = fixMeasures.choices?.[0]?.message?.content?.trim() || xmlOut
      }
    }

    return xmlOut
  } catch (err) {
    // Fallback single-pass si la 2-pass échoue
    const fbTimeout = Math.min(10_000, Math.max(3_000, msLeft() - 1_000))
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
      max_tokens: 3072,
    }, { timeout: fbTimeout } as any)
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
    const deadlineAt = Date.now() + 48_000
    let xml = await generateXml(parsed.data, deadlineAt)
    if (!isLikelyMusicXML(xml)) {
      const extracted = tryExtractMusicXML(xml)
      if (extracted) {
        const normalized = normalizeMusicXML(extracted)
        if (normalized) {
          const bytes = Buffer.byteLength(normalized, 'utf8')
          return NextResponse.json({ xml: normalized, bytes })
        }
      }
      const retryBudget = Math.max(2_000, deadlineAt - Date.now() - 1_000)
      if (retryBudget < 2_000) {
        return NextResponse.json({ error: 'Invalid MusicXML from model' }, { status: 502 })
      }
      const completion = await getOpenAI().chat.completions.create({
        model: FALLBACK_MODEL_ID,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'Regénère en respectant strictement MusicXML 3.1 partwise + DOCTYPE + part-list cohérente avec les <part id="..."> correspondants. Aucun texte, aucun ```.' },
        ],
      }, { timeout: retryBudget } as any)
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


