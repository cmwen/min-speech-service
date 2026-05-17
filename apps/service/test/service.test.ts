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
  nlpBaseUrl: 'http://127.0.0.1:1234/v1',
  nlpApiKey: 'lm-studio',
  nlpModel: 'gemma-4-e4b',
  nlpTargetLanguage: 'en',
  allowedOrigins: ['*'],
};

describe('createSpeechService', () => {
  it('uses configured defaults and surfaces health', async () => {
    const gateway = {
      checkUpstream: vi.fn(async () => ({ ok: true })),
      checkNlpUpstream: vi.fn(async () => ({ ok: true })),
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
      processText: vi.fn(async () => ({
        detectedLanguage: 'en',
        intent: 'Ask for a meeting update',
        cleanedText: 'Can you share the meeting update?',
        rewrittenText: 'Can you share the meeting update?',
        translatedText: 'Can you share the meeting update?',
        fillerWords: ['um'],
        raw: { ok: true },
        model: config.nlpModel,
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
    expect(gateway.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'Hello',
        model: config.ttsModel,
        voice: config.ttsVoice,
      }),
    );
    await expect(
      service.processText({
        input: 'um can you share the meeting update?',
      }),
    ).resolves.toMatchObject({
      detectedLanguage: 'en',
      targetLanguage: 'en',
      model: config.nlpModel,
    });
  });

  it('switches to zh-TW model defaults when language is provided', async () => {
    const gateway = {
      checkUpstream: vi.fn(async () => ({ ok: true })),
      checkNlpUpstream: vi.fn(async () => ({ ok: true })),
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
      processText: vi.fn(async () => ({
        detectedLanguage: 'zh-TW',
        intent: '請求整理訊息',
        cleanedText: '請幫我整理這段訊息。',
        rewrittenText: '請幫我整理這段訊息。',
        translatedText: 'Please clean up this message.',
        fillerWords: ['嗯'],
        raw: { ok: true },
        model: config.nlpModel,
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
        input: 'ni3 hao3 ， huan1 ying2 shi3 yong4 yu3 yin1 fu2 wu4 。',
        model: config.zhTwTtsModel,
        voice: config.zhTwTtsVoice,
      }),
    );
    await expect(
      service.processText({
        input: '嗯，請幫我整理這段訊息。',
        language: 'zh-TW',
      }),
    ).resolves.toMatchObject({
      detectedLanguage: 'zh-TW',
      translatedText: 'Please clean up this message.',
    });
    expect(gateway.processText).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'zh-TW',
        targetLanguage: 'en',
      }),
    );
  });

  it('switches to the Chinese preset for a generic zh language hint', async () => {
    const gateway = {
      checkUpstream: vi.fn(async () => ({ ok: true })),
      checkNlpUpstream: vi.fn(async () => ({ ok: true })),
      transcribe: vi.fn(async () => ({
        text: '你好，世界',
        raw: { text: '你好，世界' },
      })),
      synthesize: vi.fn(async (request) => ({
        audio: new Uint8Array([1, 2, 3]),
        contentType: 'audio/wav',
        model: request.model,
        voice: request.voice,
      })),
      processText: vi.fn(async () => ({
        detectedLanguage: 'zh',
        intent: '請求整理訊息',
        cleanedText: '請幫我整理這段訊息。',
        rewrittenText: '請幫我整理這段訊息。',
        translatedText: 'Please clean up this message.',
        fillerWords: [],
        raw: { ok: true },
        model: config.nlpModel,
      })),
    };
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const service = createSpeechService(config, gateway);
    const file = new File([new Uint8Array([7, 8, 9])], 'clip.webm', {
      type: 'audio/webm',
    });

    await expect(
      service.transcribe(file, { language: 'zh' }),
    ).resolves.toMatchObject({
      text: '你好，世界',
      model: config.zhTwSttModel,
    });
    await expect(
      service.synthesize({
        input: '你好，歡迎使用語音服務。',
        language: 'zh',
      }),
    ).resolves.toMatchObject({
      model: config.zhTwTtsModel,
      voice: config.zhTwTtsVoice,
    });

    expect(gateway.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'zh',
        model: config.zhTwSttModel,
      }),
    );
    expect(gateway.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'ni3 hao3 ， huan1 ying2 shi3 yong4 yu3 yin1 fu2 wu4 。',
        model: config.zhTwTtsModel,
        voice: config.zhTwTtsVoice,
      }),
    );
    expect(service.getCapabilities()).toMatchObject({
      transcription: {
        languagePresets: expect.arrayContaining([
          expect.objectContaining({
            language: 'zh',
            model: config.zhTwSttModel,
          }),
        ]),
      },
      synthesis: {
        languagePresets: expect.arrayContaining([
          expect.objectContaining({
            language: 'zh',
            model: config.zhTwTtsModel,
            defaultVoice: config.zhTwTtsVoice,
          }),
        ]),
      },
    });
    expect(debugSpy).toHaveBeenCalledWith(
      '[min-speech-service] transcribe model selection',
      expect.objectContaining({
        requestedLanguage: 'zh',
        normalizedLanguage: 'zh',
        preset: 'zh',
        selectedModel: config.zhTwSttModel,
      }),
    );
    expect(debugSpy).toHaveBeenCalledWith(
      '[min-speech-service] synthesize model selection',
      expect.objectContaining({
        requestedLanguage: 'zh',
        normalizedLanguage: 'zh',
        preset: 'zh',
        selectedModel: config.zhTwTtsModel,
        selectedVoice: config.zhTwTtsVoice,
        inputTransform: 'pinyin-num',
      }),
    );
    debugSpy.mockRestore();
  });
});
