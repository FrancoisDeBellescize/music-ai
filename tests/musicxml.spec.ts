import { describe, expect, it } from 'vitest'
import { symbolicToMusicXML } from '../lib/musicxml/emit'
import type { SymbolicScore } from '../lib/composition/schema'

describe('MusicXML serialization', () => {
  it('emits minimal valid multi-track structure with events', () => {
    const score: SymbolicScore = {
      meta: { title: 'T', style: 'jazz', tempoBPM: 120, timeSignature: '4/4', key: 'C major' },
      tracks: [
        {
          name: 'melody',
          clef: 'treble',
          measures: [
            { number: 1, events: [{ pitch: 'C4', dur: 'whole' }] },
          ],
        },
        {
          name: 'chords',
          clef: 'treble',
          measures: [
            { number: 1, events: [[{ pitch: 'C4', dur: 'whole' }, { pitch: 'E4', dur: 'whole' }]] },
          ],
        },
      ],
    } as any

    const xml = symbolicToMusicXML(score)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<!DOCTYPE score-partwise')
    expect(xml).toContain('<score-partwise')
    expect(xml).toContain('<part-list>')
    expect(xml).toContain('<part id="P1">')
    expect(xml).toContain('<part id="P2">')
    expect(xml).toContain('<measure number="1">')
    expect(xml).toContain('<attributes>')
    expect(xml).toContain('<divisions>8</divisions>')
    expect(xml).toContain('<duration>32</duration>')
    expect(xml).toContain('<chord/>')
  })
})


