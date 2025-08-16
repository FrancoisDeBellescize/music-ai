"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Midi } from '@tonejs/midi'
import { Info } from 'lucide-react'

type FormState = {
  title: string
  style: 'jazz' | 'classique' | 'pop' | 'rock' | 'blues'
  tempoBPM: number
  timeSignature: string
  key: string
  measures: number
  userPrompt: string
  instrumentation: Array<'melody' | 'chords' | 'bass' | 'drums' | 'pad' | 'strings'>
  arrange: {
    seed: number
    quantize: { enabled: boolean; grid: '1/4' | '1/8' | '1/16' | '1/32'; strength: number; swing: { enabled: boolean; ratio: number } }
    humanize: { enabled: boolean; timingJitterMs: number; velocityJitter: number; velocityCurve: 'linear' | 'soft' | 'hard' }
    accompaniment: { enabled: boolean; style: 'jazz-swing' | 'pop-rock' | 'bossa' | 'ballad' | 'latin' | 'none'; density: number; complexity: number }
  }
  includeOverlaysInMusicXML: boolean
  includeOverlaysInMIDI: boolean
}

const PRESET: FormState = {
  title: 'Préréglage Jazz Swing',
  style: 'jazz',
  tempoBPM: 140,
  timeSignature: '4/4',
  key: 'F# major',
  measures: 12,
  userPrompt: 'Feeling swing, motif bebop simple, développement motivique.',
  instrumentation: ['melody', 'chords', 'bass', 'drums'],
  arrange: {
    seed: 1337,
    quantize: { enabled: true, grid: '1/8', strength: 0.7, swing: { enabled: false, ratio: 0.66 } },
    humanize: { enabled: true, timingJitterMs: 12, velocityJitter: 0.12, velocityCurve: 'soft' },
    accompaniment: { enabled: false, style: 'none', density: 0.5, complexity: 0.5 },
  },
  includeOverlaysInMusicXML: false,
  includeOverlaysInMIDI: true,
}

