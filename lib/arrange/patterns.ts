import type { ArrangeConfig } from './types'
import type { SymbolicScore, Measure, PitchNote, NoteDur } from '../composition/schema'
import type { TrackOverlay } from './overlay'
import { measureTargetDivs } from '../composition/schema'

export type PatternContext = {
  tempoBPM: number
  timeSignature: string
  key: string
  harmonyByMeasure: Record<number, { beat: number; chord: string }[]>
  divisions: number
  rng: (min: number, max: number) => number
  density: number
  complexity: number
}

export type PatternGenerator = (ctx: PatternContext) => {
  chords?: TrackOverlay
  bass?: TrackOverlay
  drums?: TrackOverlay
}

type ParsedChord = { root: string; quality: string }

export function parseChordSymbol(sym: string): ParsedChord {
  const m = sym.match(/^([A-G](?:#|b)?)(.*)$/)
  if (!m) return { root: 'C', quality: '' }
  return { root: m[1], quality: m[2] ?? '' }
}

const NOTE_TO_SEMI: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
const SEMI_TO_NOTE: string[] = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

function transposeNoteName(note: string, semis: number): string {
  const base = NOTE_TO_SEMI[note] ?? 0
  const out = ((base + semis) % 12 + 12) % 12
  return SEMI_TO_NOTE[out]
}

function nearestVoicing(target: number, candidates: number[]): number {
  let best = candidates[0]
  let bestDist = Math.abs(best - target)
  for (const c of candidates) {
    const d = Math.abs(c - target)
    if (d < bestDist) {
      best = c
      bestDist = d
    }
  }
  return best
}

function mkOverlay(name: string, measures: Array<{ number: number; events: any[] }>, metadata?: Record<string, any>): TrackOverlay {
  return { trackName: name, measures, metadata }
}

function buildBassWalking(ctx: PatternContext): TrackOverlay {
  const measures: Array<{ number: number; events: any[] }> = []
  const targetDivs = measureTargetDivs(ctx.timeSignature, ctx.divisions)
  const quarter = 8
  const stepDivs = quarter
  const defaultChord = ctx.harmonyByMeasure[1]?.[0]?.chord ?? 'Cmaj7'
  const firstRoot = parseChordSymbol(defaultChord).root
  let currentRootMidi = NOTE_TO_SEMI[firstRoot] ?? 0
  currentRootMidi += 24

  const maxMeasure = Math.max(1, ...Object.keys(ctx.harmonyByMeasure).map((n) => parseInt(n, 10)))
  for (let measNum = 1; measNum <= maxMeasure; measNum += 1) {
    const evs: any[] = []
    for (let p = 0; p < targetDivs; p += stepDivs) {
      const useApproach = ctx.complexity > 0.4 && p >= targetDivs - stepDivs
      let midi = currentRootMidi
      if (useApproach) {
        midi = currentRootMidi + (ctx.rng(0, 1) > 0.5 ? 2 : -1)
      }
      const name = SEMI_TO_NOTE[midi % 12] + String(Math.floor(midi / 12) - 1)
      evs.push({ atDivs: p, durDivs: stepDivs, notes: [{ pitch: name, dur: 'quarter' as NoteDur }] })
    }
    measures.push({ number: measNum, events: evs })
    currentRootMidi = (currentRootMidi + 5) % 36
    if (currentRootMidi < 24) currentRootMidi += 12
  }
  return mkOverlay('bass-gen', measures, { pattern: 'walking' })
}

function buildShellVoicings(ctx: PatternContext): TrackOverlay {
  const measures: Array<{ number: number; events: any[] }> = []
  const targetDivs = measureTargetDivs(ctx.timeSignature, ctx.divisions)
  const half = 16
  const hitTimes = [half / 2, (3 * half) / 2]
  const baseOct = 4
  const maxMeasure = Math.max(1, ...Object.keys(ctx.harmonyByMeasure).map((n) => parseInt(n, 10)))
  let lastTopMidi = 60
  for (let measNum = 1; measNum <= maxMeasure; measNum += 1) {
    const harm = ctx.harmonyByMeasure[measNum] ?? [{ beat: 1, chord: 'C7' }]
    const evs: any[] = []
    hitTimes.forEach((t) => {
      const chord = parseChordSymbol(harm[0].chord)
      const root = chord.root
      const rootSemi = NOTE_TO_SEMI[root] ?? 0
      const thirdSemi = rootSemi + (chord.quality.includes('m') && !chord.quality.includes('maj') ? 3 : 4)
      const seventhSemi = rootSemi + (chord.quality.includes('maj7') ? 11 : 10)
      const notesMidi = [thirdSemi, seventhSemi].map((s) => 12 * baseOct + ((s % 12) + 12) % 12)
      if (ctx.complexity > 0.6) {
        const ninth = rootSemi + 14
        notesMidi.push(12 * baseOct + ((ninth % 12) + 12) % 12)
      }
      const top = nearestVoicing(lastTopMidi, notesMidi)
      lastTopMidi = top
      const chordNotes = notesMidi.map((m) => ({ pitch: SEMI_TO_NOTE[m % 12] + String(Math.floor(m / 12) - 1), dur: 'eighth' as NoteDur }))
      evs.push({ atDivs: t, durDivs: 4, notes: chordNotes })
      if (ctx.density > 0.6) {
        const off = t - 2
        if (off >= 0) evs.push({ atDivs: off, durDivs: 2, notes: chordNotes })
      }
    })
    measures.push({ number: measNum, events: evs })
  }
  return mkOverlay('chords-gen', measures, { pattern: 'shell-voicings' })
}

function buildSwingDrums(ctx: PatternContext): TrackOverlay {
  const measures: Array<{ number: number; events: any[] }> = []
  const targetDivs = measureTargetDivs(ctx.timeSignature, ctx.divisions)
  const eighth = 4
  const rideMidi = 51
  const hihatMidi = 42
  const hits: any[] = []
  for (let p = 0; p < targetDivs; p += eighth) {
    hits.push({ atDivs: p, durDivs: 2, notes: [{ pitch: String(rideMidi), dur: '16th' as NoteDur, velocity: 90 }] })
  }
  const half = 16
  hits.push({ atDivs: half / 2, durDivs: 2, notes: [{ pitch: String(hihatMidi), dur: '16th' as NoteDur, velocity: 100 }] })
  hits.push({ atDivs: (3 * half) / 2, durDivs: 2, notes: [{ pitch: String(hihatMidi), dur: '16th' as NoteDur, velocity: 100 }] })
  measures.push({ number: 1, events: hits })
  return mkOverlay('drums-gen', measures, { pattern: 'swing-ride' })
}

export function genJazzSwing(ctx: PatternContext) {
  return {
    bass: buildBassWalking(ctx),
    chords: buildShellVoicings(ctx),
    drums: buildSwingDrums(ctx),
  }
}

export function genPopRock(ctx: PatternContext) {
  const measures: Array<{ number: number; events: any[] }> = []
  const targetDivs = measureTargetDivs(ctx.timeSignature, ctx.divisions)
  const eighth = 4
  const evs: any[] = []
  for (let p = 0; p < targetDivs; p += eighth) {
    evs.push({ atDivs: p, durDivs: eighth, notes: [{ pitch: 'C4', dur: 'eighth' as NoteDur, velocity: 90 }] })
    if (ctx.complexity > 0.5 && p + 2 < targetDivs) evs.push({ atDivs: p + 2, durDivs: 2, notes: [{ pitch: 'C4', dur: '16th' as NoteDur, velocity: 80 }] })
  }
  measures.push({ number: 1, events: evs })
  const bass: TrackOverlay = { trackName: 'bass-gen', measures: [{ number: 1, events: [ { atDivs: 0, durDivs: 8, notes: [{ pitch: 'C2', dur: 'quarter' as NoteDur }] }, { atDivs: 8, durDivs: 8, notes: [{ pitch: 'G2', dur: 'quarter' as NoteDur }] }, { atDivs: 16, durDivs: 8, notes: [{ pitch: 'C3', dur: 'quarter' as NoteDur }] }, { atDivs: 24, durDivs: 8, notes: [{ pitch: 'G2', dur: 'quarter' as NoteDur }] } ] }], metadata: { pattern: 'root-5' } }
  const chords: TrackOverlay = { trackName: 'chords-gen', measures, metadata: { pattern: 'eighths' } }
  return { bass, chords }
}

export function genBossa(ctx: PatternContext) {
  const measures: Array<{ number: number; events: any[] }> = []
  const targetDivs = measureTargetDivs(ctx.timeSignature, ctx.divisions)
  const half = 16
  const evs: any[] = []
  evs.push({ atDivs: 0, durDivs: half + 4, notes: [{ pitch: 'C4', dur: 'half' as NoteDur, dots: 1 as any, velocity: 90 }] })
  evs.push({ atDivs: half + 6, durDivs: 2, notes: [{ pitch: 'C4', dur: '16th' as NoteDur, velocity: 90 }] })
  measures.push({ number: 1, events: evs })
  const bass: TrackOverlay = { trackName: 'bass-gen', measures: [{ number: 1, events: [ { atDivs: 0, durDivs: 8, notes: [{ pitch: 'C2', dur: 'quarter' as NoteDur }] }, { atDivs: 12, durDivs: 4, notes: [{ pitch: 'G2', dur: 'eighth' as NoteDur }] } ] }], metadata: { pattern: 'tumbao-lite' } }
  const chords: TrackOverlay = { trackName: 'chords-gen', measures, metadata: { pattern: 'anticipations' } }
  return { bass, chords }
}


