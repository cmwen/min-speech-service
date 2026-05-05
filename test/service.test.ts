import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../src/config.js';
import { createSpeechService } from '../src/service.js';

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

describe('createSpeechService', () => {
  it('uses configured defaults and surfaces health', async () => {
    const gateway = {
      checkUpstream: vi.fn(async () => ({ ok: true })),
      transcribe: vi.fn(async () => ({
        text: 'transcribed',
        raw: { text: 'transcribed' },
      })),
      synthesize: vi.fn(async () => ({
        audio: new Uint8Array([1, 2, 3]),
        contentType: 'audio/wav',
        model: config.ttsModel,
        voice: config.ttsVoice,
      })),
    };

    const service = createSpeechService(config, gateway);
    const file = new File([new Uint8Array([7, 8, 9])], 'clip.webm', {
      type: 'audio/webm',
    });

    await expect(service.getHealth()).resolves.toMatchObject({
      ok: true,
      upstreamOk: true,
    });
    await expect(service.transcribe(file)).resolves.toMatchObject({
      text: 'transcribed',
      model: config.sttModel,
    });
    await expect(service.synthesize({ input: 'Hello' })).resolves.toMatchObject(
      {
        contentType: 'audio/wav',
        voice: config.ttsVoice,
      },
    );
  });
});
