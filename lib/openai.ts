import OpenAI from 'openai'

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({ apiKey })
}

export const SYSTEM_PROMPT = `Tu dois produire UNIQUEMENT un document MusicXML 3.1 valide (score-partwise). Aucune explication, aucun code block, aucun texte hors XML.

Exigences minimales:
- En-tête exact:
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
- Racine: <score-partwise version="3.1"> … </score-partwise>
- <part-list> cohérente avec chaque <part id="..."> (ids alignés).
- Inclure <identification> (au moins <creator>) et au moins un <credit> (titre).
- Mesures bien formées: durées qui complètent la métrique; éviter des <tie> orphelins.
- Si un tempo est donné: placer <sound tempo="..."> et un <direction> avec métronome dans la première mesure.

Interdit: balises markdown, texte libre, namespaces HTML/XHTML.`

export const MODEL_ID = process.env.OPENAI_MODEL || 'gpt-5'
export const FALLBACK_MODEL_ID = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini'

export const PLANNER_PROMPT = `Tu es un planificateur de composition musicale.
Objectif: produire un plan compact au format JSON (et rien d'autre) pour guider une composition dans un style donné.

Exigences:
- Répondre EXCLUSIVEMENT en JSON valide, sans commentaires ni texte hors JSON.
- Clés attendues au minimum:
  {
    "style": string,
    "mood": string,
    "timeSignature": string,
    "tempo": number,
    "key": string,
    "form": string,
    "complexity": number,
    "polyphony": "mono" | "two-voices" | "chords" | "multi-part",
    "idioms": string[],
    "techniques": string[],
    "sections": [
      {
        "name": string,
        "measures": number,
        "key": string,
        "harmony": string,
        "rhythm": string,
        "melodyContour": string,
        "instrumentation": string[]
      }
    ]
  }
`


