import OpenAI from 'openai'

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({ apiKey })
}

export const SYSTEM_PROMPT = `Tu produis uniquement du MusicXML 3.1 bien-formé, sans texte additionnel. Erreurs XML interdites. Respecter métrique/mesures, armure, tempo, clefs, portées et instruments demandés. Ne pas dépasser 128 mesures. Inclure <identification> et <credit> titre/auteur. Encodage UTF-8.`

export const MODEL_ID = process.env.OPENAI_MODEL || 'gpt-5'
export const FALLBACK_MODEL_ID = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini'


