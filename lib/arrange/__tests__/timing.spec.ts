import { describe, it, expect } from 'vitest'
import { humanizeAndQuantizeMIDI } from '../humanizeAndQuantizeMIDI'
import { DEFAULT_ARRANGE, type ArrangeConfig } from '../types'
import type { SymbolicScore } from '@/lib/composition/schema'
import { applySwingOffset, GRID_TO_DIVS } from '../timing'

const baseScore: SymbolicScore = {
  meta: { title: 'T', style: 'x', tempoBPM: 120, timeSignature: '4/4', key: 'C major' },
  tracks: [
    { name: 'melody', clef: 'treble', measures: [ { number: 1, events: [ { pitch: 'C4', dur: 'eighth' }, { pitch: 'D4', dur: '16th' }, { pitch: 'E4', dur: '16th' }, { pitch: 'F4', dur: 'quarter' }, { pitch: 'G4', dur: 'quarter' } ] } ] },
  ],
}

describe('Quantize', () => {
  it('grid=1/8, strength=1 aligns to grid', () => {
    const cfg: ArrangeConfig = { ...DEFAULT_ARRANGE, quantize: { ...DEFAULT_ARRANGE.quantize, enabled: true, grid: '1/8', strength: 1 }, humanize: { ...DEFAULT_ARRANGE.humanize, enabled: false } }
    const r = humanizeAndQuantizeMIDI(baseScore, cfg)
    // starts should be multiples of 4
    r.events.forEach((e) => expect(e.startDivs % 4).toBe(0))
  })
  it('strength=0.5 moves halfway', () => {
    const cfg: ArrangeConfig = { ...DEFAULT_ARRANGE, quantize: { ...DEFAULT_ARRANGE.quantize, enabled: true, grid: '1/8', strength: 0.5 }, humanize: { ...DEFAULT_ARRANGE.humanize, enabled: false } }
    const r = humanizeAndQuantizeMIDI(baseScore, cfg)
    // the second note starts at 4 (after first 4), third note at 6 -> snaps toward 8 => halfway to 8 is 7
    const third = r.events[2]
    expect(third.startDivs).toBe(7)
  })
})

describe('Swing', () => {
  it('applies offset to even eighths', () => {
    const ratio = 0.66
    const grid = '1/8' as const
    const gridDivs = GRID_TO_DIVS[grid]
    const offset = applySwingOffset(4, gridDivs, ratio)
    expect(offset).toBeGreaterThan(0)
  })
})

describe('Humanize (seeded)', () => {
  it('same seed yields same offsets/velocities', () => {
    const cfg: ArrangeConfig = { ...DEFAULT_ARRANGE, seed: 4242, humanize: { enabled: true, timingJitterMs: 12, velocityJitter: 0.12, velocityCurve: 'soft' }, quantize: { ...DEFAULT_ARRANGE.quantize, enabled: false } }
    const r1 = humanizeAndQuantizeMIDI(baseScore, cfg)
    const r2 = humanizeAndQuantizeMIDI(baseScore, cfg)
    expect(r1.events.map((e) => [e.timingOffsetMs, e.velocity])).toEqual(r2.events.map((e) => [e.timingOffsetMs, e.velocity]))
  })
  it('velocityJitter=0 keeps velocities', () => {
    const score: SymbolicScore = { ...baseScore, tracks: [ { ...baseScore.tracks[0], measures: [ { number: 1, events: [ { pitch: 'C4', dur: 'quarter', velocity: 80 }, { pitch: 'D4', dur: 'quarter', velocity: 70 }, { pitch: 'E4', dur: 'quarter', velocity: 60 }, { pitch: 'F4', dur: 'quarter', velocity: 50 } ] } ] } ] }
    const cfg: ArrangeConfig = { ...DEFAULT_ARRANGE, humanize: { enabled: true, timingJitterMs: 10, velocityJitter: 0, velocityCurve: 'linear' }, quantize: { ...DEFAULT_ARRANGE.quantize, enabled: false } }
    const r = humanizeAndQuantizeMIDI(score, cfg)
    const vels = r.events.map((e) => e.velocity)
    expect(vels).toEqual([80, 70, 60, 50])
  })
})


