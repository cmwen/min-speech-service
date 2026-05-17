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
            languagePresets: [{ language: 'zh-TW', model: 'stt-model-zh' }],
          },
          synthesis: {
            endpoint: '/v1/audio/speech',
            model: 'tts-model',
            defaultVoice: 'voice',
            responseFormats: ['wav'],
            languagePresets: [
              {
                language: 'zh-TW',
                model: 'tts-model-zh',
                defaultVoice: 'huayan',
              },
            ],
          },
          realtime: {
            supported: false,
          },
          textProcessing: {
            endpoint: '/v1/text/process',
            model: 'gemma-4-e4b',
            targetLanguage: 'en',
            features: ['intent-detection'],
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
        new Response(
          JSON.stringify({
            sourceText: 'um hello',
            detectedLanguage: 'en',
            intent: 'Say hello',
            cleanedText: 'hello',
            rewrittenText: 'Hello.',
            translatedText: 'Hello.',
            targetLanguage: 'en',
            fillerWords: ['um'],
            model: 'gemma-4-e4b',
            provider: 'openai-compatible',
            raw: { ok: true },
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

    await expect(
      client.processText({
        input: 'um hello',
      }),
    ).resolves.toMatchObject({
      intent: 'Say hello',
      fillerWords: ['um'],
    });

    await expect(
      client.speak({ input: 'Hello', language: 'zh-TW' }),
    ).resolves.toBeInstanceOf(Blob);

    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:8790/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const synthesisRequest = JSON.parse(
      `${fetch.mock.calls[2]?.[1]?.body ?? '{}'}`,
    );
    expect(synthesisRequest).toMatchObject({
      input: 'Hello',
      language: 'zh-TW',
    });
  });

  it('throws a typed error when the service returns a non-2xx response', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: 'Expected multipart field "file".' }),
          {
            status: 400,
            statusText: 'Bad Request',
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
    );

    const client = createSpeechClient({
      baseUrl: 'http://127.0.0.1:8790/',
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(
      client.transcribe(new Blob([new Uint8Array([1, 2, 3])]), {
        filename: 'recording.webm',
      }),
    ).rejects.toMatchObject({
      name: 'SpeechClientError',
      status: 400,
      statusText: 'Bad Request',
      body: { error: 'Expected multipart field "file".' },
    });
  });
});
