# Music IA

Application Next.js 14 (App Router, TypeScript) pour générer du MusicXML via OpenAI et l'importer/afficher avec Flat.io.

## Démarrage

1. Copier `.env.local` :

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5
OPENAI_FALLBACK_MODEL=gpt-4o-mini
FLAT_CLIENT_ID=...
FLAT_CLIENT_SECRET=...
FLAT_REDIRECT_URI=https://<domain>/api/flat/callback
FLAT_COOKIE_SECRET=strong-random-secret
NEXT_PUBLIC_BASE_URL=https://<domain>
BLOB_READ_WRITE_TOKEN=vercel_blob_token_here
```

2. Installation et dev:

```
pnpm install
pnpm dev
```

3. Configurer l'app OAuth sur Flat.io :
 - Redirect URI: `https://<domain>/api/flat/callback`
 - Scopes: `scores account.public_profile`

## Déploiement Vercel

Déployer et définir les variables d'env ci-dessus. La route `/api/flat/callback` doit être configurée dans l'app Flat.

Pour le fallback Import API, activer Vercel Blob et fournir `BLOB_READ_WRITE_TOKEN` si nécessaire (en local et/ou projets non liés). Voir la doc Vercel Blob.


