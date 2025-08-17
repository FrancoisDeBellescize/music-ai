import { Midi } from '@tonejs/midi'
import type { SymbolicScore, Track, PitchNote, RestNote, NoteDur } from '@/lib/composition/schema'
import type { ArrangeConfig } from '@/lib/arrange/types'
import { applyAccompaniment } from '@/lib/arrange/applyAccompaniment'
import type { TrackOverlay } from '@/lib/arrange/overlay'
import { humanizeAndQuantizeMIDI } from '@/lib/arrange/humanizeAndQuantizeMIDI'

const DUR_TO_DIV: Record<NoteDur, number> = { whole: 32, half: 16, quarter: 8, eighth: 4, '16th': 2, '32nd': 1 }

function applyDots(divs: number, dots?: number): number {
  if (!dots || dots <= 0) return divs
  let factor = 1
  let inc = 0.5
  for (let i = 0; i < dots; i += 1) {
    factor += inc
    inc /= 2
  }
  return Math.round(divs * factor)
}

function pitchToMidi(pitch: string): number {
  const m = pitch.match(/^([A-G])((#|b){0,2})(-?\d+)$/)
  if (!m) throw new Error(`Invalid pitch: ${pitch}`)
  const step = m[1]
  const acc = m[2] || ''
  const octave = parseInt(m[4], 10)
  const stepToSemis: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let semis = stepToSemis[step]
  if (acc === '#') semis += 1
  else if (acc === '##') semis += 2
  else if (acc === 'b') semis -= 1
  else if (acc === 'bb') semis -= 2
  return 12 * (octave + 1) + semis
}

const DRUM_MAP: Record<string, number> = {
  Kick: 36,
  Snare: 38,
  HiHat: 42,
  ClosedHiHat: 42,
  OpenHiHat: 46,
  Ride: 51,
  Tom: 45,
}

function percussionNameToMidi(name: string): number | undefined {
  return DRUM_MAP[name]
}

function guessProgram(trackName: string): number {
  const n = trackName.toLowerCase()
  if (n.includes('bass')) return 33
  if (n.includes('sax')) return 66
  if (n.includes('string')) return 48
  if (n.includes('pad')) return 89
  if (n.includes('piano') || n.includes('melody')) return 0
  return 0
}

export function symbolicToMIDI(score: SymbolicScore, arrange?: ArrangeConfig & { includeOverlaysInMIDI?: boolean }): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(score.meta.tempoBPM)

  const ppq = midi.header.ppq
  const divisionsPerQuarter = 8
  const divsToTicks = (divs: number) => Math.round((divs / divisionsPerQuarter) * ppq)
  const msToTicks = (ms: number) => Math.round((ms / 60000) * score.meta.tempoBPM * ppq)

  const accompanimentEnabled = !!arrange?.accompaniment?.enabled
  const includeOverlays = arrange?.includeOverlaysInMIDI !== false

  if (!arrange || (!arrange.quantize?.enabled && !arrange.humanize?.enabled && !accompanimentEnabled)) {
    // Legacy direct emit
    score.tracks.forEach((t: Track, idx: number) => {
      const tr = midi.addTrack()
      const channel = typeof t.midi?.channel === 'number' ? t.midi.channel : idx
      tr.channel = Math.max(0, Math.min(15, channel))
      const percussion = t.clef === 'percussion' || t.midi?.percussion === true || tr.channel === 9
      if (percussion) tr.channel = 9
      tr.instrument.number = t.midi?.program ?? guessProgram(t.name)

      let cursor = 0
      for (const m of t.measures) {
        for (const ev of m.events as Array<PitchNote | RestNote | PitchNote[]>) {
          if (Array.isArray(ev)) {
            const divs = applyDots(DUR_TO_DIV[ev[0].dur], ev[0].dots)
            const durationTicks = divsToTicks(divs)
            ev.forEach((pn) => {
              if (!percussion) {
                const midiNumber = pitchToMidi(pn.pitch)
                tr.addNote({ midi: midiNumber, ticks: cursor, durationTicks, velocity: (pn.velocity ?? 100) / 127 })
              } else {
                const drum = percussionNameToMidi(pn.pitch) ?? 36
                tr.addNote({ midi: drum, ticks: cursor, durationTicks, velocity: (pn.velocity ?? 100) / 127 })
              }
            })
            cursor += durationTicks
          } else if ((ev as RestNote).rest) {
            const r = ev as RestNote
            const divs = applyDots(DUR_TO_DIV[r.dur], r.dots)
            cursor += divsToTicks(divs)
          } else {
            const pn = ev as PitchNote
            const divs = applyDots(DUR_TO_DIV[pn.dur], pn.dots)
            const durationTicks = divsToTicks(divs)
            if (!percussion) {
              const midiNumber = pitchToMidi(pn.pitch)
              tr.addNote({ midi: midiNumber, ticks: cursor, durationTicks, velocity: (pn.velocity ?? 100) / 127 })
            } else {
              const drum = percussionNameToMidi(pn.pitch) ?? 36
              tr.addNote({ midi: drum, ticks: cursor, durationTicks, velocity: (pn.velocity ?? 100) / 127 })
            }
            cursor += durationTicks
          }
        }
      }
    })
    return midi.toArray()
  }

  // With arrange timing transforms and optional accompaniment
  const overlays: TrackOverlay[] = []
  if (accompanimentEnabled && includeOverlays) {
    const arranged = applyAccompaniment(score, arrange)
    overlays.push(...arranged.overlays)
  }

  // Prepare base tracks
  const timing = humanizeAndQuantizeMIDI(score, arrange)
  const tracksCount = score.tracks.length + overlays.length
  const trackObjs = Array.from({ length: tracksCount }, () => midi.addTrack())

  // Configure base tracks
  score.tracks.forEach((t: Track, idx: number) => {
    const tr = trackObjs[idx]
    const channel = typeof t.midi?.channel === 'number' ? t.midi.channel : idx
    tr.channel = Math.max(0, Math.min(15, channel))
    const percussion = t.clef === 'percussion' || t.midi?.percussion === true || tr.channel === 9
    if (percussion) tr.channel = 9
    tr.instrument.number = t.midi?.program ?? guessProgram(t.name)
  })

  // Add base events
  timing.events.forEach((e) => {
    const tr = trackObjs[e.trackIndex]
    const sourceTrack = score.tracks[e.trackIndex]
    const percussion = sourceTrack.clef === 'percussion' || sourceTrack.midi?.percussion === true || tr.channel === 9
    const baseTicks = divsToTicks(e.startDivs)
    const offsetTicks = msToTicks(e.timingOffsetMs ?? 0)
    const ticks = Math.max(0, baseTicks + offsetTicks)
    const durationTicks = divsToTicks(e.durDivs)
    if (!percussion) {
      const midiNumber = typeof e.pitch === 'string' ? pitchToMidi(e.pitch) : typeof e.pitch === 'number' ? e.pitch : 60
      tr.addNote({ midi: midiNumber, ticks, durationTicks, velocity: (e.velocity ?? 100) / 127 })
    } else {
      const midiNumber = typeof e.pitch === 'number' ? e.pitch : percussionNameToMidi(String(e.pitch)) ?? 36
      tr.addNote({ midi: midiNumber, ticks, durationTicks, velocity: (e.velocity ?? 100) / 127 })
    }
  })

  // Append overlay tracks if any
  overlays.forEach((ov, i) => {
    const trIdx = score.tracks.length + i
    const tr = trackObjs[trIdx]
    // Assign percussion if name suggests drums
    const isDrums = ov.trackName.toLowerCase().includes('drum')
    tr.channel = isDrums ? 9 : Math.min(15, trIdx)
    if (!isDrums) tr.instrument.number = guessProgram(ov.trackName)
    const percussion = isDrums || tr.channel === 9
    // Emit overlay events ordered by measure then by atDivs
    ov.measures.forEach((m) => {
      const events = [...m.events].sort((a, b) => a.atDivs - b.atDivs)
      events.forEach((ev) => {
        const ticks = Math.max(0, divsToTicks(ev.atDivs)) // safety clamp
        const durationTicks = divsToTicks(ev.durDivs)
        if (Array.isArray(ev.notes)) {
          ev.notes.forEach((pn) => {
            const velocity = (pn.velocity ?? 100) / 127
            if (!percussion) {
              const midiNumber = pitchToMidi(pn.pitch)
              tr.addNote({ midi: midiNumber, ticks, durationTicks, velocity })
            } else {
              const drum = percussionNameToMidi(pn.pitch) ?? 36
              tr.addNote({ midi: drum, ticks, durationTicks, velocity })
            }
          })
        } else if ((ev.notes as RestNote).rest) {
          // rest: advance is implicitly handled by ticks positioning
        }
      })
    })
  })

  return midi.toArray()
}


