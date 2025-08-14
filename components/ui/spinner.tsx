import * as React from 'react'

export function Spinner({ size = 16 }: { size?: number }) {
  const s = `${size}px`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      className="animate-spin text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
      <path d="M22 12a10 10 0 0 1-10 10" opacity="0.75"></path>
    </svg>
  )
}


