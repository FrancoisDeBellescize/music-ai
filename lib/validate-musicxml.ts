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

// Adds XML declaration, version attribute and MusicXML 3.1 DOCTYPE if missing
export function normalizeMusicXML(xml: string): string | null {
  if (!xml) return null
  let out = xml.trim()
  // Strip leading BOM if present
  if (out.charCodeAt(0) === 0xfeff) out = out.slice(1)
  // Ensure it starts at the XML declaration
  const xmlDeclIdx = out.indexOf('<?xml')
  if (xmlDeclIdx > 0) out = out.slice(xmlDeclIdx)
  if (!out.startsWith('<?xml')) {
    out = `<?xml version="1.0" encoding="UTF-8"?>\n` + out
  } else {
    // Normalize encoding to UTF-8 if missing
    out = out.replace(/<\?xml\s+version=["']1\.0["'](\s+encoding=["'][^"']+["'])?\s*\?>/, '<?xml version="1.0" encoding="UTF-8"?>')
  }
  // Coerce common wrong root <musicxml> to <score-partwise>
  out = out.replace(/<musicxml(\s[^>]*)?>/i, '<score-partwise version="3.1">')
  out = out.replace(/<\/musicxml>/i, '</score-partwise>')
  // Remove wrong XHTML namespace if present
  out = out.replace(/\sxmlns=["']http:\/\/www\.w3\.org\/1999\/xhtml["']/i, '')
  // Fix non-standard <instrument> block under <score-part>
  out = out.replace(/<instrument(\s[^>]*)?>/gi, '<score-instrument$1>')
  out = out.replace(/<\/instrument>/gi, '</score-instrument>')
  // Remove unknown children often seen inside the non-standard block
  out = out.replace(/<percussion>[^<]*<\/percussion>/gi, '')
  out = out.replace(/<woodwind>[^<]*<\/woodwind>/gi, '')
  // If <part-list> contains <part-id>, replace with a proper <score-part>
  if (/<part-list>[\s\S]*?<part-id\b/i.test(out) && !/<score-part\b/i.test(out)) {
    const partIdMatch = out.match(/<part\s+id=["']([^"']+)["']/i)
    const partId = partIdMatch ? partIdMatch[1] : 'P1'
    const partNameMatch = out.match(/<credit-words>([\s\S]*?)<\/credit-words>/i)
    const partName = partNameMatch ? partNameMatch[1].trim() : partId
    const replacement =
      `<part-list>\n  <score-part id="${partId}">\n    <part-name>${partName}<\/part-name>\n    <score-instrument id="${partId}-I1">\n      <instrument-name>${partName}<\/instrument-name>\n    <\/score-instrument>\n  <\/score-part>\n<\/part-list>`
    out = out.replace(/<part-list>[\s\S]*?<\/part-list>/i, replacement)
  }
  // Remove all <tie> elements to avoid mismatched ties across notes
  out = out.replace(/<tie\b[^>]*\/>/gi, '')
  out = out.replace(/<tie\b[^>]*><\/tie>/gi, '')
  // Ensure <instrument-name> exists inside each <score-instrument>, using the parent <part-name>
  out = out.replace(/<score-part(\s[^>]*)?>([\s\S]*?)<\/score-part>/gi, (partMatch: string) => {
    const partNameMatch = partMatch.match(/<part-name>([\s\S]*?)<\/part-name>/i)
    const instrumentName = (partNameMatch ? partNameMatch[1].trim() : 'Instrument')
    return partMatch.replace(/<score-instrument(\s[^>]*)?>([\s\S]*?)<\/score-instrument>/gi, (instMatch: string) => {
      if (/<instrument-name>[\s\S]*?<\/instrument-name>/i.test(instMatch)) return instMatch
      return instMatch.replace(/<score-instrument(\s[^>]*)?>/i, (m: string) => `${m}<instrument-name>${instrumentName}<\/instrument-name>`)
    })
  })
  const lower = out.toLowerCase()
  const isPartwise = lower.includes('<score-partwise')
  const isTimewise = lower.includes('<score-timewise')
  if (!isPartwise && !isTimewise) return null
  // Add version attribute if missing on root element
  if (isPartwise) {
    out = out.replace(/<score-partwise(\s*[^>]*?)>/i, (m: string, attrs: string) => {
      return /\sversion=/.test(m) ? m : `<score-partwise version="3.1"${attrs}>`
    })
  } else if (isTimewise) {
    out = out.replace(/<score-timewise(\s*[^>]*?)>/i, (m: string, attrs: string) => {
      return /\sversion=/.test(m) ? m : `<score-timewise version="3.1"${attrs}>`
    })
  }
  // Ensure DOCTYPE is present and correct
  const hasDoctype = /<!DOCTYPE\s+score-(?:partwise|timewise)/i.test(out)
  if (!hasDoctype) {
    const doctype = isPartwise
      ? '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
      : '<!DOCTYPE score-timewise PUBLIC "-//Recordare//DTD MusicXML 3.1 Timewise//EN" "http://www.musicxml.org/dtds/timewise.dtd">'
    out = out.replace(/(<\?xml[^>]*>)/i, `$1\n${doctype}`)
  }
  // Final well-formedness check
  return XMLValidator.validate(out) === true ? out : null
}


