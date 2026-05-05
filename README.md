# min-speech-service

`min-speech-service` is a lightweight TypeScript facade for speech features in `min-kb-app` and `gemma-agent-pwa`.

It exposes a stable web-friendly API for:

- speech-to-text via `POST /v1/audio/transcriptions`
- text-to-speech via `POST /v1/audio/speech`
- service health via `GET /health`
- app-facing capability discovery via `GET /v1/capabilities`

The service is designed around an **OpenAI-compatible upstream**. The recommended local backend is [`speaches`](https://github.com/speaches-ai/speaches), which gives you:

- `faster-whisper` for STT
- `Kokoro-82M` or Piper for TTS
- one Docker service
- the option to swap to the real OpenAI Audio API later without changing your app contract

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

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind host |
| `PORT` | `8790` | Bind port |
| `SPEECH_API_BASE_URL` | `http://127.0.0.1:8000/v1` | OpenAI-compatible upstream |
| `SPEECH_API_KEY` | `local-no-auth` | Upstream API key |
| `STT_MODEL` | `Systran/faster-distil-whisper-small.en` | Default transcription model |
| `STT_RESPONSE_FORMAT` | `json` | Default transcription format |
| `TTS_MODEL` | `speaches-ai/Kokoro-82M-v1.0-ONNX` | Default synthesis model |
| `TTS_VOICE` | `af_heart` | Default voice |
| `TTS_RESPONSE_FORMAT` | `wav` | Default output audio format |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowlist |

## API

### `GET /health`

Returns the current service health and whether the upstream is reachable.

### `GET /v1/capabilities`

Returns the configured STT/TTS defaults and supported response formats.

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
  "input": "Read this back to me",
  "voice": "af_heart",
  "model": "speaches-ai/Kokoro-82M-v1.0-ONNX",
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
  language: 'en',
});

const audio = await speech.speak({
  input: transcription.text,
});
```

## Integration guidance

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
- `speaches` realtime support exists, but this repo currently focuses on request/response STT and TTS because that is the cleanest integration point for both target apps.

