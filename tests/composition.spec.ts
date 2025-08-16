import { describe, expect, it } from 'vitest'
import { durToDiv, dotted, measureTargetDivs, sumMeasureEventsDivs } from '../lib/composition/schema'

describe('durations mapping', () => {
  it('maps base durations to divisions', () => {
    expect(durToDiv('quarter')).toBe(8)
    expect(durToDiv('eighth')).toBe(4)
    expect(durToDiv('half')).toBe(16)
  })

  it('applies dots', () => {
    expect(dotted(8, 1)).toBe(12) // dotted quarter: 8 * 1.5
    expect(dotted(8, 2)).toBe(14) // 8 * 1.75 = 14
  })
})

describe('meter sums', () => {
  it('sums measure with events (including chords counted once)', () => {
    const events = [
      { dur: 'quarter' as const },
      [{ dur: 'quarter' as const }, { dur: 'quarter' as const }],
      { dur: 'half' as const },
    ] as any
    expect(sumMeasureEventsDivs(events)).toBe(8 + 8 + 16)
  })

  it('expected divisions for 4/4', () => {
    expect(measureTargetDivs('4/4')).toBe(32)
  })

  it('expected divisions for 3/4', () => {
    expect(measureTargetDivs('3/4')).toBe(24)
  })
})


