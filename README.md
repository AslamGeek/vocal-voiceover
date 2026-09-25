# Vocal

A small voiceover app: enter a script and delivery direction, generate speech, listen, and download a WAV.

Downloads use the first few script words, local generation date and time, and voice name: `Hello-world_2026-09-25_153000_Sulafat.wav`. Telugu text is preserved and filename-unsafe punctuation is removed. The name stays attached to its generated audio when the script or selected voice is edited later.

## Voice Profiles workflow

**Transcript → Voice Profiles & individual directions → Generate → Audition Results**

Select one or more Male/Female variants, including both variants of a profile or all ten. The default is **Warm & Inviting → Female (Sulafat)**. There is no separate comparison mode or purpose selector.

| Profile | Female | Male |
| --- | --- | --- |
| Warm & Inviting | Sulafat | Achird |
| Firm & Clear | Kore | Orus |
| Upbeat & Expressive | Laomedeia | Puck |
| Calm & Reassuring | Achernar | Schedar |
| Premium & Polished | Gacrux | Algieba |

All profile definitions, variants, sample scripts, and direction composition live in **lib/voice-profiles.ts**. Voice names and gender presentation follow [Gemini's voice catalog](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts); the personality mapping is an app configuration based on [Google's voice descriptions](https://ai.google.dev/gemini-api/docs/speech-generation#prebuilt-voices).

Each voice has its own editable **Direction**, prefilled with its profile baseline and limited to 1,000 characters. Edits replace that baseline rather than being appended to a hidden default. The server always adds the transcript-fidelity instruction. A blank field falls back to the profile baseline. The × button clears only that voice’s direction and focuses its field; Reset restores its default. Directions survive selection changes for the current page session, and are locked during generation. The defaults do not force a language or a business-ad purpose. For example, use “Natural Andhra Telugu, conversational pace, emphasize the offer” or “Conversational English for a short video, crisp pauses.” The app does not rewrite or translate the transcript.

Every variant has a **Preview** button. It generates the profile's short sample with that voice’s current direction, using the existing TTS endpoint. Subsequent previews with unchanged direction reuse an in-memory session cache; refreshing or leaving the page releases it. Editing a voice’s direction closes and cancels its current preview; the next Preview regenerates the sample and releases obsolete cached audio. Previews never change the transcript, direction, selections, or results. Only one preview request runs at a time; selecting another cancels the pending one. Starting an audition cancels pending preview work and disables previews until generation ends. If browser autoplay is blocked, press Play in the visible preview player. Playing any preview or audition pauses the other audio players.

One unified queue generates up to two voices concurrently, with sequential sections within each voice. Each voice receives the exact same transcript and its own direction, captured when Generate is pressed; its default direction and provider voice come from its profile. Results show the profile, gender, provider voice, queue/progress status, player, individual error, and download. Failed voices do not remove successful outputs. Cancel stops active requests and queued work while retaining completed downloads. Starting a new batch replaces previous audition results. Each voice uses one provider call per section; previews also consume a provider call on first use. There are no automatic retries.

## API keys in Settings

Open **Settings** in the studio header. Each saved API key has its own visible text field. Add a key using the separate label (optional) and API key fields, then **Add key**. The first saved key becomes active; select any saved key whenever needed. Each saved key has Copy, Edit, and Delete buttons. Copy puts the full key on the clipboard; Edit updates its label and value. Delete removes a saved key; deleting the active key selects the first remaining key. With no keys saved, Preview and Generate are disabled until a key is added. Duplicate keys are rejected. There is no app-imposed key-count limit (browser storage capacity still applies).

Keys and the selection persist in this browser’s localStorage under `vocal.api-keys`, as **plain text**, as requested. They survive refreshes and reopening the app at the same origin. They do not synchronize across devices, browser profiles, or different URLs. Clearing site data removes them. Saved values are visible in their own fields and are not encrypted; JavaScript on this origin can read them. The previous single saved key is imported automatically, and its old storage entry is removed only after saving the new list succeeds. Storage errors are shown; the UI does not claim a failed save succeeded.

The selected key is sent to the app’s same-origin API in an Authorization header, and used only for that request. The server forwards it to the fixed Gemini endpoint without following redirects. Use HTTPS in production. Keys are never placed in URLs, transcript JSON, downloads or app logs. No database, extra Vercel settings, or owner account is needed. Only the API key selected in the browser UI is used. The server does not read or fall back to `GEMINI_API_KEY`.

Each generation batch captures the selected key for all voices and script sections. Settings is disabled while generating; cancel before switching. Opening Settings cancels a pending preview, and switching keys clears the preview cache. Completed voiceovers remain available. Other open tabs pick up saved changes when Settings is reopened or the page refreshed. A rejected or exhausted key never automatically rotates or silently falls back. Keys from the same Google project share quota.

## Telegram storage

Open **Settings → Telegram**. Create a bot with [BotFather](https://t.me/BotFather), add it to your group, and allow it to send documents. Paste the bot token into Settings (not into a support chat). Enter the numeric group ID or public @groupusername. Alternatively, send /start@YourBotUsername in the group, click **Find groups**, and select the group. Finding groups reads recent bot updates without acknowledging them or changing webhooks; a dedicated bot is easiest. If another service uses this bot or its updates are unavailable, enter the group ID directly. For a forum topic, optionally enter its numeric topic ID.

**Connect & save** checks the bot and group without posting a message, then remembers the token, resolved group ID, title and optional topic in this browser’s plain-text localStorage (vocal.telegram). The bot must retain permission to send documents; a successful connection check does not guarantee future upload permissions. **Remove connection** removes these browser settings, not messages already saved in Telegram.

Each completed voiceover has **Save to Telegram**. Only clicking this button sends that WAV to the saved group. Uploads preserve the original bytes and meaningful filename; they use Telegram’s document method rather than converting to a voice note. The button prevents simultaneous duplicate sends and displays success only after Telegram confirms a sent document. After success, a message link is shown when supported by the group type. Download WAV remains available. Finish or cancel generation before uploading.

Files go directly from the browser to api.telegram.org over HTTPS, bypassing Vercel’s request-body limit. There is no server bot token, new environment variable, proxy, or database. Telegram requires its bot token in the API request path; it is never included in group messages, filenames, app logs or the user-facing page URL. The app omits cookies and referrers from Telegram requests. Save supports WAVs up to 50 MB; larger files must be downloaded and uploaded manually. This uses the [official sendDocument API](https://core.telegram.org/bots/api#senddocument).

Uploads have a two-minute deadline and can be cancelled. A connection loss, timeout or cancellation can leave delivery uncertain: check the group before manually retrying. The app never automatically retries or deletes posted documents. Keep the page open during upload. Tests mock Telegram; real bot permissions, browser/network access to Telegram and successful group delivery require checking with your own connection.

## Local development

Use Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env.local
# Set GEMINI_API_KEY in .env.local, then:
npm run dev
```

Open the URL printed by Next.js and add an API key in Settings. No environment variable is required. No provider SDK, database, global state library, or application account system is required.

## Checks and production

```sh
npm test
npm run typecheck
npm run build
npm start
```

Tests mock Gemini: they do not use a real key or incur provider charges. Building does not require a key; generation needs a key selected in Settings.

## Deploy to Vercel

1. Import this folder as a Next.js project using your preferred Vercel workflow. If using a repository, set the Root Directory to the folder containing this package.json.
2. No Gemini environment variable is needed. Add API keys in the app’s Settings after deployment.
3. Use Node.js 24, the Next.js preset, install command `npm ci`, and build command `npm run build`. Leave the output directory at the framework default.
4. Deploy. The route requests a 120-second function duration; use a Vercel runtime/plan supporting this duration.
5. Generate a short script, listen for text fidelity and pronunciation, and download/open the WAV. Repeat with your target language and direction.

Alternatively, from this folder, run `npx vercel` and then `npx vercel --prod`.

## Push future changes on Windows

Double-click `push-changes.cmd` in this folder. It shows the changed files and staged summary, stages all non-ignored changes (including deletions), commits them with a timestamp, and pushes the current branch to `origin`. Commit and push output stay visible, then the window closes after three seconds. When there are no changes, it still pushes any existing unpushed commits. It never force-pushes or pulls automatically and stops on unresolved conflicts or failed commands. Git must be installed and signed in.

Errors appear in the same window before the three-second closing delay. Local `.env` files, dependencies and build output are ignored; `.env.example` is intentionally included. Review changes before running the script because the repository is public. Only the first push is handled during initial setup; future pushes are yours. To keep the output visible for troubleshooting, run the script from an already-open Command Prompt.

This app deliberately has no user accounts. For a personal deployment, use Vercel Deployment Protection to control access. If you make it public, apply host-level rate limits and provider quotas to the paid generation endpoint. The origin check is a browser CSRF defense, not authentication.

## Design and boundaries

- Next.js App Router + React + TypeScript; only three runtime dependencies.
- `components/voiceover-studio.tsx`: transcript, variant selections, individual editable directions, profile cards, and shared playback coordination.
- `components/use-auditions.ts`: bounded queue, duplicate-submit lock, cancellation, progress, per-voice errors and URL cleanup.
- `components/use-voice-previews.ts`: isolated lazy previews, session cache, aborts and URL cleanup.
- `components/audition-results.tsx`: one result UI for all selection sizes.
- `lib/voice-profiles.ts`: the five profiles, ten variants, metadata and effective-direction helper.
- `lib/api-client.ts`: binary API client, safe error mapping and WAV verification.
- `lib/contracts.ts`: shared transcript/direction limits and runtime variant validation.
- `app/api/generate/route.ts`: bounded JSON input, safe errors, no-store binary WAV output.
- `lib/server/tts.ts`: isolated Gemini REST integration with a 90-second deadline, disconnect propagation, bounded responses and no automatic retries.
- `lib/audio.ts`: deterministic 24 kHz / mono / 16-bit little-endian PCM to WAV conversion and format validation.

The integration uses `gemini-3.8-flash-tts` via the Interactions API. The exact submitted transcript is sent as text; the selected voice’s effective direction is separate `speech_metadata.style`. There is no rewriting step. No audio or script is stored by the app, and provider interaction storage is disabled. This does not override the provider's own data policies.

Scripts accept up to 3,000 whitespace-separated words, including Telugu. Over-limit pastes remain editable; generation is disabled until shortened. Each voice’s delivery instructions retain a 1,000-character limit. Long scripts are split at sentence boundaries where possible, then whitespace or Unicode graphemes, into sections of at most 100 words and 800 UTF-16 code units. Text is not rewritten. The API accepts one section per request as JSON with text, direction, and variantId (for example warm-female) with a 16 KB body limit and a 4,000,000-byte PCM response cap (about 83 seconds), below Vercel's response limit.

The browser generates sections sequentially per voice, validates each WAV, and joins the PCM frames under one WAV header for playback and download. The combined download can exceed the per-request cap without passing through Vercel again. Each section has its own timeout. Keep the page open; per-voice progress and cancellation are available for every batch. A failed section fails that voiceover instead of offering a truncated download. Longer scripts require more API calls and time, and delivery may vary slightly between sections. Provider quotas and output limits still apply; unusually slow sections may exceed the audio cap. Live long-form quality requires listening checks.

Tests verify every variant’s provider mapping and composed direction, transcript fidelity, one-to-ten selections, queue concurrency, partial failure, cancellation, progress, preview caching/isolation, playback coordination, URL cleanup, request limits, timeouts, malformed audio, and WAV joining. Real synthesis, accent quality and spoken-text fidelity still require a live key and listening checks; no model can be certified by a mocked response.

References: [Gemini speech API](https://ai.google.dev/gemini-api/docs/speech-generation), [Vercel limits](https://vercel.com/docs/functions/limitations).
