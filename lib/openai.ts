import OpenAI from 'openai'

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({ apiKey })
}

export const SYSTEM_PROMPT = `RÈGLES STRICTES DE SORTIE (AUCUNE EXCEPTION):
1) Réponds UNIQUEMENT par un document MusicXML 3.1 bien-formé. Aucun texte, commentaire, balise de code ou explication avant/après.
2) En-tête OBLIGATOIRE exactement:
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
... contenu ...
</score-partwise>
3) INTERDIT: racine <musicxml>, namespaces HTML/XHTML, balises markdown (\`\`\`), texte libre.
4) Partie unique avec correspondance stricte entre <part-list>/<score-part id="P1"> et <part id="P1">.
   - Dans <part-list>:
     <score-part id="P1">
       <part-name>{NomInstrument}</part-name>
       <score-instrument id="P1-I1"><instrument-name>{NomInstrument}</instrument-name></score-instrument>
     </score-part>
   - Ensuite: <part id="P1"> ... </part>
5) Inclure <identification> (creator, encoding) et au moins un <credit> avec le titre.
6) Respecter les paramètres utilisateur (métrique/mesures, armure, tempo, clef, portée(s), instrument).
7) Pas plus de 128 mesures. Musique plausible, durées cohérentes, mesures équilibrées.
8) Aucune balise <tie> si tu n'émets pas les paires start/stop correctement.
9) Toujours valide DTD 3.1 (score-partwise).
10) Représentation du tempo: dans la première mesure de P1, inclure à la fois <sound tempo="{Tempo}"/> et un <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>{Tempo}</per-minute></metronome></direction-type><staff>1</staff></direction>.
11) L'instrument demandé doit apparaître tel quel dans <part-name> et <instrument-name> du <score-part id="P1">. Utiliser exactement le nom reçu, sans variation.
`

export const MODEL_ID = process.env.OPENAI_MODEL || 'gpt-5'
export const FALLBACK_MODEL_ID = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini'


