import { describe, it, expect } from 'vitest'
import { applyAccompaniment } from '../applyAccompaniment'
import { DEFAULT_ARRANGE, type ArrangeConfig } from '../types'
import type { SymbolicScore } from '@/lib/composition/schema'

const score: SymbolicScore = {
  meta: { title: 'T', style: 'jazz', tempoBPM: 140, timeSignature: '4/4', key: 'C major' },
  tracks: [
    { name: 'melody', clef: 'treble', measures: [ { number: 1, events: [ { pitch: 'C4', dur: 'quarter' }, { pitch: 'E4', dur: 'quarter' }, { pitch: 'G4', dur: 'quarter' }, { pitch: 'B4', dur: 'quarter' } ], harmony: [ { beat: 1, chord: 'C7' } ] } ] },
  ],
}

describe('Accompaniment jazz-swing', () => {
  it('generates walking bass overlays with 4 quarters per measure', () => {
    const cfg: ArrangeConfig = { ...DEFAULT_ARRANGE, accompaniment: { enabled: true, style: 'jazz-swing', density: 0.5, complexity: 0.5 }, humanize: { ...DEFAULT_ARRANGE.humanize, enabled: false }, quantize: { ...DEFAULT_ARRANGE.quantize, enabled: false } }
    const res = applyAccompaniment(score, cfg)
    const bass = res.overlays.find((o) => o.trackName.includes('bass'))
    expect(bass).toBeTruthy()
    const m1 = bass!.measures.find((m) => m.number === 1)!
    expect(m1.events.length).toBeGreaterThanOrEqual(4)
  })
})


