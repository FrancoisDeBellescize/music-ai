'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CodeBlock } from '@/components/code-block'
import { FlatEmbed } from '@/components/flat-embed'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

const generateSchema = z.object({
  prompt: z.string().min(1, 'Le prompt est obligatoire').max(2000),
  style: z.string().min(1),
  key: z.string().min(1),
  tempo: z.number().min(40).max(240),
  instrument: z.string().min(1),
})

type GenerateInput = z.infer<typeof generateSchema>

export default function HomePage() {
  const [form, setForm] = useState<GenerateInput>({
    prompt: '',
    style: 'Swing',
    key: 'C',
    tempo: 120,
    instrument: 'Piano',
  })
  const [xml, setXml] = useState<string>('')
  const [xmlBytes, setXmlBytes] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scoreId, setScoreId] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [connected, setConnected] = useState<boolean>(false)
  const [importUrl, setImportUrl] = useState<string | null>(null)
  const [importingLink, setImportingLink] = useState<boolean>(false)

  useEffect(() => {
    fetch('/api/flat/embed-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.connected) setConnected(true)
      })
      .catch(() => {})
  }, [])

  const onGenerate = useCallback(async () => {
    setError(null)
    const parsed = generateSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Entrée invalide')
      return
    }
    try {
      setLoading(true)
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      if (!res.ok) throw new Error('Échec génération')
      const data = await res.json()
      setXml(data.xml)
      setXmlBytes(data.bytes)
    } catch (e: any) {
      setError(e?.message || 'Erreur de génération')
    } finally {
      setLoading(false)
    }
  }, [form])

  const onReset = useCallback(() => {
    setForm({ prompt: '', style: 'Swing', key: 'C', tempo: 120, instrument: 'Piano' })
    setXml('')
    setXmlBytes(0)
    setScoreId(null)
    setShareUrl(null)
  }, [])

  const onImportFlat = useCallback(async () => {
    setError(null)
    if (!xml) return
    if (!connected) {
      window.location.href = '/api/flat/auth'
      return
    }
    try {
      const res = await fetch('/api/flat/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml }),
      })
      if (!res.ok) throw new Error('Import Flat échoué')
      const data = await res.json()
      setScoreId(data.scoreId)
      setShareUrl(data.shareUrl)
    } catch (e: any) {
      setError(e?.message || 'Erreur Flat')
    }
  }, [xml, connected])

  const onGenerateImportLink = useCallback(async () => {
    if (!xml) return
    try {
      setImportingLink(true)
      const res = await fetch('/api/flat/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml, title: form.prompt?.slice(0, 60) || 'Music IA Composition' }),
      })
      if (!res.ok) throw new Error('Génération du lien échouée')
      const data = await res.json()
      setImportUrl(data.importUrl)
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la génération du lien import')
    } finally {
      setImportingLink(false)
    }
  }, [xml, form.prompt])

  const onCopy = useCallback(async () => {
    if (!xml) return
    await navigator.clipboard.writeText(xml)
  }, [xml])

  const onDownload = useCallback(() => {
    if (!xml) return
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'composition.musicxml'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [xml])

  const keyOptions = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']
  const instruments = ['Piano', 'Tenor Sax', 'Alto Sax', 'Trumpet', 'Violin']
  const styles = ['Bebop', 'Swing', 'Ballad', 'Bossa', 'Funk', 'Classical']

  return (
    <div className="min-h-screen">
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-semibold">Music IA</div>
          <div className="flex items-center gap-3">
            {connected ? (
              <Badge>Flat connecté</Badge>
            ) : (
              <Button variant="outline" onClick={() => (window.location.href = '/api/flat/auth')}>Connecter Flat</Button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Définir la pièce</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt</label>
              <Textarea
                placeholder="Décrivez la pièce (style, tonalité, tempo, instrumentations, contraintes)"
                value={form.prompt}
                onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                rows={6}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Instrument</label>
                <Select value={form.instrument} onValueChange={(v) => setForm((f) => ({ ...f, instrument: v }))}>
                  <SelectTrigger><SelectValue placeholder="Instrument" /></SelectTrigger>
                  <SelectContent>
                    {instruments.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tonalité</label>
                <Select value={form.key} onValueChange={(v) => setForm((f) => ({ ...f, key: v }))}>
                  <SelectTrigger><SelectValue placeholder="Tonalité" /></SelectTrigger>
                  <SelectContent>
                    {keyOptions.map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tempo: {form.tempo} BPM</label>
              <Slider value={[form.tempo]} min={40} max={240} step={1} onValueChange={(v) => setForm((f) => ({ ...f, tempo: v[0] }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Style</label>
              <Select value={form.style} onValueChange={(v) => setForm((f) => ({ ...f, style: v }))}>
                <SelectTrigger><SelectValue placeholder="Style" /></SelectTrigger>
                <SelectContent>
                  {styles.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 flex-wrap">
                {styles.map((s) => (
                  <Badge key={s} variant={s === form.style ? 'default' : 'secondary'} onClick={() => setForm((f)=>({ ...f, style: s }))} className="cursor-pointer">{s}</Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={onGenerate} disabled={loading || !form.prompt}>
                {loading ? (
                  <span className="inline-flex items-center gap-2"><Spinner size={16} /> Génération…</span>
                ) : (
                  'Générer'
                )}
              </Button>
              <Button variant="secondary" onClick={onReset} disabled={loading}>Réinitialiser</Button>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>MusicXML</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs defaultValue="code">
              <TabsList>
                <TabsTrigger value="code">Code</TabsTrigger>
              </TabsList>
              <TabsContent value="code">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-[280px] w-full" />
                  </div>
                ) : (
                  <CodeBlock code={xml} language="xml" />
                )}
              </TabsContent>
            </Tabs>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onCopy} disabled={!xml || loading}>Copier</Button>
              <Button variant="outline" onClick={onDownload} disabled={!xml || loading}>Télécharger .musicxml</Button>
              {xml && <span className="text-xs text-muted-foreground">{xmlBytes} octets</span>}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Partition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {scoreId ? (
              <div className="space-y-2">
                <FlatEmbed scoreId={scoreId} />
                <div className="flex gap-2">
                  <Button asChild variant="outline"><a href={shareUrl ?? `https://flat.io/score/${scoreId}`} target="_blank" rel="noreferrer">Ouvrir dans Flat</a></Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Importez votre MusicXML vers Flat.io pour l’aperçu intégré.</p>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={onImportFlat} disabled={!xml || loading}>
                    {loading ? 'Veuillez patienter…' : 'Importer sur Flat'}
                  </Button>
                  <Button variant="outline" onClick={onGenerateImportLink} disabled={!xml || importingLink || loading}>
                    {importingLink ? (
                      <span className="inline-flex items-center gap-2"><Spinner size={16} /> Création du lien…</span>
                    ) : (
                      'Lien d’import Flat (sans connexion)'
                    )}
                  </Button>
                </div>
                {importUrl && (
                  <div className="text-sm">
                    <a className="text-primary underline" href={importUrl} target="_blank" rel="noreferrer">Ouvrir le lien d’import</a>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}


