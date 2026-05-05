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
  sttResponseFormat: 'json',
  ttsModel: 'speaches-ai/Kokoro-82M-v1.0-ONNX',
  ttsVoice: 'af_heart',
  ttsResponseFormat: 'wav',
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
    },
    synthesis: {
      endpoint: '/v1/audio/speech',
      model: config.ttsModel,
      defaultVoice: config.ttsVoice,
      responseFormats: ['mp3', 'wav', 'flac', 'aac', 'opus', 'pcm'],
    },
    realtime: {
      supported: true,
      upstreamEndpoint: `${config.apiBaseUrl}/realtime`,
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
    });
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
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect(await response.arrayBuffer()).toBeInstanceOf(ArrayBuffer);
    expect(service.synthesize).toHaveBeenCalledOnce();
  });
});
