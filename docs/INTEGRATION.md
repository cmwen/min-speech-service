# Integration plan

`min-speech-service` is the shared speech edge for both `min-kb-app` and `gemma-agent-pwa`:

```text
Browser app -> app-local API/runtime proxy -> min-speech-service -> speaches
```

That shape keeps browser code simple, keeps CORS/auth decisions inside each app runtime, and preserves the ability to swap the upstream from local `speaches` to another OpenAI-compatible provider later.

In this repo, the service runtime lives in `apps/service` and the installable demo PWA lives in `apps/showcase`.

## Recommended backend

The researched default stack for 2026 is:

| Layer | Choice | Why |
| --- | --- | --- |
| STT | `faster-whisper` via `speaches` | Strong CPU accuracy/latency tradeoff and OpenAI-compatible endpoint surface |
| TTS | `speaches-ai/Kokoro-82M-v1.0-ONNX` via `speaches` | High-quality local TTS with a good CPU footprint |
| Facade | `min-speech-service` | Stable defaults, validation, health, capabilities, and a shared TypeScript client |
| Escape hatch | OpenAI Audio API | Same contract, so switching is an environment change instead of an app rewrite |

Piper is no longer the recommended default because the upstream project is archived. Keep it only as a legacy fallback if you need an unusually small TTS footprint.

## App touch points

### `min-kb-app`

Use these files as the first integration points:

1. `apps/runtime/src/index.ts` for `/api/speech/*` proxy routes
2. `apps/runtime/src/chat-flow.ts` for optional transcribe-then-chat helpers
3. `apps/web/src/api.ts` for browser speech calls
4. `apps/web/src/App.tsx` for recorder UX in the composer
5. `apps/web/src/components/ChatTimeline.tsx` for per-message playback controls

### `gemma-agent-pwa`

Use these files as the first integration points:

1. `apps/api/src/index.ts` for `/api/speech/*` proxy routes
2. `apps/web/src/lib/api.ts` for browser speech calls
3. `apps/web/src/App.tsx` for recorder UX and playback controls

## Integration phases

1. Add runtime/API proxy routes that forward browser requests to `min-speech-service`.
2. Add browser helpers that call the proxy routes instead of talking to the speech service directly.
3. Add recording UX with `MediaRecorder` and upload `audio/webm` blobs for transcription.
4. Add assistant-message playback controls that request speech audio, create a blob URL, and revoke it after playback.
5. Optionally add a transcribe-before-send flow so voice input becomes normal chat text.

## Browser guidance

- Prefer `audio/webm;codecs=opus` for recording because it works well with `MediaRecorder` and the current backend accepts it.
- Prefer `wav` for synthesized output because it is reliably supported by the recommended local backend and by browsers.
- Treat realtime speech as a future enhancement. This facade intentionally supports request/response flows only.
