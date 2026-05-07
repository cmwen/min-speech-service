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
  zhTwSttModel: 'Systran/faster-whisper-small',
  sttResponseFormat: 'json',
  ttsModel: 'speaches-ai/Kokoro-82M-v1.0-ONNX',
  ttsVoice: 'af_heart',
  zhTwTtsModel: 'speaches-ai/piper-zh_CN-huayan-medium',
  zhTwTtsVoice: 'huayan',
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

  it('switches to zh-TW model defaults when language is provided', async () => {
    const gateway = {
      checkUpstream: vi.fn(async () => ({ ok: true })),
      transcribe: vi.fn(async () => ({
        text: '轉錄完成',
        raw: { text: '轉錄完成' },
      })),
      synthesize: vi.fn(async (request) => ({
        audio: new Uint8Array([1, 2, 3]),
        contentType: 'audio/wav',
        model: request.model,
        voice: request.voice,
      })),
    };

    const service = createSpeechService(config, gateway);
    const file = new File([new Uint8Array([7, 8, 9])], 'clip.webm', {
      type: 'audio/webm',
    });

    await expect(
      service.transcribe(file, { language: 'zh-TW' }),
    ).resolves.toMatchObject({
      text: '轉錄完成',
      model: config.zhTwSttModel,
    });

    await expect(
      service.synthesize({
        input: '你好，歡迎使用語音服務。',
        language: 'zh-TW',
      }),
    ).resolves.toMatchObject({
      model: config.zhTwTtsModel,
      voice: config.zhTwTtsVoice,
    });

    expect(gateway.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'zh-TW',
        model: config.zhTwSttModel,
      }),
    );
    expect(gateway.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        model: config.zhTwTtsModel,
        voice: config.zhTwTtsVoice,
      }),
    );
  });
});
