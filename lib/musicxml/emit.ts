import { create } from 'xmlbuilder2'
import type { SymbolicScore, NoteDur, Track, PitchNote, RestNote } from '@/lib/composition/schema'
import type { TrackOverlay } from '@/lib/arrange/overlay'

const CLEF_MAP: Record<'treble' | 'bass' | 'percussion', { sign: 'G' | 'F' | 'percussion'; line: number }> = {
  treble: { sign: 'G', line: 2 },
  bass: { sign: 'F', line: 4 },
  percussion: { sign: 'percussion', line: 2 },
}

const NOTE_TYPE_MAP: Record<NoteDur, string> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  '16th': '16th',
  '32nd': '32nd',
}

const DUR_TO_DIVISIONS: Record<NoteDur, number> = {
  whole: 32,
  half: 16,
  quarter: 8,
  eighth: 4,
  '16th': 2,
  '32nd': 1,
}

function applyDotsToDivisions(baseDivisions: number, dots: number | undefined): number {
  if (!dots || dots <= 0) return baseDivisions
  let factor = 1
  let inc = 0.5
  for (let i = 0; i < dots; i += 1) {
    factor += inc
    inc /= 2
  }
  return Math.round(baseDivisions * factor)
}

export function pitchToStepAlterOct(pitch: string): { step: string; alter?: number; octave: number } {
  const m = pitch.match(/^([A-G])((#|b){0,2})(-?\d+)$/)
  if (!m) throw new Error(`Invalid pitch: ${pitch}`)
  const step = m[1]
  const acc = m[2] || ''
  const octave = parseInt(m[4], 10)
  let alter: number | undefined
  if (acc === '#') alter = 1
  else if (acc === 'b') alter = -1
  else if (acc === '##') alter = 2
  else if (acc === 'bb') alter = -2
  return { step, alter, octave }
}

const KEY_TO_FIFTHS: Record<string, { fifths: number; mode: 'major' | 'minor' }> = {
  'C major': { fifths: 0, mode: 'major' },
  'G major': { fifths: 1, mode: 'major' },
  'D major': { fifths: 2, mode: 'major' },
  'A major': { fifths: 3, mode: 'major' },
  'E major': { fifths: 4, mode: 'major' },
  'B major': { fifths: 5, mode: 'major' },
  'F# major': { fifths: 6, mode: 'major' },
  'C# major': { fifths: 7, mode: 'major' },
  'F major': { fifths: -1, mode: 'major' },
  'Bb major': { fifths: -2, mode: 'major' },
  'Eb major': { fifths: -3, mode: 'major' },
  'Ab major': { fifths: -4, mode: 'major' },
  'Db major': { fifths: -5, mode: 'major' },
  'Gb major': { fifths: -6, mode: 'major' },
  'Cb major': { fifths: -7, mode: 'major' },
  'A minor': { fifths: 0, mode: 'minor' },
  'E minor': { fifths: 1, mode: 'minor' },
  'B minor': { fifths: 2, mode: 'minor' },
  'F# minor': { fifths: 3, mode: 'minor' },
  'C# minor': { fifths: 4, mode: 'minor' },
  'G# minor': { fifths: 5, mode: 'minor' },
  'D# minor': { fifths: 6, mode: 'minor' },
  'A# minor': { fifths: 7, mode: 'minor' },
  'D minor': { fifths: -1, mode: 'minor' },
  'G minor': { fifths: -2, mode: 'minor' },
  'C minor': { fifths: -3, mode: 'minor' },
  'F minor': { fifths: -4, mode: 'minor' },
  'Bb minor': { fifths: -5, mode: 'minor' },
  'Eb minor': { fifths: -6, mode: 'minor' },
  'Ab minor': { fifths: -7, mode: 'minor' },
}

export type EmitOptions = { overlays?: TrackOverlay[] }

export function divsForNote(dur: NoteDur, dots?: number): number {
  const base = DUR_TO_DIVISIONS[dur]
  if (!dots || dots <= 0) return base
  let factor = 1
  let inc = 0.5
  for (let i = 0; i < dots; i += 1) {
    factor += inc
    inc /= 2
  }
  return Math.round(base * factor)
}

export function durToType(dur: NoteDur): string {
  return NOTE_TYPE_MAP[dur]
}

export function symbolicToMusicXML(score: SymbolicScore, _options?: EmitOptions): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .dtd({ name: 'score-partwise', pubID: '-//Recordare//DTD MusicXML 3.1 Partwise//EN', sysID: 'http://www.musicxml.org/dtds/partwise.dtd' })
    .ele('score-partwise', { version: '3.1' })

  const partList = doc.ele('part-list')
  score.tracks.forEach((t: Track, idx: number) => {
    const partId = `P${idx + 1}`
    const sp = partList.ele('score-part', { id: partId })
    sp.ele('part-name').txt(t.name)
  })
  const overlayOffset = score.tracks.length
  const overlays = _options?.overlays ?? []
  overlays.forEach((ov, i) => {
    const partId = `P${overlayOffset + i + 1}`
    const sp = partList.ele('score-part', { id: partId })
    sp.ele('part-name').txt(ov.metadata?.pattern ? `${ov.trackName} (${ov.metadata.pattern})` : ov.trackName)
  })

  const [numStr, denStr] = score.meta.timeSignature.split('/')
  const beats = parseInt(numStr, 10)
  const beatType = parseInt(denStr, 10)

  const keyInfo = KEY_TO_FIFTHS[score.meta.key] || { fifths: 0, mode: 'major' as const }

  const divisions = 8

  score.tracks.forEach((track: Track, tIdx: number) => {
    const partId = `P${tIdx + 1}`
    const part = doc.ele('part', { id: partId })
    for (const measure of track.measures) {
      const meas = part.ele('measure', { number: String(measure.number) })
      if (measure.number === 1) {
        const attrs = meas.ele('attributes')
        attrs.ele('divisions').txt(String(divisions))
        const key = attrs.ele('key')
        key.ele('fifths').txt(String(keyInfo.fifths))
        key.ele('mode').txt(keyInfo.mode)
        const time = attrs.ele('time')
        time.ele('beats').txt(String(beats))
        time.ele('beat-type').txt(String(beatType))
        const clef = attrs.ele('clef')
        const clefInfo = CLEF_MAP[track.clef]
        clef.ele('sign').txt(clefInfo.sign)
        clef.ele('line').txt(String(clefInfo.line))
        const transpo = score.transpositions?.[track.name]
        if (transpo && (typeof transpo.chromatic === 'number' || typeof transpo.octaveChange === 'number')) {
          const tr = attrs.ele('transpose')
          if (typeof transpo.chromatic === 'number') tr.ele('chromatic').txt(String(transpo.chromatic))
          if (typeof transpo.octaveChange === 'number') tr.ele('octave-change').txt(String(transpo.octaveChange))
        }
      }

      // tempo
      meas.ele('sound', { tempo: String(score.meta.tempoBPM) })

      // harmony annotations
      if (Array.isArray(measure.harmony)) {
        for (const h of measure.harmony) {
          const harm = meas.ele('harmony')
          harm.ele('kind', { text: h.chord })
        }
      }

      for (const ev of measure.events as Array<PitchNote | RestNote | PitchNote[]>) {
        if (Array.isArray(ev)) {
          const durDiv = divsForNote(ev[0].dur, ev[0].dots)
          ev.forEach((pn, idx) => {
            const note = meas.ele('note')
            if (idx > 0) note.ele('chord')
            const { step, alter, octave } = pitchToStepAlterOct(pn.pitch)
            const pitch = note.ele('pitch')
            pitch.ele('step').txt(step)
            if (typeof alter === 'number') pitch.ele('alter').txt(String(alter))
            pitch.ele('octave').txt(String(octave))
            note.ele('duration').txt(String(durDiv))
            note.ele('type').txt(durToType(pn.dur))
            if (pn.dots && pn.dots > 0) for (let i = 0; i < pn.dots; i += 1) note.ele('dot')
            if (pn.tieStart) note.ele('tie', { type: 'start' })
            if (pn.tieStop) note.ele('tie', { type: 'stop' })
            if (pn.tieStart || pn.tieStop) {
              const not = note.ele('notations')
              if (pn.tieStart) not.ele('tied', { type: 'start' })
              if (pn.tieStop) not.ele('tied', { type: 'stop' })
            }
          })
        } else if ((ev as RestNote).rest) {
          const r = ev as RestNote
          const note = meas.ele('note')
          note.ele('rest')
          note.ele('duration').txt(String(divsForNote(r.dur, r.dots)))
          note.ele('type').txt(durToType(r.dur))
          if (r.dots && r.dots > 0) for (let i = 0; i < r.dots; i += 1) note.ele('dot')
        } else {
          const pn = ev as PitchNote
          const note = meas.ele('note')
          const { step, alter, octave } = pitchToStepAlterOct(pn.pitch)
          const pitch = note.ele('pitch')
          pitch.ele('step').txt(step)
          if (typeof alter === 'number') pitch.ele('alter').txt(String(alter))
          pitch.ele('octave').txt(String(octave))
          note.ele('duration').txt(String(divsForNote(pn.dur, pn.dots)))
          note.ele('type').txt(durToType(pn.dur))
          if (pn.dots && pn.dots > 0) for (let i = 0; i < pn.dots; i += 1) note.ele('dot')
          if (pn.tieStart) note.ele('tie', { type: 'start' })
          if (pn.tieStop) note.ele('tie', { type: 'stop' })
          if (pn.tieStart || pn.tieStop) {
            const not = note.ele('notations')
            if (pn.tieStart) not.ele('tied', { type: 'start' })
            if (pn.tieStop) not.ele('tied', { type: 'stop' })
          }
        }
      }
    }
  })

  // Overlays as additional parts
  overlays.forEach((ov, i) => {
    const partId = `P${overlayOffset + i + 1}`
    const part = doc.ele('part', { id: partId })
    // attributes on first measure
    const meas1 = part.ele('measure', { number: String(1) })
    const attrs = meas1.ele('attributes')
    attrs.ele('divisions').txt(String(divisions))
    const clef = attrs.ele('clef')
    clef.ele('sign').txt('G')
    clef.ele('line').txt(String(2))
    meas1.ele('sound', { tempo: String(score.meta.tempoBPM) })
    // emit overlay measures
    ov.measures.forEach((m) => {
      const meas = m.number === 1 ? meas1 : part.ele('measure', { number: String(m.number) })
      const sorted = [...m.events].sort((a, b) => a.atDivs - b.atDivs)
      sorted.forEach((ev) => {
        if (Array.isArray(ev.notes)) {
          ev.notes.forEach((pn, idx) => {
            const note = meas.ele('note')
            if (idx > 0) note.ele('chord')
            const { step, alter, octave } = pitchToStepAlterOct(pn.pitch)
            const pitch = note.ele('pitch')
            pitch.ele('step').txt(step)
            if (typeof alter === 'number') pitch.ele('alter').txt(String(alter))
            pitch.ele('octave').txt(String(octave))
            note.ele('duration').txt(String(ev.durDivs))
            note.ele('type').txt(durToType(pn.dur))
            if (pn.dots && pn.dots > 0) for (let i = 0; i < pn.dots; i += 1) note.ele('dot')
          })
        } else if ((ev.notes as RestNote).rest) {
          const note = meas.ele('note')
          note.ele('rest')
          note.ele('duration').txt(String(ev.durDivs))
          note.ele('type').txt('quarter')
        }
      })
    })
  })

  return doc.end({ prettyPrint: true })
}


