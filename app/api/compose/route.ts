import { NextRequest, NextResponse } from 'next/server'
import { getOpenAI } from '@/lib/openai'
import { z } from 'zod'
import {
  SymbolicScore,
  zSymbolicScore,
  measureTargetDivs,
  sumMeasureEventsDivs,
  NoteDur,
} from '@/lib/composition/schema'
import { symbolicToMusicXML } from '@/lib/musicxml/emit'
import { symbolicToMIDI } from '@/lib/midi/emit'
import { DEFAULT_ARRANGE, type ArrangeConfig } from '@/lib/arrange/types'
import { applyAccompaniment } from '@/lib/arrange/applyAccompaniment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function pitchToMidi(pitch: string): number {
  const m = pitch.match(/^([A-G])((#|b){0,2})(-?\d+)$/)
  if (!m) throw new Error(`Invalid pitch: ${pitch}`)
  const step = m[1]
  const acc = m[2] || ''
  const octave = parseInt(m[4], 10)
  const stepToSemis: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let semis = stepToSemis[step]
  if (acc === '#') semis += 1
  else if (acc === '##') semis += 2
  else if (acc === 'b') semis -= 1
  else if (acc === 'bb') semis -= 2
  return 12 * (octave + 1) + semis
}

const DIV_TO_DUR: Record<32 | 16 | 8 | 4 | 2 | 1, NoteDur> = { 32: 'whole', 16: 'half', 8: 'quarter', 4: 'eighth', 2: '16th', 1: '32nd' }
function makeRestFill(diffDivs: number): Array<{ rest: true; dur: NoteDur }> {
  const parts: Array<{ rest: true; dur: NoteDur }> = []
  const values: Array<32 | 16 | 8 | 4 | 2 | 1> = [32, 16, 8, 4, 2, 1]
  for (const v of values) {
    while (diffDivs >= v) {
      parts.push({ rest: true as const, dur: DIV_TO_DUR[v] })
      diffDivs -= v
    }
    if (diffDivs === 0) break
  }
  return parts
}

const EXAMPLE_JSON_1 = {
  meta: { title: 'Example', style: 'jazz', tempoBPM: 120, timeSignature: '4/4', key: 'C major' },
  tracks: [
    {
      name: 'melody',
      clef: 'treble',
      measures: [
        {
          number: 1,
          notes: [
            { pitch: 'C4', dur: 'quarter' },
            { pitch: 'D4', dur: 'quarter' },
            { pitch: 'E4', dur: 'quarter' },
            { pitch: 'F4', dur: 'quarter' },
          ],
        },
        {
          number: 2,
          notes: [
            { pitch: 'G4', dur: 'half' },
            { rest: true, dur: 'half' },
          ],
        },
      ],
    },
  ],
}

const EXAMPLE_JSON_2 = {
  meta: { title: 'Example Minor', style: 'classical', tempoBPM: 90, timeSignature: '3/4', key: 'A minor' },
  tracks: [
    {
      name: 'melody',
      clef: 'treble',
      measures: [
        {
          number: 1,
          notes: [
            { pitch: 'A4', dur: 'quarter' },
            { pitch: 'B4', dur: 'eighth' },
            { pitch: 'C5', dur: 'eighth' },
            { pitch: 'D5', dur: 'quarter' },
          ],
        },
        {
          number: 2,
          notes: [
            { rest: true, dur: 'quarter' },
            { pitch: 'E5', dur: 'quarter' },
            { pitch: 'F5', dur: 'quarter' },
          ],
        },
      ],
    },
  ],
}

function tryExtractJson(text: string): unknown {
  // direct parse
  try {
    return JSON.parse(text)
  } catch {}
  // fenced block ```json ... ```
  const fenceMatch = text.match(/```json[\s\S]*?\n([\s\S]*?)```/i)
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1])
    } catch {}
  }
  // first { ... last }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    const slice = text.slice(first, last + 1)
    try {
      return JSON.parse(slice)
    } catch {}
  }
  return undefined
}

