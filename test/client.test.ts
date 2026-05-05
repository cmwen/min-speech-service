import { describe, expect, it, vi } from 'vitest';

import { createSpeechClient } from '../src/client.js';

describe('createSpeechClient', () => {
  it('fetches health and capabilities', async () => {
    const fetch = vi.fn(async (input: string | URL) => {
      if (`${input}`.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            ok: true,
            provider: 'openai-compatible',
            upstreamOk: true,
            upstreamBaseUrl: 'http://127.0.0.1:8000/v1',
            sttModel: 'stt-model',
            ttsModel: 'tts-model',
            defaultVoice: 'voice',
          }),
        );
      }

      return new Response(
        JSON.stringify({
          provider: 'openai-compatible',
          upstreamBaseUrl: 'http://127.0.0.1:8000/v1',
          transcription: {
            endpoint: '/v1/audio/transcriptions',
            model: 'stt-model',
            responseFormats: ['json'],
          },
          synthesis: {
            endpoint: '/v1/audio/speech',
            model: 'tts-model',
            defaultVoice: 'voice',
            responseFormats: ['wav'],
          },
          realtime: {
            supported: true,
            upstreamEndpoint: 'http://127.0.0.1:8000/v1/realtime',
          },
        }),
      );
    });

    const client = createSpeechClient({
      baseUrl: 'http://127.0.0.1:8790',
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.getHealth()).resolves.toMatchObject({ ok: true });
    await expect(client.getCapabilities()).resolves.toMatchObject({
      provider: 'openai-compatible',
    });
  });

  it('transcribes uploads and synthesizes audio', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text: 'hello world',
            model: 'stt-model',
            provider: 'openai-compatible',
            raw: { text: 'hello world' },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'audio/wav' },
        }),
      );

    const client = createSpeechClient({
      baseUrl: 'http://127.0.0.1:8790',
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(
      client.transcribe(
        new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
        {
          filename: 'recording.webm',
        },
      ),
    ).resolves.toMatchObject({
      text: 'hello world',
    });

    await expect(client.speak({ input: 'Hello' })).resolves.toBeInstanceOf(
      Blob,
    );
  });
});
