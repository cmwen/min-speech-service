import OpenAI, { APIError } from 'openai';

import type { AppConfig } from './config.js';
import type { SpeechAudioFormat } from './contracts.js';

export type TranscribeInput = {
  audio: Uint8Array;
  filename: string;
  mediaType: string;
  language?: string;
  prompt?: string;
  model: string;
  responseFormat: 'text' | 'json' | 'verbose_json' | 'srt' | 'vtt';
  temperature?: number;
};

export type SynthesizeInput = {
  input: string;
  voice: string;
  model: string;
  responseFormat: SpeechAudioFormat;
  speed?: number;
};

export type SpeechGateway = {
  checkUpstream: () => Promise<{ ok: boolean; detail?: string }>;
  transcribe: (
    input: TranscribeInput,
  ) => Promise<{ text: string; raw: unknown }>;
  synthesize: (input: SynthesizeInput) => Promise<{
    audio: Uint8Array;
    contentType: string;
    model: string;
    voice: string;
  }>;
};

const contentTypeByFormat: Record<SpeechAudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  pcm: 'audio/L16',
};

const hasText = (value: unknown): value is { text: string } =>
  typeof value === 'object' &&
  value !== null &&
  'text' in value &&
  typeof (value as { text?: unknown }).text === 'string';

const hasStringProperty = <TKey extends string>(
  value: unknown,
  key: TKey,
): value is Record<TKey, string> =>
  typeof value === 'object' &&
  value !== null &&
  key in value &&
  typeof (value as Record<TKey, unknown>)[key] === 'string';

const getUpstreamErrorDetail = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (hasStringProperty(value, 'detail')) {
    return value.detail;
  }

  if (hasStringProperty(value, 'message')) {
    return value.message;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error?: unknown }).error === 'object'
  ) {
    return getUpstreamErrorDetail((value as { error?: unknown }).error);
  }

  return undefined;
};

const hasModelId = (value: unknown): value is { id: string } =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof (value as { id?: unknown }).id === 'string';

export const createOpenAiGateway = (config: AppConfig): SpeechGateway => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBaseUrl,
  });
  const authHeaders = () =>
    new Headers({
      Authorization: `Bearer ${config.apiKey}`,
    });
  const buildModelDownloadUrl = (modelId: string) =>
    `${config.apiBaseUrl}/models/${encodeURIComponent(modelId)}`;
  const ensureModelDownloaded = async (modelId: string) => {
    const response = await fetch(buildModelDownloadUrl(modelId), {
      method: 'POST',
      headers: authHeaders(),
    });

    if (response.ok) {
      return;
    }

    const detail = getUpstreamErrorDetail(await response.text());
    const status = `${response.status} ${response.statusText}`.trim();

    throw new Error(
      detail
        ? `The upstream speech backend could not download model "${modelId}" (${status}): ${detail}`
        : `The upstream speech backend could not download model "${modelId}" (${status}).`,
    );
  };
  const describeMissingConfiguredModels = (modelIds: Set<string>) => {
    const missingModels = [
      modelIds.has(config.sttModel) ? null : `STT "${config.sttModel}"`,
      modelIds.has(config.ttsModel) ? null : `TTS "${config.ttsModel}"`,
    ].filter((value): value is string => value !== null);

    if (missingModels.length === 0) {
      return undefined;
    }

    return `Configured upstream models are not installed locally: ${missingModels.join(
      ', ',
    )}. For speaches, download them with POST /v1/models/{model_id} or preload them.`;
  };
  const toSpeechError = (operation: string, error: APIError) => {
    const detail = getUpstreamErrorDetail(error.error) ?? error.message;
    const status =
      typeof error.status === 'number' ? `${error.status}` : 'unknown';

    return new Error(
      detail
        ? `${operation} failed because the upstream speech backend returned ${status}: ${detail}`
        : `${operation} failed because the upstream speech backend returned ${status}.`,
    );
  };
  const synthesizeWithRetry = async (
    input: SynthesizeInput,
    allowModelDownload: boolean,
  ) => {
    try {
      return await client.audio.speech.create({
        input: input.input,
        model: input.model,
        voice: input.voice,
        response_format: input.responseFormat,
        ...(typeof input.speed === 'number' ? { speed: input.speed } : {}),
      });
    } catch (error) {
      if (
        allowModelDownload &&
        error instanceof APIError &&
        error.status === 404
      ) {
        await ensureModelDownloaded(input.model);
        return synthesizeWithRetry(input, false);
      }

      if (error instanceof APIError) {
        throw toSpeechError('Speech synthesis', error);
      }

      throw error;
    }
  };
  const transcribeWithRetry = async (
    input: TranscribeInput,
    allowModelDownload: boolean,
  ) => {
    const audioBuffer = Uint8Array.from(input.audio);
    const file = new File([audioBuffer], input.filename, {
      type: input.mediaType,
    });
    const request = {
      file,
      model: input.model,
      response_format: input.responseFormat,
      stream: false as const,
    };

    try {
      return await client.audio.transcriptions.create({
        ...request,
        ...(input.language ? { language: input.language } : {}),
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(typeof input.temperature === 'number'
          ? { temperature: input.temperature }
          : {}),
      });
    } catch (error) {
      if (
        allowModelDownload &&
        error instanceof APIError &&
        error.status === 404
      ) {
        await ensureModelDownloaded(input.model);
        return transcribeWithRetry(input, false);
      }

      if (error instanceof APIError) {
        throw toSpeechError('Transcription', error);
      }

      throw error;
    }
  };

  return {
    async checkUpstream() {
      try {
        const models = await client.models.list();
        const modelIds = new Set(
          models.data.filter(hasModelId).map((model) => model.id),
        );
        const missingConfiguredModels =
          describeMissingConfiguredModels(modelIds);

        if (missingConfiguredModels) {
          return { ok: false, detail: missingConfiguredModels };
        }

        return { ok: true };
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Unknown upstream error';
        return { ok: false, detail };
      }
    },
    async transcribe(input) {
      const response = await transcribeWithRetry(input, true);

      if (typeof response === 'string') {
        return { text: response, raw: response };
      }

      if (hasText(response)) {
        return { text: response.text, raw: response };
      }

      throw new Error(
        'The upstream transcription response did not include text.',
      );
    },
    async synthesize(input) {
      const response = await synthesizeWithRetry(input, true);

      return {
        audio: new Uint8Array(await response.arrayBuffer()),
        contentType: contentTypeByFormat[input.responseFormat],
        model: input.model,
        voice: input.voice,
      };
    },
  };
};
