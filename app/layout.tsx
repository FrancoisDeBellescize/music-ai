import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Music IA',
  description: 'Génération de MusicXML et import vers Flat.io',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}


