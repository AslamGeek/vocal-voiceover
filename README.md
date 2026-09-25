# Vocal

A small voiceover app: enter a script and delivery direction, generate speech, listen, and download a WAV.

## Local development

Use Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env.local
# Set GEMINI_API_KEY in .env.local, then:
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env.local`. Open the URL printed by Next.js. Never add a NEXT_PUBLIC_ prefix to the key. No provider SDK, database, global state library, or application account system is required.

## Checks and production

```sh
npm test
npm run typecheck
npm run build
npm start
```

Tests mock Gemini: they do not use a real key or incur provider charges. Building does not require a key; generation returns a clear configuration error when it is missing.

## Deploy to Vercel

1. Import this folder as a Next.js project using your preferred Vercel workflow. If using a repository, set the Root Directory to the folder containing this package.json.
2. Add `GEMINI_API_KEY` as a sensitive server environment variable for the deployment environments you use.
3. Use Node.js 24, the Next.js preset, install command `npm ci`, and build command `npm run build`. Leave the output directory at the framework default.
4. Deploy (or redeploy after adding/changing the key). The route requests a 120-second function duration; use a Vercel runtime/plan supporting this duration.
5. Generate a short script, listen for text fidelity and pronunciation, and download/open the WAV. Repeat with your target language and direction.

Alternatively, from this folder, run `npx vercel`, configure the environment variable in Vercel, and run `npx vercel --prod`.

## Push future changes on Windows

Double-click `push-changes.cmd` in this folder. It stages all non-ignored changes (including deletions), commits them with a timestamp, pushes the current branch to `origin`, and closes automatically. When there are no changes, it still pushes any existing unpushed commits. It never force-pushes or pulls automatically and stops on unresolved conflicts or failed commands. Git must be installed and signed in.

The result and any errors are recorded in `.git/push-changes.log`. Local `.env` files, dependencies and build output are ignored; `.env.example` is intentionally included. Review changes before running the script because the repository is public. Only the first push is handled during initial setup; future pushes are yours.

This app deliberately has no user accounts. For a personal deployment, use Vercel Deployment Protection to control access. If you make it public, apply host-level rate limits and provider quotas to the paid generation endpoint. The origin check is a browser CSRF defense, not authentication.

## Design and boundaries

- Next.js App Router + React + TypeScript; only three runtime dependencies.
- `components/voiceover-studio.tsx`: local UI state, duplicate-submit lock, cancellation, audio URLs and playback.
- `lib/api-client.ts`: binary API client, safe error mapping and WAV verification.
- `lib/contracts.ts`: shared limits, three voices and runtime request validation.
- `app/api/generate/route.ts`: bounded JSON input, safe errors, no-store binary WAV output.
- `lib/server/tts.ts`: isolated Gemini REST integration with a 90-second deadline, disconnect propagation, bounded responses and no automatic retries.
- `lib/audio.ts`: deterministic 24 kHz / mono / 16-bit little-endian PCM to WAV conversion and format validation.

The integration uses `gemini-3.8-flash-tts` via the Interactions API. The exact submitted script is sent as text; persona is separate `speech_metadata.style`. There is no rewriting step. No audio or script is stored by the app, and provider interaction storage is disabled. This does not override the provider's own data policies.

Script and persona are each limited to 1,000 UTF-16 code units. The audio limit is 4,000,000 PCM bytes (about 83 seconds), below Vercel's response limit. Overlong outputs fail with a request to shorten the script; audio is never truncated. Requests have a 16 KB body limit. Provider base64 is decoded on the server; the browser receives binary `audio/wav`.

Tests verify request validation, script fidelity in the outgoing payload, error mapping, timeouts, cancellation, malformed audio, exact WAV headers, duplicate submission, URL cleanup and frontend recovery. Real synthesis, accent quality and spoken-text fidelity still require a live key and listening checks; no model can be certified by a mocked response.

References: [Gemini speech API](https://ai.google.dev/gemini-api/docs/speech-generation), [Vercel limits](https://vercel.com/docs/functions/limitations).
