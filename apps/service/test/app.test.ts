import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { SpeechService } from '../src/service.js';

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

const createService = (): SpeechService => ({
  getCapabilities: () => ({
    provider: 'openai-compatible',
    upstreamBaseUrl: config.apiBaseUrl,
    transcription: {
      endpoint: '/v1/audio/transcriptions',
      model: config.sttModel,
      responseFormats: ['text', 'json', 'verbose_json', 'srt', 'vtt'],
      languagePresets: [{ language: 'zh-TW', model: config.zhTwSttModel }],
    },
    synthesis: {
      endpoint: '/v1/audio/speech',
      model: config.ttsModel,
      defaultVoice: config.ttsVoice,
      responseFormats: ['mp3', 'wav', 'flac', 'pcm'],
      languagePresets: [
        {
          language: 'zh-TW',
          model: config.zhTwTtsModel,
          defaultVoice: config.zhTwTtsVoice,
        },
      ],
    },
    realtime: {
      supported: false,
    },
    textProcessing: {
      endpoint: '/v1/npl',
      model: config.nlpModel,
      targetLanguage: config.nlpTargetLanguage,
      features: [
        'intent-detection',
        'filler-word-removal',
        'message-rewrite',
        'translation',
      ],
    },
  }),
  getHealth: vi.fn(async () => ({
    ok: true,
    provider: 'openai-compatible' as const,
    upstreamOk: true,
    upstreamBaseUrl: config.apiBaseUrl,
    sttModel: config.sttModel,
    ttsModel: config.ttsModel,
    defaultVoice: config.ttsVoice,
    nlpModel: config.nlpModel,
    nlpUpstreamOk: true,
    nlpUpstreamBaseUrl: config.nlpBaseUrl,
  })),
  transcribe: vi.fn(async () => ({
    text: 'hello world',
    raw: { text: 'hello world' },
    model: config.sttModel,
  })),
  synthesize: vi.fn(async () => ({
    audio: new Uint8Array([82, 73, 70, 70]),
    contentType: 'audio/wav',
    model: config.ttsModel,
    voice: config.ttsVoice,
  })),
  processText: vi.fn(async () => ({
    sourceText: 'um can you email the summary',
    detectedLanguage: 'en',
    intent: 'Ask to email the summary',
    cleanedText: 'can you email the summary',
    rewrittenText: 'Can you email the summary?',
    translatedText: 'Can you email the summary?',
    targetLanguage: 'en',
    fillerWords: ['um'],
    model: config.nlpModel,
    provider: 'openai-compatible' as const,
    raw: { ok: true },
  })),
});

describe('createApp', () => {
  it('serves health and capabilities', async () => {
    const app = createApp(config, createService());

    const healthResponse = await app.request('/health');
    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toMatchObject({
      ok: true,
      upstreamOk: true,
    });

    const capabilitiesResponse = await app.request('/v1/capabilities');
    expect(capabilitiesResponse.status).toBe(200);
    await expect(capabilitiesResponse.json()).resolves.toMatchObject({
      provider: 'openai-compatible',
      textProcessing: {
        endpoint: '/v1/npl',
      },
    });
  });

  it('serves the showcase PWA shell', async () => {
    const app = createApp(config, createService());

    const rootResponse = await app.request('/');
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get('Content-Type')).toContain('text/html');
    await expect(rootResponse.text()).resolves.toContain('/assets/app.js');

    const manifestResponse = await app.request('/manifest.webmanifest');
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.headers.get('Content-Type')).toContain(
      'application/manifest+json',
    );
  });

  it('transcribes a multipart upload', async () => {
    const service = createService();
    const app = createApp(config, service);
    const body = new FormData();
    body.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'recording.webm', {
        type: 'audio/webm',
      }),
    );
    body.append('language', 'en');

    const response = await app.request('/v1/audio/transcriptions', {
      method: 'POST',
      body,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: 'hello world',
      provider: 'openai-compatible',
    });
    expect(service.transcribe).toHaveBeenCalledOnce();
  });

  it('returns audio bytes for synthesis', async () => {
    const service = createService();
    const app = createApp(config, service);

    const response = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: 'Hello from the test suite',
        language: 'zh-TW',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect(await response.arrayBuffer()).toBeInstanceOf(ArrayBuffer);
    expect(service.synthesize).toHaveBeenCalledOnce();
    expect(service.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'Hello from the test suite',
        language: 'zh-TW',
      }),
    );
  });

  it('logs synthesis request metadata and failures', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService();
    service.synthesize = vi.fn(async () => {
      throw new Error('synthetic synthesis failure');
    });
    const app = createApp(config, service);

    const response = await app.request('/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: 'Hello from the test suite',
        language: 'zh-TW',
      }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'synthetic synthesis failure',
    });
    expect(debugSpy).toHaveBeenCalledWith(
      '[min-speech-service] synthesis request parsed',
      expect.objectContaining({
        language: 'zh-TW',
        model: null,
        voice: null,
        responseFormat: null,
        speed: null,
        inputLength: 'Hello from the test suite'.length,
      }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[min-speech-service] request failed',
      expect.objectContaining({
        method: 'POST',
        path: '/v1/audio/speech',
        error: 'synthetic synthesis failure',
      }),
    );
    debugSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('processes text with the NLP endpoint', async () => {
    const service = createService();
    const app = createApp(config, service);

    const response = await app.request('/v1/npl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: 'um can you email the summary',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      intent: 'Ask to email the summary',
      fillerWords: ['um'],
    });
    expect(service.processText).toHaveBeenCalledOnce();
  });

  it('keeps the legacy text-processing endpoint as an alias', async () => {
    const service = createService();
    const app = createApp(config, service);

    const response = await app.request('/v1/text/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: 'um can you email the summary',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      intent: 'Ask to email the summary',
    });
    expect(service.processText).toHaveBeenCalledOnce();
  });
});
