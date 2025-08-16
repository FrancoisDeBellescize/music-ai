import type { SymbolicScore } from '@/lib/composition/schema'
import type { ArrangeConfig } from './types'
import { cloneScore, type ArrangedResult } from './overlay'
import { genJazzSwing, genPopRock, genBossa } from './patterns'

export function applyAccompaniment(score: SymbolicScore, cfg: ArrangeConfig): ArrangedResult {
  const base = cloneScore(score)
  let seed = (cfg.seed ?? 2024) >>> 0
  const rng = (min: number, max: number) => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0
    const u = (seed % 1_000_000) / 1_000_000
    return min + (max - min) * u
  }

  const harmonyByMeasure: Record<number, { beat: number; chord: string }[]> = {}
  base.tracks.forEach((t) =>
    t.measures.forEach((m) => {
      ;(m.harmony ?? []).forEach((h) => {
        harmonyByMeasure[m.number] ??= []
        harmonyByMeasure[m.number].push(h)
      })
    })
  )

  const ctx = {
    tempoBPM: base.meta.tempoBPM,
    timeSignature: base.meta.timeSignature,
    key: base.meta.key,
    harmonyByMeasure,
    divisions: 8,
    rng,
    density: cfg.accompaniment.density ?? 0.5,
    complexity: cfg.accompaniment.complexity ?? 0.5,
  }

  let overlays: any[] = []
  switch (cfg.accompaniment.style) {
    case 'jazz-swing':
      overlays = Object.values(genJazzSwing(ctx)).filter(Boolean) as any
      break
    case 'pop-rock':
      overlays = Object.values(genPopRock(ctx)).filter(Boolean) as any
      break
    case 'bossa':
      overlays = Object.values(genBossa(ctx)).filter(Boolean) as any
      break
    case 'ballad':
    case 'latin':
    default:
      overlays = Object.values(genPopRock(ctx)).filter(Boolean) as any
      break
  }

  return { base, overlays, annotations: { accompaniment: cfg.accompaniment, seed: cfg.seed ?? 2024 } }
}


