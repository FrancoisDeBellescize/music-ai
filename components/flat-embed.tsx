'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'

declare global {
  interface Window {
    Flat?: any
  }
}

type Props = { scoreId: string }

export function FlatEmbed({ scoreId }: Props) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function ensureScript() {
      if (typeof window === 'undefined') return
      if (window.Flat) return
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://prod.flat-cdn.com/embed-js/v1.5.0/embed.min.js'
        s.async = true
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('Flat embed load error'))
        document.head.appendChild(s)
      })
    }
    ensureScript()
      .then(() => {
        if (cancelled) return
        setReady(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const embedInstance = React.useRef<any>(null)

  React.useEffect(() => {
    if (!ready || !ref.current || !window.Flat) return
    const embed = new window.Flat.Embed(ref.current, {
      score: scoreId,
      controlsPosition: 'bottom',
      appId: 'public',
    })
    embedInstance.current = embed
    return () => {
      embedInstance.current = null
      embed?.destroy?.()
    }
  }, [ready, scoreId])

  return (
    <div className="space-y-2">
      <div ref={ref} className="w-full aspect-video rounded-md border" />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => embedInstance.current?.play?.()}>Play</Button>
        <Button variant="outline" onClick={() => embedInstance.current?.pause?.()}>Pause</Button>
      </div>
    </div>
  )
}


