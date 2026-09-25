# Vocal

A small voiceover app: enter a script and delivery direction, generate speech, listen, and download a WAV.

Downloads use the first few script words, local generation date and time, and voice name: `Hello-world_2026-09-25_153000_Sulafat.wav`. Telugu text is preserved and filename-unsafe punctuation is removed. The name stays attached to its generated audio when the script or selected voice is edited later.

Single voice is the default. Switch to **Compare voices** to select two or three of the existing voices and generate auditions together. Each gets the identical script and delivery direction, independent progress, a player, and a voice-named WAV download. Successful auditions remain available if another fails. Playing one audition pauses the others. Each voice uses one provider call per script section; there are no automatic retries.

The default purpose is **Telugu ads**, with Sulafat (warm) and conversational Andhra Telugu delivery. The **Purpose** selector also offers English ads, English and Telugu Reels / Shorts, and English and Telugu narration / explainers. Ads emphasize offers and calls to action; shorts use a stronger opening and brisk conversational pacing; narration uses a measured explanatory style. Choosing a purpose fills the editable delivery direction without changing the script or voice selection. Clearing the direction uses the selected preset in both single and comparison modes. Direct API calls without direction retain the Telugu-ad default.

Use an English script for English presets and Telugu script for Telugu presets. The spoken script is never rewritten or translated by the app. Presets guide the delivery; pronunciation, accent, and pacing still need a listening check with real generated audio.

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

Double-click `push-changes.cmd` in this folder. It shows the changed files and staged summary, stages all non-ignored changes (including deletions), commits them with a timestamp, and pushes the current branch to `origin`. Commit and push output stay visible, then the window closes after three seconds. When there are no changes, it still pushes any existing unpushed commits. It never force-pushes or pulls automatically and stops on unresolved conflicts or failed commands. Git must be installed and signed in.

Errors appear in the same window before the three-second closing delay. Local `.env` files, dependencies and build output are ignored; `.env.example` is intentionally included. Review changes before running the script because the repository is public. Only the first push is handled during initial setup; future pushes are yours. To keep the output visible for troubleshooting, run the script from an already-open Command Prompt.

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

Scripts accept up to 3,000 whitespace-separated words, including Telugu. Over-limit pastes remain editable; generation is disabled until shortened. Delivery instructions retain a separate 1,000-character limit. Long scripts are split at sentence boundaries where possible, then whitespace or Unicode graphemes, into sections of at most 100 words and 800 UTF-16 code units. Text is not rewritten. The API accepts one section per request with a 16 KB body limit and a 4,000,000-byte PCM response cap (about 83 seconds), below Vercel's response limit.

The browser generates sections sequentially per voice, validates each WAV, and joins the PCM frames under one WAV header for playback and download. The combined download can exceed the per-request cap without passing through Vercel again. Each section has its own timeout. Keep the page open; progress and cancellation are available in both modes. A failed section fails that voiceover instead of offering a truncated download. Longer scripts require more API calls and time, and delivery may vary slightly between sections. Provider quotas and output limits still apply; unusually slow sections may exceed the audio cap. Live long-form quality requires listening checks.

Tests verify request validation, script fidelity in the outgoing payload, error mapping, timeouts, cancellation, malformed audio, exact WAV headers, duplicate submission, URL cleanup and frontend recovery. Real synthesis, accent quality and spoken-text fidelity still require a live key and listening checks; no model can be certified by a mocked response.

References: [Gemini speech API](https://ai.google.dev/gemini-api/docs/speech-generation), [Vercel limits](https://vercel.com/docs/functions/limitations).
