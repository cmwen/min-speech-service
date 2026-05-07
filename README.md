# min-speech-service

`min-speech-service` is a lightweight TypeScript facade for speech features in `min-kb-app` and `gemma-agent-pwa`.

It exposes a stable web-friendly API for:

- speech-to-text via `POST /v1/audio/transcriptions`
- text-to-speech via `POST /v1/audio/speech`
- service health via `GET /health`
- app-facing capability discovery via `GET /v1/capabilities`

The service is designed around an **OpenAI-compatible upstream**. The recommended local backend is [`speaches`](https://github.com/speaches-ai/speaches), which gives you:

- `faster-whisper` for STT
- `Kokoro-82M` for TTS
- one Docker service
- the option to swap to the real OpenAI Audio API later without changing your app contract

Piper is still available in some local stacks, but it is no longer the recommended default because the upstream project is archived.

## Why this shape

Research across the current local speech stack pointed to one clear default:

| Layer | Choice | Reason |
| --- | --- | --- |
| STT | `faster-whisper` through `speaches` | Accurate, fast, OpenAI-compatible, good CPU story |
| TTS | `Kokoro-82M` through `speaches` | Best quality/size tradeoff for local voice generation |
| Service contract | OpenAI-compatible audio endpoints | Easy to integrate, low lock-in |
| Local deployment | `docker compose up` | Smallest operational footprint |

This repo keeps one extra layer in front of the upstream so both apps can share:

- typed request validation
- stable default models and voices
- CORS handling
- health and capabilities endpoints
- a tiny TypeScript client

## Local development

1. Start the recommended local speech backend.

   ```bash
   docker compose -f compose.dev.yml up -d
   ```

2. Copy the environment template if needed.

   ```bash
   cp .env.example .env
   ```

3. Install dependencies and start the facade service.

   ```bash
   pnpm install
   pnpm dev
   ```

4. The service listens on `http://127.0.0.1:8790` by default.

If you keep the related repos under `/home/cmwen/dev`, the shared launcher now starts this service too:

```bash
/home/cmwen/dev/launch-kb-apps-tailscale.sh
```

That launcher opens a `speech-service` tmux window, starts the local `speaches` backend by default, and runs the facade on port `8790`.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind host |
| `PORT` | `8790` | Bind port |
| `SPEECH_API_BASE_URL` | `http://127.0.0.1:8000/v1` | OpenAI-compatible upstream |
| `SPEECH_API_KEY` | `local-no-auth` | Upstream API key |
| `STT_MODEL` | `Systran/faster-distil-whisper-small.en` | Default transcription model |
| `STT_MODEL_ZH_TW` | `Systran/faster-whisper-small` | zh-TW / Traditional Chinese transcription model |
| `STT_RESPONSE_FORMAT` | `json` | Default transcription format |
| `TTS_MODEL` | `speaches-ai/Kokoro-82M-v1.0-ONNX` | Default synthesis model |
| `TTS_VOICE` | `af_heart` | Default voice |
| `TTS_MODEL_ZH_TW` | `speaches-ai/piper-zh_CN-huayan-medium` | zh-TW synthesis model override |
| `TTS_VOICE_ZH_TW` | `huayan` | zh-TW default voice |
| `TTS_RESPONSE_FORMAT` | `wav` | Default output audio format (`mp3`, `wav`, `flac`, or `pcm`) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowlist |

The facade now treats `language: "zh-TW"` (and other Traditional Chinese tags such as `zh-Hant`) as a locale preset:

- transcription switches to the multilingual Whisper model and auto-downloads it on first use if the upstream does not already have it
- synthesis switches to the configured Chinese TTS model and voice, and also auto-downloads the model on demand

`speaches` does not currently publish a Taiwan-accented TTS model in its registry, so the default zh-TW synthesis preset uses the closest supported Mandarin voice path today. If you publish or find a better Taiwan-accented upstream model later, you can swap it in with `TTS_MODEL_ZH_TW` and `TTS_VOICE_ZH_TW` without changing code.

## API

### `GET /health`

Returns the current service health and whether the upstream is reachable.

### `GET /v1/capabilities`

Returns the configured STT/TTS defaults and supported response formats. The facade currently exposes request/response speech only; realtime proxying is intentionally out of scope.

### `POST /v1/audio/transcriptions`

Multipart form fields:

- `file` (required)
- `language`
- `prompt`
- `model`
- `temperature`
- `responseFormat` or `response_format`

Response:

```json
{
  "text": "hello world",
  "model": "Systran/faster-distil-whisper-small.en",
  "provider": "openai-compatible",
  "raw": {
    "text": "hello world"
  }
}
```

### `POST /v1/audio/speech`

Request body:

```json
{
  "input": "請用繁體中文朗讀這段文字",
  "language": "zh-TW",
  "responseFormat": "wav",
  "speed": 1
}
```

Response is raw audio bytes with `Content-Type` set appropriately.

## TypeScript client

The repo exports a small fetch-based client from `src/client.ts`.

```ts
import { createSpeechClient } from './src/client.js';

const speech = createSpeechClient({
  baseUrl: 'http://127.0.0.1:8790',
});

const transcription = await speech.transcribe(file, {
  filename: file.name,
  language: 'zh-TW',
});

const audio = await speech.speak({
  input: transcription.text,
  language: 'zh-TW',
});
```

The client throws `SpeechClientError` on non-2xx responses so app integrations can surface service or validation failures explicitly.

## Integration guidance

Detailed integration and operations docs live in:

- [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md)

### `min-kb-app`

Best touch points:

1. `apps/runtime/src/index.ts` for `/api/speech/*` proxy routes
2. `apps/runtime/src/chat-flow.ts` for optional transcribe-then-chat helpers
3. `apps/web/src/api.ts` for browser uploads and playback

An example wiring sketch lives in `examples/min-kb-app-runtime-route.ts`.

### `gemma-agent-pwa`

Best touch points:

1. `apps/api/src/index.ts` for speech proxy endpoints
2. `apps/web/src/lib/api.ts` for speech client calls
3. `apps/web/src/App.tsx` for recording and playback UX

An example wiring sketch lives in `examples/gemma-agent-pwa-api-route.ts`.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Optional live integration checks:

```bash
RUN_LIVE_SPEECH_TESTS=1 pnpm test:integration
```

## Notes

- `speaches` is the recommended local default, but any OpenAI-compatible speech API can sit behind this service.
- For production, you can either keep `speaches` on a stronger host or switch `SPEECH_API_BASE_URL` to OpenAI-compatible cloud infrastructure.
- `speaches` has a realtime API, but this facade intentionally focuses on request/response STT and TTS because that is the cleanest shared integration point for both target apps.