export default function ComposePage() {
  const [form, setForm] = useState<FormState>(PRESET)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [musicxml, setMusicxml] = useState<string | null>(null)
  const [midiB64, setMidiB64] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const osmdRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || !musicxml) return
    let cancelled = false
    ;(async () => {
      const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current!, { autoResize: true })
      }
      await osmdRef.current.load(musicxml)
      if (!cancelled) await osmdRef.current.render()
    })()
    return () => {
      cancelled = true
    }
  }, [musicxml])

  const onSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = {
        title: form.title,
        style: form.style,
        tempoBPM: form.tempoBPM,
        timeSignature: form.timeSignature,
        key: form.key,
        length: { measures: form.measures },
        instrumentation: form.instrumentation,
        userPrompt: form.userPrompt,
        arrange: form.arrange,
        includeOverlaysInMusicXML: form.includeOverlaysInMusicXML,
        includeOverlaysInMIDI: form.includeOverlaysInMIDI,
      }
      const res = await fetch('/api/compose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur API')
      setMusicxml(data.musicxml)
      setMidiB64(data.midiB64)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const onListen = async () => {
    if (!midiB64) return
    const midi = new Midi(Buffer.from(midiB64, 'base64'))

    try {
      const toneMod: any = await import('tone')
      const startFn: any = toneMod.start || toneMod.default?.start
      if (typeof startFn === 'function') {
        await startFn()
      }
      const PolySynthCtor: any = toneMod.PolySynth || toneMod.default?.PolySynth
      const SynthCtor: any = toneMod.Synth || toneMod.default?.Synth
      const nowFn: any = toneMod.now || toneMod.default?.now
      if (PolySynthCtor && SynthCtor && typeof nowFn === 'function') {
        const synth = new PolySynthCtor(SynthCtor).toDestination()
        const base = nowFn()
        midi.tracks.forEach((track) => {
          track.notes.forEach((n) => {
            synth.triggerAttackRelease(n.name, n.duration, base + n.time, n.velocity ?? 0.8)
          })
        })
        return
      }
      // if named exports absent, try default namespace style
      const Tone: any = toneMod.default ?? toneMod
      if (Tone && Tone.PolySynth && Tone.Synth && typeof Tone.now === 'function') {
        const synth = new Tone.PolySynth(Tone.Synth).toDestination()
        const base = Tone.now()
        midi.tracks.forEach((track) => {
          track.notes.forEach((n) => {
            synth.triggerAttackRelease(n.name, n.duration, base + n.time, n.velocity ?? 0.8)
          })
        })
        return
      }
      throw new Error('Tone API unavailable')
    } catch {
      // Fallback: WebAudio simple playback
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      const startAt = ctx.currentTime + 0.1
      const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
      midi.tracks.forEach((track) => {
        track.notes.forEach((n) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = midiToFreq(n.midi)
          const t0 = startAt + n.time
          const t1 = t0 + n.duration
          gain.gain.setValueAtTime(0, t0)
          gain.gain.linearRampToValueAtTime((n.velocity ?? 0.8) * 0.2, t0 + 0.01)
          gain.gain.setValueAtTime((n.velocity ?? 0.8) * 0.2, t1 - 0.03)
          gain.gain.linearRampToValueAtTime(0, t1)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(t0)
          osc.stop(t1)
        })
      })
    }
  }

  const downloadText = (dataStr: string, mime: string, filename: string) => {
    const blob = new Blob([dataStr], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const base64ToUint8Array = (b64: string) => {
    const binaryString = atob(b64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i += 1) bytes[i] = binaryString.charCodeAt(i)
    return bytes
  }

  const downloadBytes = (bytes: Uint8Array, mime: string, filename: string) => {
    const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const blob = new Blob([arrayBuf], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Composer</h1>
      <div className="grid grid-cols-1 gap-3">
        <label className="grid gap-1">
          <span className="text-sm">Titre</span>
          <input className="border rounded px-2 py-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Style musical</span>
          <select className="border rounded px-2 py-1" value={form.style} onChange={(e) => setForm((f) => ({ ...f, style: e.target.value as any }))}>
            <option value="jazz">jazz</option>
            <option value="classique">classique</option>
            <option value="pop">pop</option>
            <option value="rock">rock</option>
            <option value="blues">blues</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Tempo : {form.tempoBPM} BPM</span>
          <Slider value={[form.tempoBPM]} min={40} max={240} step={1} onValueChange={([v]) => setForm((f) => ({ ...f, tempoBPM: v }))} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Mesure (ex : 4/4)</span>
          <input className="border rounded px-2 py-1" value={form.timeSignature} onChange={(e) => setForm((f) => ({ ...f, timeSignature: e.target.value }))} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Tonalité (ex : F# major)</span>
          <input className="border rounded px-2 py-1" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Nombre de mesures</span>
          <input type="number" min={1} max={64} className="border rounded px-2 py-1" value={form.measures} onChange={(e) => setForm((f) => ({ ...f, measures: Number(e.target.value) }))} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Prompt</span>
          <textarea className="border rounded px-2 py-1" value={form.userPrompt} onChange={(e) => setForm((f) => ({ ...f, userPrompt: e.target.value }))} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Instrumentation</span>
          <div className="flex flex-wrap gap-2">
            {(['melody','chords','bass','drums','pad','strings'] as const).map((name) => (
              <label key={name} className="flex items-center gap-2 border rounded px-2 py-1">
                <input
                  type="checkbox"
                  checked={form.instrumentation.includes(name)}
                  onChange={(e) => setForm((f) => {
                    const set = new Set(f.instrumentation)
                    if (e.target.checked) set.add(name)
                    else set.delete(name)
                    return { ...f, instrumentation: Array.from(set) as any }
                  })}
                />
                <span className="text-sm">{{ melody: 'mélodie', chords: 'accords', bass: 'basse', drums: 'batterie', pad: 'pad', strings: 'cordes' }[name]}</span>
              </label>
            ))}
          </div>
        </label>
        <div className="flex gap-2">
          <Button onClick={onSubmit} disabled={loading}>{loading ? 'Génération…' : 'Générer'}</Button>
          <Button variant="secondary" onClick={onListen} disabled={!midiB64}>Écouter</Button>
          <Button variant="outline" onClick={() => musicxml && downloadText(musicxml, 'application/vnd.recordare.musicxml+xml', 'composition.musicxml')} disabled={!musicxml}>Télécharger MusicXML</Button>
          <Button variant="outline" onClick={() => midiB64 && downloadBytes(base64ToUint8Array(midiB64), 'audio/midi', 'composition.mid')} disabled={!midiB64}>Télécharger MIDI</Button>
        </div>
        <div className="border rounded p-3 space-y-3">
          <div className="font-medium">Nuance & Arrangement</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.arrange.quantize.enabled} onChange={(e) => setForm((f) => ({ ...f, arrange: { ...f.arrange, quantize: { ...f.arrange.quantize, enabled: e.target.checked } } }))} />
              <span className="text-sm">Quantification</span>
              <span title="Aligne les notes vers une grille rythmique tout en conservant l’intention originale."><Info size={14} className="text-gray-500" /></span>
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Grille <span title="Résolution de la grille de quantification (noire, croche, double-croche…)." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <select className="border rounded px-2 py-1" value={form.arrange.quantize.grid} onChange={(e) => setForm((f) => ({ ...f, arrange: { ...f.arrange, quantize: { ...f.arrange.quantize, grid: e.target.value as any } } }))}>
                {(['1/4','1/8','1/16','1/32'] as const).map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Force {form.arrange.quantize.strength.toFixed(2)} <span title="Quantité d’attraction vers la grille (0 = inchangé, 1 = sur la grille)." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <Slider value={[form.arrange.quantize.strength]} min={0} max={1} step={0.01} onValueChange={([v]) => setForm((f) => ({ ...f, arrange: { ...f.arrange, quantize: { ...f.arrange.quantize, strength: v } } }))} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.arrange.quantize.swing.enabled} onChange={(e) => setForm((f) => ({ ...f, arrange: { ...f.arrange, quantize: { ...f.arrange.quantize, swing: { ...f.arrange.quantize.swing, enabled: e.target.checked } } } }))} />
              <span className="text-sm">Swing</span>
              <span title="Décale les croches paires pour créer un feeling swing (shuffle)."><Info size={14} className="text-gray-500" /></span>
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Ratio de swing {form.arrange.quantize.swing.ratio.toFixed(2)} <span title="0,5 = binaire, ~0,66 = swing standard, 0,75 = très marqué." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <Slider value={[form.arrange.quantize.swing.ratio]} min={0.55} max={0.75} step={0.01} onValueChange={([v]) => setForm((f) => ({ ...f, arrange: { ...f.arrange, quantize: { ...f.arrange.quantize, swing: { ...f.arrange.quantize.swing, ratio: v } } } }))} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.arrange.humanize.enabled} onChange={(e) => setForm((f) => ({ ...f, arrange: { ...f.arrange, humanize: { ...f.arrange.humanize, enabled: e.target.checked } } }))} />
              <span className="text-sm">Humanisation</span>
              <span title="Ajoute de micro-variations de timing et de vélocité pour un rendu plus naturel."><Info size={14} className="text-gray-500" /></span>
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Jitter temporel (ms): {form.arrange.humanize.timingJitterMs} <span title="Amplitude maximale de décalage (± ms) sur l’attaque des notes." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <Slider value={[form.arrange.humanize.timingJitterMs]} min={0} max={25} step={1} onValueChange={([v]) => setForm((f) => ({ ...f, arrange: { ...f.arrange, humanize: { ...f.arrange.humanize, timingJitterMs: v } } }))} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Variabilité de vélocité: {form.arrange.humanize.velocityJitter.toFixed(2)} <span title="Variation aléatoire relative de la vélocité (0–0,3 conseillé)." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <Slider value={[form.arrange.humanize.velocityJitter]} min={0} max={0.3} step={0.01} onValueChange={([v]) => setForm((f) => ({ ...f, arrange: { ...f.arrange, humanize: { ...f.arrange.humanize, velocityJitter: v } } }))} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Courbe de vélocité <span title="Remappe globalement la vélocité (linéaire, doux, dur)." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <select className="border rounded px-2 py-1" value={form.arrange.humanize.velocityCurve} onChange={(e) => setForm((f) => ({ ...f, arrange: { ...f.arrange, humanize: { ...f.arrange.humanize, velocityCurve: e.target.value as any } } }))}>
                {(['linear','soft','hard'] as const).map((v) => <option key={v} value={v}>{{ linear: 'linéaire', soft: 'doux', hard: 'dur' }[v]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.arrange.accompaniment.enabled} onChange={(e) => setForm((f) => ({ ...f, arrange: { ...f.arrange, accompaniment: { ...f.arrange.accompaniment, enabled: e.target.checked } } }))} />
              <span className="text-sm">Accompagnement</span>
              <span title="Génère des pistes d’accompagnement non destructives (basse, accords, batterie)."><Info size={14} className="text-gray-500" /></span>
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Style d’accompagnement <span title="Sélectionne le type de pattern (jazz-swing, pop-rock, bossa, …)." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <select className="border rounded px-2 py-1" value={form.arrange.accompaniment.style} onChange={(e) => setForm((f) => ({ ...f, arrange: { ...f.arrange, accompaniment: { ...f.arrange.accompaniment, style: e.target.value as any } } }))}>
                {(['jazz-swing','pop-rock','bossa','ballad','latin','none'] as const).map((v) => <option key={v} value={v}>{{ 'jazz-swing': 'jazz-swing', 'pop-rock': 'pop-rock', bossa: 'bossa', ballad: 'ballade', latin: 'latin', none: 'aucun' }[v]}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Densité {form.arrange.accompaniment.density.toFixed(2)} <span title="Fréquence des frappes/notes générées (rareté → richesse)." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <Slider value={[form.arrange.accompaniment.density]} min={0} max={1} step={0.01} onValueChange={([v]) => setForm((f) => ({ ...f, arrange: { ...f.arrange, accompaniment: { ...f.arrange.accompaniment, density: v } } }))} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Complexité {form.arrange.accompaniment.complexity.toFixed(2)} <span title="Richesse harmonique/rythmique (extensions, syncopes…)." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <Slider value={[form.arrange.accompaniment.complexity]} min={0} max={1} step={0.01} onValueChange={([v]) => setForm((f) => ({ ...f, arrange: { ...f.arrange, accompaniment: { ...f.arrange.accompaniment, complexity: v } } }))} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Graine (seed): {form.arrange.seed} <span title="Rend les résultats déterministes pour une même graine." className="inline-block align-middle ml-1"><Info size={14} className="text-gray-500" /></span></span>
              <input className="border rounded px-2 py-1" type="number" value={form.arrange.seed} onChange={(e) => setForm((f) => ({ ...f, arrange: { ...f.arrange, seed: Number(e.target.value) } }))} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.includeOverlaysInMusicXML} onChange={(e) => setForm((f) => ({ ...f, includeOverlaysInMusicXML: e.target.checked }))} />
              <span className="text-sm">Inclure l’accompagnement dans MusicXML</span>
              <span title="Ajoute les pistes générées comme nouvelles parts au moment de l’export MusicXML."><Info size={14} className="text-gray-500" /></span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.includeOverlaysInMIDI} onChange={(e) => setForm((f) => ({ ...f, includeOverlaysInMIDI: e.target.checked }))} />
              <span className="text-sm">Inclure l’accompagnement dans le MIDI</span>
              <span title="Ajoute les pistes générées dans le fichier MIDI en plus des pistes originales."><Info size={14} className="text-gray-500" /></span>
            </label>
          </div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>

      <div className="border rounded p-2">
        <div ref={containerRef} />
      </div>
    </div>
  )
}