function coerceToSymbolicCandidate(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw
  if (raw.meta && raw.tracks) return raw
  for (const key of ['score', 'result', 'data', 'SymbolicScore']) {
    const maybe = raw[key]
    if (maybe && typeof maybe === 'object' && maybe.meta && maybe.tracks) return maybe
  }
  return raw
}

function isPitchString(p: unknown): boolean {
  if (typeof p !== 'string') return false
  return /^([A-G])((#|b){0,2})(-?\d+)$/.test(p)
}

function normalizeLLMOutput(candidate: any): any {
  if (!candidate || typeof candidate !== 'object') return candidate
  const copy = JSON.parse(JSON.stringify(candidate))
  // Hoist root meta fields if needed
  if (!copy.meta && (copy.title || copy.style || copy.tempoBPM || copy.timeSignature || copy.key || copy.length)) {
    copy.meta = {
      title: copy.title ?? 'Untitled',
      style: copy.style ?? 'unknown',
      tempoBPM: copy.tempoBPM ?? 120,
      timeSignature: copy.timeSignature ?? '4/4',
      key: copy.key ?? 'C major',
      length: copy.length,
    }
    delete copy.title
    delete copy.style
    delete copy.tempoBPM
    delete copy.timeSignature
    delete copy.key
    delete copy.length
  }
  if (!Array.isArray(copy.tracks)) return copy
  for (const t of copy.tracks) {
    if (!Array.isArray(t?.measures)) continue
    for (const m of t.measures) {
      // normalize notes -> events
      if (!Array.isArray(m?.events) && Array.isArray((m as any).notes)) {
        m.events = (m as any).notes
        delete (m as any).notes
      }
      if (!Array.isArray(m?.events)) continue
      const newEvents: any[] = []
      for (const ev of m.events) {
        if (Array.isArray(ev)) {
          if (ev.length === 1) {
            const first = ev[0]
            if (first && typeof first === 'object' && typeof first.pitch === 'string') {
              if (!isPitchString(first.pitch)) {
                // likely a chord symbol → move to harmony, replace by rest of same duration
                m.harmony ??= []
                m.harmony.push({ beat: 1, chord: first.pitch })
                newEvents.push({ rest: true, dur: first.dur, dots: first.dots })
                continue
              }
              // single note wrapped in array → unwrap
              newEvents.push({ pitch: first.pitch, dur: first.dur, dots: first.dots, velocity: first.velocity, tieStart: first.tieStart, tieStop: first.tieStop })
              continue
            }
          }
          newEvents.push(ev)
        } else {
          newEvents.push(ev)
        }
      }
      m.events = newEvents
    }
  }
  return copy
}

export async function POST(req: NextRequest) {
  try {
    const json = (await req.json()) as unknown
    const ArrangeConfigSchema = z.object({
      seed: z.number().int().optional(),
      quantize: z.object({
        enabled: z.boolean(),
        grid: z.enum(['1/4', '1/8', '1/16', '1/32']),
        strength: z.number().min(0).max(1),
        swing: z.object({ enabled: z.boolean(), ratio: z.number().min(0.55).max(0.75), applyTo: z.array(z.enum(['melody', 'chords', 'bass', 'drums', '*'] as const)).optional() }).optional(),
      }),
      humanize: z.object({ enabled: z.boolean(), timingJitterMs: z.number().min(0).max(50), velocityJitter: z.number().min(0).max(1), velocityCurve: z.enum(['linear', 'soft', 'hard']).optional() }),
      accompaniment: z.object({ enabled: z.boolean(), style: z.enum(['jazz-swing', 'pop-rock', 'bossa', 'ballad', 'latin', 'none']), sourceTracks: z.array(z.string()).optional(), targetTracks: z.array(z.string()).optional(), density: z.number().min(0).max(1).optional(), complexity: z.number().min(0).max(1).optional() }),
    })

    const CompositionSpecSchema = z.object({
      title: z.string(),
      style: z.string(),
      tempoBPM: z.number().int().min(30).max(300),
      timeSignature: z.string(),
      key: z.string(),
      length: z.object({ measures: z.number().int().min(1).max(64) }),
      instrumentation: z.array(z.enum(['melody', 'chords', 'bass', 'drums', 'pad', 'strings'] as const)).nonempty(),
      constraints: z.array(z.string()).optional(),
      userPrompt: z.string().max(2000),
      arrange: ArrangeConfigSchema.optional(),
      includeOverlaysInMusicXML: z.boolean().optional(),
      includeOverlaysInMIDI: z.boolean().optional(),
    })
    const parsed = CompositionSpecSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 })
    }
    const spec = parsed.data

    const client = getOpenAI()

    const systemPrompt = [
      'Tu es compositeur/arrangeur. Réponds UNIQUEMENT par un JSON valide conforme au type SymbolicScore (strict).',
      'Pistes = selon "instrumentation". Respecte timeSignature, tempoBPM, key, length.measures.',
      'Chaque mesure totalise EXACTEMENT la durée attendue.',
      '"chords" peut contenir des voicings (évènements simultanés).',
      'Ajoute "harmony" (symboles d’accords) si pertinent.',
      'Pas d’explication hors JSON.',
    ].join(' ')

    const fewShot = {
      meta: { title: 'FewShot', style: 'any', tempoBPM: spec.tempoBPM, timeSignature: spec.timeSignature, key: spec.key, length: { measures: 2 } },
      tracks: [
        { name: 'melody', clef: 'treble', measures: [ { number: 1, events: [ { pitch: 'C4', dur: 'quarter' }, { pitch: 'D4', dur: 'quarter' }, { pitch: 'E4', dur: 'quarter' }, { pitch: 'F4', dur: 'quarter' } ] }, { number: 2, events: [ { pitch: 'G4', dur: 'half' }, { rest: true, dur: 'half' } ] } ] },
        { name: 'chords', clef: 'treble', measures: [ { number: 1, events: [ [ { pitch: 'C4', dur: 'half' }, { pitch: 'E4', dur: 'half' }, { pitch: 'G4', dur: 'half' } ], [ { pitch: 'F4', dur: 'half' }, { pitch: 'A4', dur: 'half' }, { pitch: 'C5', dur: 'half' } ] ] }, { number: 2, events: [ [ { pitch: 'G3', dur: 'whole' }, { pitch: 'B3', dur: 'whole' }, { pitch: 'D4', dur: 'whole' } ] ] } ] },
        { name: 'bass', clef: 'bass', measures: [ { number: 1, events: [ { pitch: 'C2', dur: 'quarter' }, { pitch: 'C2', dur: 'quarter' }, { pitch: 'C2', dur: 'quarter' }, { pitch: 'C2', dur: 'quarter' } ] }, { number: 2, events: [ { pitch: 'G1', dur: 'quarter' }, { pitch: 'G1', dur: 'quarter' }, { pitch: 'G1', dur: 'quarter' }, { pitch: 'G1', dur: 'quarter' } ] } ] },
      ],
    }
    const userContent = JSON.stringify({ compositionSpec: spec, example: fewShot, instructions: 'Retourne uniquement un JSON SymbolicScore multi-pistes avec des "events" (notes, rests, ou tableaux de notes simultanées). Aucune autre clé.' })

    let content = ''
    try {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        response_format: { type: 'json_object' } as any,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }, { timeout: 60000 } as any)
      content = completion.choices[0]?.message?.content || ''
    } catch (e) {
      // Fallback shorter/cheaper model with tighter timeout
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.6,
        response_format: { type: 'json_object' } as any,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }, { timeout: 30000 } as any)
      content = completion.choices[0]?.message?.content || ''
    }

    const extracted = tryExtractJson(content)
    let data = coerceToSymbolicCandidate(extracted)
    if (!data) {
      // Fallback: generate a minimal valid SymbolicScore deterministically
      const measuresCount = Math.max(1, Math.min(8, spec.length.measures))
      const makeQuarterBar = (pitch: string) => ([
        { pitch, dur: 'quarter' },
        { pitch, dur: 'quarter' },
        { pitch, dur: 'quarter' },
        { pitch, dur: 'quarter' },
      ])
      const trackPitch = (name: string): string => {
        if (name === 'bass') return 'C2'
        if (name === 'chords') return 'C4'
        if (name === 'melody') return 'E4'
        if (name === 'strings' || name === 'pad') return 'C4'
        if (name === 'drums') return ''
        return 'C4'
      }
      const tracks = spec.instrumentation.map((name) => {
        const clef = name === 'bass' ? 'bass' : 'treble'
        const p = trackPitch(name)
        const measures = Array.from({ length: measuresCount }, (_, i) => {
          if (name === 'drums') {
            return { number: i + 1, events: [ { rest: true, dur: 'whole' } ] }
          }
          return { number: i + 1, events: makeQuarterBar(p) }
        })
        return { name, clef, measures }
      })
      data = {
        meta: {
          title: spec.title,
          style: spec.style,
          tempoBPM: spec.tempoBPM,
          timeSignature: spec.timeSignature,
          key: spec.key,
          length: { measures: measuresCount },
        },
        tracks,
      }
    }
    
    // Ensure candidate still goes through normalization/validation pipeline
    const normalized = normalizeLLMOutput(data)

    const validated = zSymbolicScore.safeParse(normalized)
    if (!validated.success) {
      return NextResponse.json({ error: 'JSON non conforme au schéma', details: validated.error.issues, raw: data }, { status: 422 })
    }

    const symbolic: SymbolicScore = validated.data

    // Auto-fix measures that are too short by padding rests
    const expectedDivs = measureTargetDivs(symbolic.meta.timeSignature, 8)
    for (const t of symbolic.tracks) {
      for (const m of t.measures) {
        const sum = sumMeasureEventsDivs(m.events as any)
        if (sum < expectedDivs) {
          const diff = expectedDivs - sum
          const fill = makeRestFill(diff)
          m.events.push(...(fill as any))
        }
      }
    }

    // MusicXML & MIDI validation
    const expected = measureTargetDivs(symbolic.meta.timeSignature, 8)
    const errors: string[] = []
    for (const t of symbolic.tracks) {
      for (const m of t.measures) {
        const sum = sumMeasureEventsDivs(m.events as any)
        if (sum !== expected) errors.push(`Track ${t.name} measure ${m.number}: sum=${sum}, expected=${expected}`)
      }
    }
    if (errors.length) {
      return NextResponse.json({ error: 'Durées de mesure invalides', details: errors }, { status: 422 })
    }

    const arrangeCfg: ArrangeConfig = { ...DEFAULT_ARRANGE, ...(spec as any).arrange }
    const includeOverlaysInMusicXML = (spec as any).includeOverlaysInMusicXML === true
    const includeOverlaysInMIDI = (spec as any).includeOverlaysInMIDI !== false

    let overlays = [] as any[]
    if (arrangeCfg.accompaniment.enabled) {
      const arranged = applyAccompaniment(symbolic, arrangeCfg)
      overlays = arranged.overlays
    }

    const musicxml = symbolicToMusicXML(symbolic, { overlays: includeOverlaysInMusicXML ? overlays : [] })
    const midiU8 = symbolicToMIDI(symbolic, { ...arrangeCfg, includeOverlaysInMIDI })
    const midiB64 = Buffer.from(midiU8).toString('base64')

    return NextResponse.json({ musicxml, midiB64 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error', message: String(err?.message || err) }, { status: 500 })
  }
}


