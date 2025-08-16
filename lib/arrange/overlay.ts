import type { SymbolicScore, PitchNote, RestNote } from '@/lib/composition/schema'

export type OverlayEvent = {
  atDivs: number
  durDivs: number
  notes: PitchNote[] | RestNote
  voice?: number
}

export type TrackOverlay = {
  trackName: string
  measures: Array<{ number: number; events: OverlayEvent[] }>
  metadata?: Record<string, any>
}

export type ArrangedResult = {
  base: SymbolicScore
  overlays: TrackOverlay[]
  annotations: Record<string, any>
}

export function cloneScore(score: SymbolicScore): SymbolicScore {
  return JSON.parse(JSON.stringify(score)) as SymbolicScore
}


