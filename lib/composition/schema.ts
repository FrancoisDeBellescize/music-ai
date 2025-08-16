import { z } from 'zod'

export type NoteDur = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd'

export type PitchNote = {
  pitch: string
  dur: NoteDur
  dots?: number
  tieStart?: boolean
  tieStop?: boolean
  velocity?: number
}

export type RestNote = { rest: true; dur: NoteDur; dots?: number }

export type Measure = {
  number: number
  harmony?: Array<{ beat: number; chord: string }>
  events: Array<PitchNote | RestNote | PitchNote[]>
}

export type Track = {
  name: string
  clef: 'treble' | 'bass' | 'percussion'
  midi?: { channel: number; program?: number; percussion?: boolean }
  measures: Measure[]
}

export type SymbolicScore = {
  meta: {
    title: string
    style: string
    tempoBPM: number
    timeSignature: string
    key: string
    length?: { measures?: number }
  }
  tracks: Track[]
  transpositions?: Record<string, { chromatic: number; octaveChange?: number }>
}

// Zod schemas
export const zNoteDur = z.enum(['whole', 'half', 'quarter', 'eighth', '16th', '32nd'])
export const zPitchNote = z.object({
  pitch: z.string(),
  dur: zNoteDur,
  dots: z.number().int().min(0).max(2).optional(),
  tieStart: z.boolean().optional(),
  tieStop: z.boolean().optional(),
  velocity: z.number().int().min(0).max(127).optional(),
})
export const zRestNote = z.object({
  rest: z.literal(true),
  dur: zNoteDur,
  dots: z.number().int().min(0).max(2).optional(),
})
export const zMeasure = z.object({
  number: z.number().int().min(1),
  harmony: z.array(z.object({ beat: z.number().min(1), chord: z.string() })).optional(),
  events: z.array(z.union([zPitchNote, zRestNote, z.array(zPitchNote).min(2)])).min(1),
})
export const zTrack = z.object({
  name: z.string().min(1),
  clef: z.enum(['treble', 'bass', 'percussion']),
  midi: z
    .object({
      channel: z.number().int().min(0).max(15),
      program: z.number().int().min(0).max(127).optional(),
      percussion: z.boolean().optional(),
    })
    .optional(),
  measures: z.array(zMeasure).min(1),
})
export const zSymbolicScore = z.object({
  meta: z.object({
    title: z.string(),
    style: z.string(),
    tempoBPM: z.number().int().min(30).max(300),
    timeSignature: z.string(),
    key: z.string(),
    length: z.object({ measures: z.number().int().min(1).max(128).optional() }).optional(),
  }),
  tracks: z.array(zTrack).min(1),
  transpositions: z
    .record(z.object({
      chromatic: z.number().int(),
      octaveChange: z.number().int().optional(),
    }))
    .optional(),
})

// Utilities (rhythm)
export const durToDiv = (d: NoteDur) => ({ whole: 32, half: 16, quarter: 8, eighth: 4, '16th': 2, '32nd': 1 }[d])
export const dotted = (base: number, dots = 0) => (dots === 0 ? base : dots === 1 ? Math.round(base * 1.5) : Math.round(base * 1.75))
export const parseTS = (ts: string) => {
  const [n, d] = ts.split('/').map(Number)
  return { beats: n, beatUnit: d }
}
export const measureTargetDivs = (ts: string, divisions = 8) => {
  const { beats, beatUnit } = parseTS(ts)
  const quarter = 8
  const factor = 4 / beatUnit
  return Math.round(beats * (quarter * factor))
}

// Helpers used by validators/tests
export function sumMeasureEventsDivs(events: Measure['events']): number {
  return events.reduce((acc, ev) => {
    if (Array.isArray(ev)) {
      const first = ev[0]
      return acc + dotted(durToDiv(first.dur), first.dots)
    }
    return acc + dotted(durToDiv(ev.dur), (ev as any).dots)
  }, 0)
}

