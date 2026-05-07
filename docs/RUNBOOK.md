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

### Shared `/home/cmwen/dev` launcher

If your repos live at the default paths under `/home/cmwen/dev`, you can also use:

```bash
/home/cmwen/dev/launch-kb-apps-tailscale.sh
```

That launcher now includes a `speech-service` tmux window, runs `docker compose -f compose.dev.yml up -d`, and starts the facade with `PORT=8790`. Set `SPEECH_SERVICE_START_BACKEND=0` if you want it to skip the backend startup step.

## Common recovery steps

### `/health` reports `upstreamOk: false`

- Check whether the `speaches` container is running.
- Confirm `SPEECH_API_BASE_URL` still points at the backend's `/v1` root.
- If the backend just started, retry after the model preload finishes.

### First STT or TTS request is slow

- This is usually model warm-up.
- Keep `PRELOAD_MODELS` enabled in `compose.dev.yml`.
- On a shared host, consider pinning models in memory instead of allowing them to unload aggressively.
- The first zh-TW request may also trigger an on-demand download of `STT_MODEL_ZH_TW` or `TTS_MODEL_ZH_TW` if you did not preload them.

### Browser playback fails

- Keep `responseFormat` on `wav` unless you have confirmed a different backend format works end to end.
- Verify the browser is receiving `Content-Type: audio/wav`.

### Browser upload fails with CORS

- Add the app origin to `ALLOWED_ORIGINS`.
- If each app already has a local runtime/API proxy, prefer routing browser requests through that proxy instead of exposing the speech service directly.

### Local CPU performance is too slow

- Keep the default distil Whisper model for STT.
- Use `language: "zh-TW"` only when you need multilingual transcription, because it switches to the larger multilingual Whisper preset.
- Move to a CUDA-capable `speaches` image before enabling heavier models or low-latency speech UX.

### Traditional Chinese / Taiwan voice expectations

- The facade accepts `language: "zh-TW"` on both transcription and synthesis requests.
- `speaches` can auto-download the configured zh-TW STT/TTS models the first time that locale is used.
- The current default zh-TW TTS preset uses the closest supported Mandarin voice in the `speaches` registry. There is not yet a true Taiwan-accented TTS model in the upstream registry, so override `TTS_MODEL_ZH_TW` and `TTS_VOICE_ZH_TW` if you add one later.

### You need to switch to a cloud backend

- Set `SPEECH_API_BASE_URL` to the OpenAI-compatible provider base URL.
- Set `SPEECH_API_KEY` for that provider.
- Leave the app integrations unchanged.
