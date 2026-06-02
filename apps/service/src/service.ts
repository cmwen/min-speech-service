import { pinyin } from 'pinyin-pro';

import type { AppConfig } from './config.js';
import type {
  SpeechCapabilities,
  SpeechHealthStatus,
  SpeechSynthesisRequest,
  TextProcessingRequest,
  TextProcessingResult,
  TranscriptionOptions,
} from './contracts.js';
import { capabilitiesSchema, healthStatusSchema } from './contracts.js';
import type { SpeechGateway } from './gateway.js';

const normalizeLanguageTag = (language?: string) =>
  language?.trim().toLowerCase().replace(/_/g, '-');

const isChineseLanguage = (language?: string) => {
  const normalized = normalizeLanguageTag(language);

  if (!normalized) {
    return false;
  }

  return (
    normalized === 'zh' ||
    normalized === 'cmn' ||
    normalized.startsWith('zh-') ||
    normalized.startsWith('cmn-')
  );
};

const isTraditionalChineseLanguage = (language?: string) => {
  const normalized = normalizeLanguageTag(language);

  if (!normalized) {
    return false;
  }

  return (
    normalized === 'zh-tw' ||
    normalized === 'zh-hant' ||
    normalized === 'cmn-hant-tw' ||
    normalized.endsWith('-tw') ||
    normalized.includes('-hant')
  );
};

const hanScriptPattern = /\p{Script=Han}/u;

const isChinesePiperSynthesisModel = (model: string) => {
  const normalized = model.trim().toLowerCase();

  return normalized.includes('piper') && normalized.includes('zh');
};

const normalizeSynthesisInput = (input: string, model: string) => {
  if (!isChinesePiperSynthesisModel(model) || !hanScriptPattern.test(input)) {
    return {
      input,
      inputTransform: null,
    };
  }

  const romanizedInput = pinyin(input, { toneType: 'num' })
    .replace(/\s+/g, ' ')
    .trim();

  return {
    input: romanizedInput.length > 0 ? romanizedInput : input,
    inputTransform: romanizedInput.length > 0 ? 'pinyin-num' : null,
  };
};

const resolveTranscriptionModel = (config: AppConfig, language?: string) =>
  isChineseLanguage(language) ? config.zhTwSttModel : config.sttModel;

const resolveSynthesisDefaults = (config: AppConfig, language?: string) =>
  isChineseLanguage(language)
    ? {
        model: config.zhTwTtsModel,
        voice: config.zhTwTtsVoice,
      }
    : {
        model: config.ttsModel,
        voice: config.ttsVoice,
      };

const logSpeechDebug = (message: string, details: Record<string, unknown>) => {
  console.debug(`[min-speech-service] ${message}`, details);
};

export type SpeechService = {
  getCapabilities: () => SpeechCapabilities;
  getHealth: () => Promise<SpeechHealthStatus>;
  transcribe: (
    file: File,
    options?: TranscriptionOptions,
  ) => Promise<{ text: string; raw: unknown; model: string }>;
  synthesize: (request: SpeechSynthesisRequest) => Promise<{
    audio: Uint8Array;
    contentType: string;
    model: string;
    voice: string;
  }>;
  processText: (
    request: TextProcessingRequest,
  ) => Promise<TextProcessingResult>;
};

