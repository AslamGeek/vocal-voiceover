# Vocal

A small voiceover app: enter a script and delivery direction, generate speech, listen, and download a WAV.

Downloads use the first few script words, local generation date and time, and voice name: `Hello-world_2026-09-25_153000_Sulafat.wav`. Telugu text is preserved and filename-unsafe punctuation is removed. The name stays attached to its generated audio when the script or selected voice is edited later.

## Voice Profiles workflow

**Transcript → Voice Profiles → Persona & Direction → Generate → Audition Results**

Select one or more Male/Female variants, including both variants of a profile or all ten. The default is **Warm & Inviting → Female (Sulafat)**. There is no separate comparison mode or purpose selector.

| Profile | Female | Male |
| --- | --- | --- |
| Warm & Inviting | Sulafat | Achird |
| Firm & Clear | Kore | Orus |
| Upbeat & Expressive | Laomedeia | Puck |
| Calm & Reassuring | Achernar | Schedar |
| Premium & Polished | Gacrux | Algieba |

All profile definitions, variants, sample scripts, and direction composition live in **lib/voice-profiles.ts**. Voice names and gender presentation follow [Gemini's voice catalog](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts); the personality mapping is an app configuration based on [Google's voice descriptions](https://ai.google.dev/gemini-api/docs/speech-generation#prebuilt-voices).

Persona & Direction is one optional shared refinement, limited to 1,000 characters. The server constructs each voice's effective direction as its own profile baseline, the user's refinement, then a transcript-fidelity instruction. Leaving it empty retains that profile's baseline. The profile baseline does not force a language or a business-ad purpose. For example, enter “Natural Andhra Telugu, conversational pace, emphasize the offer” or “Conversational English for a short video, crisp pauses.” The app does not rewrite or translate the transcript.

Every variant has a **Preview** button. Its first use generates the profile's short sample with that profile's baseline, using the existing TTS endpoint. Subsequent previews reuse an in-memory session cache; refreshing or leaving the page releases it. Previews never change the transcript, direction, selections, or results. Only one preview request runs at a time; selecting another cancels the pending one. Starting an audition cancels pending preview work and disables previews until generation ends. If browser autoplay is blocked, press Play in the visible preview player. Playing any preview or audition pauses the other audio players.

One unified queue generates up to two voices concurrently, with sequential sections within each voice. Each voice receives the exact same transcript and shared refinement; its baseline and provider voice come from its profile. Results show the profile, gender, provider voice, queue/progress status, player, individual error, and download. Failed voices do not remove successful outputs. Cancel stops active requests and queued work while retaining completed downloads. Starting a new batch replaces previous audition results. Each voice uses one provider call per section; previews also consume a provider call on first use. There are no automatic same-key retries. The server can fail over to another eligible configured key as described below.

## Local development

Use Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env.local
# Set GEMINI_API_KEYS (or GEMINI_API_KEY) in .env.local, then:
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env.local`. Open the URL printed by Next.js. Never add a NEXT_PUBLIC_ prefix to the key. No provider SDK, database, global state library, or application account system is required.

## Server-side Gemini keys and failover

In Vercel environment variables, set:

```env
GEMINI_API_KEYS=key1,key2,key3
```

Redeploy after changing the environment. A non-empty pool takes precedence over the legacy **GEMINI_API_KEY**. A blank or unset pool falls back to that single key. Keys are trimmed and deduplicated in order; empty entries, whitespace inside tokens, unsupported token characters, or tokens longer than 256 characters produce the existing normalized configuration error. Parsing checks configuration syntax; actual authorization is checked by Gemini.

The first key starts active. A successful backup becomes active for subsequent requests in that warm server process. Cold starts begin with the first key again; this is not a shared global pool across Vercel instances. A logical request is one TTS section, including a preview section. Each distinct key is attempted **at most once** for that request, without round-robin loops or same-key retries. Every attempt and wait shares the existing **90-second deadline**, and client cancellation stops further work immediately.

| Failure | Default behavior |
| --- | --- |
| 401 / 403 authentication or permission failure | Try the next untried key immediately. |
| 429 quota/rate limit | Return existing RATE_LIMITED error and 30-second Retry-After; do not rotate keys. |
| 500 / 502 / 503 / 504 temporary provider error | Return the existing normalized error; optional failover below. |
| Invalid input, safety/content block, validation, unsupported operation | Stop; never rotate to bypass the error. |
| Network error, malformed/oversized audio, or successful HTTP response with blocked output | Preserve existing error handling; do not rotate. |
| Client cancellation / overall timeout | Stop active fetch/backoff immediately; no further keys. |

Optional server environment settings (both default to false):

```env
GEMINI_API_KEYS_INDEPENDENT_PROJECTS=false
GEMINI_API_FAILOVER_ON_TRANSIENT_ERRORS=false
```

**Quota failover:** Set the first flag to true only after verifying that **every configured key belongs to a different, independently eligible project**. The app cannot infer project ownership from key strings. [Gemini quotas apply per project, not per key](https://ai.google.dev/gemini-api/docs/rate-limits). Same-project or unknown-project pools must leave this false. Eligible 429 failover waits at least 30 seconds, with exponential backoff, before trying the next untried key.

**Transient failover:** Set the second flag to true to retry temporary 500/502/503/504 failures using the next untried key after exponential backoff starting at one second. The existing app had no automatic same-key retry behavior; that remains unchanged. Provider Retry-After (seconds or HTTP date) and structured retryDelay values can lengthen either backoff. Waits never extend the shared TTS deadline. A single configured key still produces one attempt without extra waits, even when these options are enabled.

All keys, active-key state, error-body inspection, and selection logic remain in a module protected by Next's **server-only** marker. Keys are sent only to the fixed Gemini endpoint in the x-goog-api-key header, never in URLs, browser responses, client bundles, or logs. Errors expose only the existing safe code/message; provider error text is never forwarded. When the pool is exhausted, the final failure is normalized through the same API error path. Failover can create additional billable requests, but does not multiply quota.

Configuration failures retain the `NOT_CONFIGURED` code and include a fixed `configurationReason` in the response and runtime log: `MISSING_KEY`, `INVALID_SINGLE_KEY`, `INVALID_KEY_LIST`, `INVALID_QUOTA_SETTING`, or `INVALID_TRANSIENT_SETTING`. The studio shows an actionable, locally defined message for each reason and ignores unknown reasons and raw server messages. No key values are included. A non-empty invalid pool still takes precedence over a valid single key; correct or remove the pool instead of silently bypassing it.

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
2. Add `GEMINI_API_KEYS` as a sensitive server environment variable containing comma-separated keys. Existing single-key `GEMINI_API_KEY` configuration also works. Set these only for the deployment environments you intend to use, then redeploy.
3. Use Node.js 24, the Next.js preset, install command `npm ci`, and build command `npm run build`. Leave the output directory at the framework default.
4. Deploy (or redeploy after adding/changing the key). The route requests a 120-second function duration; use a Vercel runtime/plan supporting this duration.
5. Generate a short script, listen for text fidelity and pronunciation, and download/open the WAV. Repeat with your target language and direction.

Alternatively, from this folder, run `npx vercel`, configure the environment variable in Vercel, and run `npx vercel --prod`.

## Push future changes on Windows

Double-click `push-changes.cmd` in this folder. It shows the changed files and staged summary, stages all non-ignored changes (including deletions), commits them with a timestamp, and pushes the current branch to `origin`. Commit and push output stay visible, then the window closes after three seconds. When there are no changes, it still pushes any existing unpushed commits. It never force-pushes or pulls automatically and stops on unresolved conflicts or failed commands. Git must be installed and signed in.

Errors appear in the same window before the three-second closing delay. Local `.env` files, dependencies and build output are ignored; `.env.example` is intentionally included. Review changes before running the script because the repository is public. Only the first push is handled during initial setup; future pushes are yours. To keep the output visible for troubleshooting, run the script from an already-open Command Prompt.

This app deliberately has no user accounts. For a personal deployment, use Vercel Deployment Protection to control access. If you make it public, apply host-level rate limits and provider quotas to the paid generation endpoint. The origin check is a browser CSRF defense, not authentication.

## Design and boundaries

- Next.js App Router + React + TypeScript; only three runtime dependencies.
- `components/voiceover-studio.tsx`: transcript, variant selections, direction, profile cards, and shared playback coordination.
- `components/use-auditions.ts`: bounded queue, duplicate-submit lock, cancellation, progress, per-voice errors and URL cleanup.
- `components/use-voice-previews.ts`: isolated lazy previews, session cache, aborts and URL cleanup.
- `components/audition-results.tsx`: one result UI for all selection sizes.
- `lib/voice-profiles.ts`: the five profiles, ten variants, metadata and effective-direction helper.
- `lib/api-client.ts`: binary API client, safe error mapping and WAV verification.
- `lib/contracts.ts`: shared transcript/direction limits and runtime variant validation.
- `app/api/generate/route.ts`: bounded JSON input, safe errors, no-store binary WAV output.
- `lib/server/tts.ts`: isolated Gemini REST integration with a 90-second deadline, disconnect propagation, bounded responses and safe error normalization.
- `lib/server/gemini-key-pool.ts`: server-only key configuration, sticky active key, bounded failover, abortable backoff and provider error classification.
- `lib/audio.ts`: deterministic 24 kHz / mono / 16-bit little-endian PCM to WAV conversion and format validation.

The integration uses `gemini-3.8-flash-tts` via the Interactions API. The exact submitted transcript is sent as text; composed profile/persona direction is separate `speech_metadata.style`. There is no rewriting step. No audio or script is stored by the app, and provider interaction storage is disabled. This does not override the provider's own data policies.

Scripts accept up to 3,000 whitespace-separated words, including Telugu. Over-limit pastes remain editable; generation is disabled until shortened. Delivery instructions retain a separate 1,000-character limit. Long scripts are split at sentence boundaries where possible, then whitespace or Unicode graphemes, into sections of at most 100 words and 800 UTF-16 code units. Text is not rewritten. The API accepts one section per request as JSON with text, direction, and variantId (for example warm-female) with a 16 KB body limit and a 4,000,000-byte PCM response cap (about 83 seconds), below Vercel's response limit.

The browser generates sections sequentially per voice, validates each WAV, and joins the PCM frames under one WAV header for playback and download. The combined download can exceed the per-request cap without passing through Vercel again. Each section has its own timeout. Keep the page open; per-voice progress and cancellation are available for every batch. A failed section fails that voiceover instead of offering a truncated download. Longer scripts require more API calls and time, and delivery may vary slightly between sections. Provider quotas and output limits still apply; unusually slow sections may exceed the audio cap. Live long-form quality requires listening checks.

Tests also cover legacy/single-key behavior, pool parsing and deduplication, sticky key selection, exhaustion bounds, cancellation before/during failover, backoff and shared deadlines, project-quota safeguards, blocked/invalid requests, and key redaction.

Tests verify every variant’s provider mapping and composed direction, transcript fidelity, one-to-ten selections, queue concurrency, partial failure, cancellation, progress, preview caching/isolation, playback coordination, URL cleanup, request limits, timeouts, malformed audio, and WAV joining. Real synthesis, accent quality and spoken-text fidelity still require a live key and listening checks; no model can be certified by a mocked response.

References: [Gemini speech API](https://ai.google.dev/gemini-api/docs/speech-generation), [Vercel limits](https://vercel.com/docs/functions/limitations).
