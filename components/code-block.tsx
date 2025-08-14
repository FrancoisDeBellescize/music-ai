import * as React from 'react'

type Props = { code: string; language?: string }

export function CodeBlock({ code, language = 'text' }: Props) {
  return (
    <div className="relative">
      <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/30 p-3 text-sm">
        <code className={`language-${language}`}>{code || '—'}</code>
      </pre>
    </div>
  )
}