export const createSpeechService = (
  config: AppConfig,
  gateway: SpeechGateway,
): SpeechService => ({
  getCapabilities() {
    return capabilitiesSchema.parse({
      provider: config.provider,
      upstreamBaseUrl: config.apiBaseUrl,
      transcription: {
        endpoint: '/v1/audio/transcriptions',
        model: config.sttModel,
        responseFormats: ['text', 'json', 'verbose_json', 'srt', 'vtt'],
        languagePresets: [
          {
            language: 'zh',
            model: config.zhTwSttModel,
          },
          {
            language: 'zh-TW',
            model: config.zhTwSttModel,
          },
        ],
      },
      synthesis: {
        endpoint: '/v1/audio/speech',
        model: config.ttsModel,
        defaultVoice: config.ttsVoice,
        responseFormats: ['mp3', 'wav', 'flac', 'pcm'],
        languagePresets: [
          {
            language: 'zh',
            model: config.zhTwTtsModel,
            defaultVoice: config.zhTwTtsVoice,
          },
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
    });
  },
  async getHealth() {
    const [speechUpstream, nlpUpstream] = await Promise.all([
      gateway.checkUpstream(),
      gateway.checkNlpUpstream(),
    ]);
    const detail = [speechUpstream.detail, nlpUpstream.detail]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');

    return healthStatusSchema.parse({
      ok: speechUpstream.ok && nlpUpstream.ok,
      provider: config.provider,
      upstreamOk: speechUpstream.ok && nlpUpstream.ok,
      upstreamBaseUrl: config.apiBaseUrl,
      sttModel: config.sttModel,
      ttsModel: config.ttsModel,
      defaultVoice: config.ttsVoice,
      nlpModel: config.nlpModel,
      nlpUpstreamOk: nlpUpstream.ok,
      nlpUpstreamBaseUrl: config.nlpBaseUrl,
      ...(detail ? { detail } : {}),
    });
  },
  async transcribe(file, options) {
    const audio = new Uint8Array(await file.arrayBuffer());
    const normalizedLanguage = normalizeLanguageTag(options?.language);
    const model =
      options?.model ?? resolveTranscriptionModel(config, options?.language);
    logSpeechDebug('transcribe model selection', {
      filename: file.name || 'upload.wav',
      mimeType: file.type || 'application/octet-stream',
      requestedLanguage: options?.language ?? null,
      normalizedLanguage: normalizedLanguage ?? null,
      preset:
        options?.model === undefined && isChineseLanguage(options?.language)
          ? isTraditionalChineseLanguage(options?.language)
            ? 'zh-traditional'
            : 'zh'
          : null,
      selectedModel: model,
      responseFormat: options?.responseFormat ?? config.sttResponseFormat,
      hasPrompt: Boolean(options?.prompt),
      temperature: options?.temperature ?? null,
    });
    const request = {
      audio,
      filename: file.name || 'upload.wav',
      mediaType: file.type || 'application/octet-stream',
      model,
      responseFormat: options?.responseFormat ?? config.sttResponseFormat,
      ...(options?.language ? { language: options.language } : {}),
      ...(options?.prompt ? { prompt: options.prompt } : {}),
      ...(typeof options?.temperature === 'number'
        ? { temperature: options.temperature }
        : {}),
    };
    const result = await gateway.transcribe(request);

    return {
      ...result,
      model,
    };
  },
  async synthesize(request) {
    const defaults = resolveSynthesisDefaults(config, request.language);
    const model = request.model ?? defaults.model;
    const voice = request.voice ?? defaults.voice;
    const normalizedInput = normalizeSynthesisInput(request.input, model);
    logSpeechDebug('synthesize model selection', {
      requestedLanguage: request.language ?? null,
      normalizedLanguage: normalizeLanguageTag(request.language) ?? null,
      preset: isChineseLanguage(request.language)
        ? isTraditionalChineseLanguage(request.language)
          ? 'zh-traditional'
          : 'zh'
        : null,
      selectedModel: model,
      selectedVoice: voice,
      responseFormat: request.responseFormat ?? config.ttsResponseFormat,
      speed: request.speed ?? null,
      inputTransform: normalizedInput.inputTransform,
    });

    return gateway.synthesize({
      input: normalizedInput.input,
      voice,
      model,
      responseFormat: request.responseFormat ?? config.ttsResponseFormat,
      ...(typeof request.speed === 'number' ? { speed: request.speed } : {}),
    });
  },
  async processText(request) {
    const targetLanguage = request.targetLanguage ?? config.nlpTargetLanguage;
    const result = await gateway.processText({
      input: request.input,
      ...(request.language ? { language: request.language } : {}),
      targetLanguage,
    });

    return {
      sourceText: request.input,
      detectedLanguage: result.detectedLanguage,
      intent: result.intent,
      cleanedText: result.cleanedText,
      rewrittenText: result.rewrittenText,
      translatedText: result.translatedText,
      targetLanguage,
      fillerWords: result.fillerWords,
      model: result.model,
      provider: config.provider,
      raw: result.raw,
    };
  },
});
