import { XMLValidator } from 'fast-xml-parser'

export function isLikelyMusicXML(xml: string): boolean {
  if (!xml) return false
  if (!xml.trim().startsWith('<?xml')) return false
  const lc = xml.toLowerCase()
  if (!(lc.includes('<score-partwise') || lc.includes('<score-timewise'))) return false
  if (Buffer.byteLength(xml, 'utf8') > 1024 * 1024 * 2) return false // 2 MB cap
  return XMLValidator.validate(xml) === true
}

// Attempts to extract a valid MusicXML document from a response that may contain extra text
export function tryExtractMusicXML(text: string): string | null {
  if (!text) return null
  let cleaned = text.trim()
  // Remove markdown fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '')
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3)
    }
  }
  const start = cleaned.indexOf('<?xml')
  if (start === -1) return null
  cleaned = cleaned.slice(start)
  // Heuristic: cut after the closing root tag if found
  const lower = cleaned.toLowerCase()
  const closingPartwise = lower.lastIndexOf('</score-partwise>')
  const closingTimewise = lower.lastIndexOf('</score-timewise>')
  const endIdx = Math.max(closingPartwise, closingTimewise)
  const candidate = endIdx !== -1 ? cleaned.slice(0, endIdx + '</score-partwise>'.length) : cleaned
  return XMLValidator.validate(candidate) === true ? candidate : null
}


