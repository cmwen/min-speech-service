import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../src/config.js';
import { createOpenAiGateway } from '../src/gateway.js';

const config: AppConfig = {
  host: '127.0.0.1',
  port: 8790,
  provider: 'openai-compatible',
  apiBaseUrl: 'http://127.0.0.1:8000/v1',
  apiKey: 'local-no-auth',
  sttModel: 'Systran/faster-distil-whisper-small.en',
  zhTwSttModel: 'Systran/faster-whisper-small',
  sttResponseFormat: 'json',
  ttsModel: 'speaches-ai/Kokoro-82M-v1.0-ONNX',
  ttsVoice: 'af_heart',
  zhTwTtsModel: 'speaches-ai/piper-zh_CN-huayan-medium',
  zhTwTtsVoice: 'huayan',
  ttsResponseFormat: 'wav',
  nlpBaseUrl: 'http://127.0.0.1:1234/v1',
  nlpApiKey: 'lm-studio',
  nlpModel: 'gemma-4-e4b',
  nlpTargetLanguage: 'en',
  allowedOrigins: ['*'],
};

describe('createOpenAiGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports missing locale-specific configured models in upstream health', async () => {
    const fetch = vi.fn(async (input: string | URL) => {
      expect(`${input}`).toBe('http://127.0.0.1:8000/v1/models');

      return new Response(
        JSON.stringify({
          object: 'list',
          data: [
            {
              id: config.sttModel,
              object: 'model',
              created: 1,
              owned_by: 'Systran',
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);

    const gateway = createOpenAiGateway(config);

    await expect(gateway.checkUpstream()).resolves.toMatchObject({
      ok: false,
      detail: expect.stringContaining(
        `STT_MODEL_ZH_TW "${config.zhTwSttModel}"`,
      ),
    });
    await expect(gateway.checkUpstream()).resolves.toMatchObject({
      ok: false,
      detail: expect.stringContaining(
        `TTS_MODEL_ZH_TW "${config.zhTwTtsModel}"`,
      ),
    });
  });

  it('downloads a missing speech model and retries synthesis once', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = `${input}`;

      if (url === 'http://127.0.0.1:8000/v1/audio/speech') {
        if (
          fetch.mock.calls.filter(([calledUrl]) => `${calledUrl}` === url)
            .length === 1
        ) {
          return new Response(
            JSON.stringify({
              detail: `Model '${config.ttsModel}' is not installed locally.`,
            }),
            {
              status: 404,
              statusText: 'Not Found',
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );
        }

        return new Response(new Uint8Array([82, 73, 70, 70]), {
          headers: {
            'Content-Type': 'audio/wav',
          },
        });
      }

      expect(url).toBe(
        `http://127.0.0.1:8000/v1/models/${encodeURIComponent(config.ttsModel)}`,
      );
      expect(init?.method).toBe('POST');

      return new Response(`Model '${config.ttsModel}' downloaded`);
    });
    vi.stubGlobal('fetch', fetch);

    const gateway = createOpenAiGateway(config);

    await expect(
      gateway.synthesize({
        input: 'hello world',
        model: config.ttsModel,
        voice: config.ttsVoice,
        responseFormat: 'wav',
      }),
    ).resolves.toMatchObject({
      contentType: 'audio/wav',
      model: config.ttsModel,
      voice: config.ttsVoice,
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(debugSpy).toHaveBeenCalledWith(
      '[min-speech-service] upstream synthesis request',
      expect.objectContaining({
        model: config.ttsModel,
        voice: config.ttsVoice,
        responseFormat: 'wav',
        inputLength: 'hello world'.length,
      }),
    );
    expect(debugSpy).toHaveBeenCalledWith(
      '[min-speech-service] upstream model download started',
      expect.objectContaining({
        operation: 'Speech synthesis',
        model: config.ttsModel,
      }),
    );
    expect(debugSpy).toHaveBeenCalledWith(
      '[min-speech-service] upstream model download completed',
      expect.objectContaining({
        operation: 'Speech synthesis',
        model: config.ttsModel,
      }),
    );
    debugSpy.mockRestore();
  });

  it('downloads a missing transcription model and retries once', async () => {
    const model = config.zhTwSttModel;
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = `${input}`;

      if (url === 'http://127.0.0.1:8000/v1/audio/transcriptions') {
        if (
          fetch.mock.calls.filter(([calledUrl]) => `${calledUrl}` === url)
            .length === 1
        ) {
          return new Response(
            JSON.stringify({
              detail: `Model '${model}' is not installed locally.`,
            }),
            {
              status: 404,
              statusText: 'Not Found',
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );
        }

        return new Response(
          JSON.stringify({
            text: '你好，世界',
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
      }

      expect(url).toBe(
        `http://127.0.0.1:8000/v1/models/${encodeURIComponent(model)}`,
      );
      expect(init?.method).toBe('POST');

      return new Response(`Model '${model}' downloaded`);
    });
    vi.stubGlobal('fetch', fetch);

    const gateway = createOpenAiGateway(config);

    await expect(
      gateway.transcribe({
        audio: new Uint8Array([1, 2, 3]),
        filename: 'clip.wav',
        mediaType: 'audio/wav',
        language: 'zh-TW',
        model,
        responseFormat: 'json',
      }),
    ).resolves.toMatchObject({
      text: '你好，世界',
      raw: {
        text: '你好，世界',
      },
    });

    expect(
      fetch.mock.calls.filter(
        ([calledUrl]) =>
          `${calledUrl}` === 'http://127.0.0.1:8000/v1/audio/transcriptions',
      ),
    ).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:8000/v1/models/${encodeURIComponent(model)}`,
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('distinguishes post-download synthesis failures from download failures', async () => {
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = `${input}`;

      if (url === 'http://127.0.0.1:8000/v1/audio/speech') {
        if (
          fetch.mock.calls.filter(([calledUrl]) => `${calledUrl}` === url)
            .length === 1
        ) {
          return new Response(
            JSON.stringify({
              detail: `Model '${config.ttsModel}' is not installed locally.`,
            }),
            {
              status: 404,
              statusText: 'Not Found',
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );
        }

        return new Response(
          JSON.stringify({
            detail: `Voice '${config.ttsVoice}' failed to initialize.`,
          }),
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
      }

      expect(url).toBe(
        `http://127.0.0.1:8000/v1/models/${encodeURIComponent(config.ttsModel)}`,
      );
      expect(init?.method).toBe('POST');

      return new Response(`Model '${config.ttsModel}' downloaded`);
    });
    vi.stubGlobal('fetch', fetch);

    const gateway = createOpenAiGateway(config);

    await expect(
      gateway.synthesize({
        input: 'hello world',
        model: config.ttsModel,
        voice: config.ttsVoice,
        responseFormat: 'wav',
      }),
    ).rejects.toThrow(
      `Speech synthesis failed for model "${config.ttsModel}" after its automatic download completed because the upstream speech backend returned 500`,
    );
  });

  it('checks the configured NLP model and parses structured text processing', async () => {
    const fetch = vi.fn(async (input: string | URL) => {
      const url = `${input}`;

      if (url.includes('/models')) {
        return new Response(
          JSON.stringify({
            object: 'list',
            data: [
              {
                id: config.nlpModel,
                object: 'model',
                created: 1,
                owned_by: 'lm-studio',
              },
            ],
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
      }

      if (url === 'http://127.0.0.1:1234/v1/chat/completions') {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            created: 1,
            model: config.nlpModel,
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    detectedLanguage: 'en',
                    intent: 'Ask to share the project status',
                    cleanedText: 'Can you share the project status?',
                    rewrittenText: 'Can you share the project status?',
                    translatedText: 'Can you share the project status?',
                    fillerWords: ['um'],
                  }),
                },
              },
            ],
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);

    const gateway = createOpenAiGateway(config);

    await expect(gateway.checkNlpUpstream()).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      gateway.processText({
        input: 'um can you share the project status?',
        targetLanguage: 'en',
      }),
    ).resolves.toMatchObject({
      intent: 'Ask to share the project status',
      fillerWords: ['um'],
      model: config.nlpModel,
    });
  });
});
