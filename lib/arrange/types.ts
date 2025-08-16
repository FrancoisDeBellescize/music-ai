export type RNG = (min: number, max: number) => number

export type QuantizeConfig = {
  enabled: boolean
  grid: '1/4' | '1/8' | '1/16' | '1/32'
  strength: number
  swing?: {
    enabled: boolean
    ratio: number
    applyTo: Array<'melody' | 'chords' | 'bass' | 'drums' | '*'>
  }
}

export type HumanizeConfig = {
  enabled: boolean
  timingJitterMs: number
  velocityJitter: number
  velocityCurve?: 'linear' | 'soft' | 'hard'
}

export type AccompanimentStyle = 'jazz-swing' | 'pop-rock' | 'bossa' | 'ballad' | 'latin' | 'none'

export type AccompanimentConfig = {
  enabled: boolean
  style: AccompanimentStyle
  sourceTracks?: string[]
  targetTracks?: string[]
  density?: number
  complexity?: number
}

export type ArrangeConfig = {
  seed?: number
  quantize: QuantizeConfig
  humanize: HumanizeConfig
  accompaniment: AccompanimentConfig
}

export const DEFAULT_ARRANGE: ArrangeConfig = {
  seed: 1337,
  quantize: { enabled: true, grid: '1/8', strength: 0.7, swing: { enabled: false, ratio: 0.66, applyTo: ['*'] } },
  humanize: { enabled: true, timingJitterMs: 12, velocityJitter: 0.12, velocityCurve: 'soft' },
  accompaniment: { enabled: false, style: 'none', density: 0.5, complexity: 0.5 },
}


