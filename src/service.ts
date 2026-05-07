import type { AppConfig } from './config.js';
import type {
  SpeechCapabilities,
  SpeechHealthStatus,
  SpeechSynthesisRequest,
  TranscriptionOptions,
} from './contracts.js';
import { capabilitiesSchema, healthStatusSchema } from './contracts.js';
import type { SpeechGateway } from './gateway.js';

const normalizeLanguageTag = (language?: string) =>
  language?.trim().toLowerCase().replace(/_/g, '-');

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

const resolveTranscriptionModel = (config: AppConfig, language?: string) =>
  isTraditionalChineseLanguage(language)
    ? config.zhTwSttModel
    : config.sttModel;

const resolveSynthesisDefaults = (config: AppConfig, language?: string) =>
  isTraditionalChineseLanguage(language)
    ? {
        model: config.zhTwTtsModel,
        voice: config.zhTwTtsVoice,
      }
    : {
        model: config.ttsModel,
        voice: config.ttsVoice,
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
            language: 'zh-TW',
            model: config.zhTwTtsModel,
            defaultVoice: config.zhTwTtsVoice,
          },
        ],
      },
      realtime: {
        supported: false,
      },
    });
  },
  async getHealth() {
    const upstream = await gateway.checkUpstream();
    return healthStatusSchema.parse({
      ok: upstream.ok,
      provider: config.provider,
      upstreamOk: upstream.ok,
      upstreamBaseUrl: config.apiBaseUrl,
      sttModel: config.sttModel,
      ttsModel: config.ttsModel,
      defaultVoice: config.ttsVoice,
      detail: upstream.detail,
    });
  },
  async transcribe(file, options) {
    const audio = new Uint8Array(await file.arrayBuffer());
    const model =
      options?.model ?? resolveTranscriptionModel(config, options?.language);
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

    return gateway.synthesize({
      input: request.input,
      voice: request.voice ?? defaults.voice,
      model: request.model ?? defaults.model,
      responseFormat: request.responseFormat ?? config.ttsResponseFormat,
      ...(typeof request.speed === 'number' ? { speed: request.speed } : {}),
    });
  },
});
