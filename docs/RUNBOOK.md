# Runbook

## Normal startup

1. Start the local backend:

   ```bash
   docker compose -f compose.dev.yml up -d
   ```

2. Start the facade:

   ```bash
   pnpm dev
   ```

3. Check health:

   ```bash
   curl http://127.0.0.1:8790/health
   ```

## Common recovery steps

### `/health` reports `upstreamOk: false`

- Check whether the `speaches` container is running.
- Confirm `SPEECH_API_BASE_URL` still points at the backend's `/v1` root.
- If the backend just started, retry after the model preload finishes.

### First STT or TTS request is slow

- This is usually model warm-up.
- Keep `PRELOAD_MODELS` enabled in `compose.dev.yml`.
- On a shared host, consider pinning models in memory instead of allowing them to unload aggressively.

### Browser playback fails

- Keep `responseFormat` on `wav` unless you have confirmed a different backend format works end to end.
- Verify the browser is receiving `Content-Type: audio/wav`.

### Browser upload fails with CORS

- Add the app origin to `ALLOWED_ORIGINS`.
- If each app already has a local runtime/API proxy, prefer routing browser requests through that proxy instead of exposing the speech service directly.

### Local CPU performance is too slow

- Keep the default distil Whisper model for STT.
- Move to a CUDA-capable `speaches` image before enabling heavier models or low-latency speech UX.

### You need to switch to a cloud backend

- Set `SPEECH_API_BASE_URL` to the OpenAI-compatible provider base URL.
- Set `SPEECH_API_KEY` for that provider.
- Leave the app integrations unchanged.
