import type { ArrangeConfig } from './types'
import { GRID_TO_DIVS, applySwingOffset, lerp } from './timing'
import type { SymbolicScore, NoteDur } from '@/lib/composition/schema'

export type MidiTimingEvent = {
  trackIndex: number
  measureNumber: number
  startDivs: number
  durDivs: number
  velocity?: number
  pitch?: string | number
  timingOffsetMs?: number
}

export type MidiTimingResult = {
  events: MidiTimingEvent[]
  annotations: Record<string, any>
}

export function humanizeAndQuantizeMIDI(score: SymbolicScore, cfg: ArrangeConfig): MidiTimingResult {
  const gridDivs = GRID_TO_DIVS[cfg.quantize.grid]
  const swingActive = !!cfg.quantize.swing?.enabled
  const swingRatio = cfg.quantize.swing?.ratio ?? 0.5

  let seed = (cfg.seed ?? 1337) >>> 0
  const rng = (min: number, max: number) => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0
    const u = (seed % 1_000_000) / 1_000_000
    return min + (max - min) * u
  }

  const out: MidiTimingEvent[] = []
  const annotations: any = { gridDivs, swingActive, swingRatio, seed: cfg.seed ?? 1337 }

  score.tracks.forEach((t, ti) => {
    t.measures.forEach((m) => {
      let cursorDivs = 0
      const events: any[] = (m as any).events ?? (m as any).notes
      events.forEach((ev: any) => {
        const isChord = Array.isArray(ev)
        const elemArr = isChord ? ev : [ev]
        const baseDivs = (() => {
          const MAP: { [k in NoteDur]: number } = { whole: 32, half: 16, quarter: 8, eighth: 4, '16th': 2, '32nd': 1 }
          const dots = ev.dots ?? 0
          const d = MAP[ev.dur as NoteDur]
          return Math.round(d * (dots === 0 ? 1 : dots === 1 ? 1.5 : 1.75))
        })()

        let start = cursorDivs

        if (cfg.quantize.enabled) {
          const snapped = Math.round(start / gridDivs) * gridDivs
          start = Math.round(lerp(start, snapped, cfg.quantize.strength))
        }

        if (swingActive && (gridDivs === 4 || gridDivs === 2)) {
          start += applySwingOffset(Math.floor(start), gridDivs, swingRatio)
        }

        let timingOffsetMs = 0
        if (cfg.humanize.enabled && cfg.humanize.timingJitterMs > 0) {
          timingOffsetMs = Math.round(rng(-cfg.humanize.timingJitterMs, cfg.humanize.timingJitterMs))
        }

        elemArr.forEach((n: any) => {
          const velBase = typeof n.velocity === 'number' ? n.velocity : 96
          let vel = velBase
          if (cfg.humanize.enabled && cfg.humanize.velocityJitter > 0) {
            const delta = rng(-1, 1) * 127 * cfg.humanize.velocityJitter
            vel = Math.max(1, Math.min(127, Math.round(velBase + delta)))
          }
          if (cfg.humanize.velocityCurve) {
            const p = vel / 127
            const mapped = cfg.humanize.velocityCurve === 'soft' ? Math.pow(p, 0.7) : cfg.humanize.velocityCurve === 'hard' ? Math.pow(p, 1.4) : p
            vel = Math.max(1, Math.min(127, Math.round(mapped * 127)))
          }
          out.push({
            trackIndex: ti,
            measureNumber: m.number,
            startDivs: start,
            durDivs: baseDivs,
            velocity: vel,
            pitch: n.pitch,
            timingOffsetMs,
          })
        })

        cursorDivs += baseDivs
      })
    })
  })

  return { events: out, annotations }
}


