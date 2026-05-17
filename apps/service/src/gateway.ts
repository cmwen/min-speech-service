import OpenAI, { APIError } from 'openai';
import { z } from 'zod';

import type { AppConfig } from './config.js';
import type {
  SpeechAudioFormat,
  TextProcessingGatewayResult,
} from './contracts.js';
import { textProcessingGatewayResultSchema } from './contracts.js';

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

export type ProcessTextInput = {
  input: string;
  language?: string;
  targetLanguage: string;
};

export type SpeechGateway = {
  checkUpstream: () => Promise<{ ok: boolean; detail?: string }>;
  checkNlpUpstream: () => Promise<{ ok: boolean; detail?: string }>;
  transcribe: (
    input: TranscribeInput,
  ) => Promise<{ text: string; raw: unknown }>;
  synthesize: (input: SynthesizeInput) => Promise<{
    audio: Uint8Array;
    contentType: string;
    model: string;
    voice: string;
  }>;
  processText: (
    input: ProcessTextInput,
  ) => Promise<TextProcessingGatewayResult & { raw: unknown; model: string }>;
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

const logGatewayDebug = (message: string, details: Record<string, unknown>) => {
  console.debug(`[min-speech-service] ${message}`, details);
};

const logGatewayError = (message: string, details: Record<string, unknown>) => {
  console.error(`[min-speech-service] ${message}`, details);
};

const nlpSystemPrompt = `You are the NLP processing layer for a speech assistant.
Return only valid JSON with this exact shape:
{
  "detectedLanguage": "BCP-47 language tag or plain language name",
  "intent": "one concise sentence describing the user's intent",
  "cleanedText": "the original message with filler words like um, uh, hum, ah removed",
  "rewrittenText": "a clear rewritten version of the message in the user's original language",
  "translatedText": "the rewritten message translated into the requested target language",
  "fillerWords": ["list", "of", "removed", "fillers"]
}
Rules:
- Preserve the user's meaning.
- Remove filler words and verbal hesitation only.
- If the message is already concise, keep cleanedText and rewrittenText close to the source.
- Always provide translatedText in the requested target language.
- Do not wrap the JSON in markdown fences.
- Do not add any extra keys.`;

const stripMarkdownCodeFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/u, '');

const extractJsonObject = (value: string) => {
  const normalized = stripMarkdownCodeFence(value);
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error('The upstream NLP response did not include a JSON object.');
  }

  return normalized.slice(start, end + 1);
};

const parseTextProcessingResponse = (
  value: string,
): TextProcessingGatewayResult => {
  try {
    return textProcessingGatewayResultSchema.parse(
      JSON.parse(extractJsonObject(value)),
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new Error(
        'The upstream NLP response was not valid structured JSON.',
      );
    }

    throw error;
  }
};

export const createOpenAiGateway = (config: AppConfig): SpeechGateway => {
  const speechClient = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBaseUrl,
  });
  const nlpClient = new OpenAI({
    apiKey: config.nlpApiKey,
    baseURL: config.nlpBaseUrl,
  });
  const authHeaders = (apiKey: string) =>
    new Headers({
      Authorization: `Bearer ${apiKey}`,
    });
  const buildModelDownloadUrl = (baseUrl: string, modelId: string) =>
    `${baseUrl}/models/${encodeURIComponent(modelId)}`;
  const ensureModelDownloaded = async (operation: string, modelId: string) => {
    const url = buildModelDownloadUrl(config.apiBaseUrl, modelId);
    logGatewayDebug('upstream model download started', {
      operation,
      model: modelId,
      url,
    });
    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(config.apiKey),
    });

    if (response.ok) {
      logGatewayDebug('upstream model download completed', {
        operation,
        model: modelId,
        status: `${response.status} ${response.statusText}`.trim(),
      });
      return;
    }

    const detail = getUpstreamErrorDetail(await response.text());
    const status = `${response.status} ${response.statusText}`.trim();
    logGatewayError('upstream model download failed', {
      operation,
      model: modelId,
      status,
      detail: detail ?? null,
    });

    throw new Error(
      detail
        ? `The upstream speech backend could not download model "${modelId}" (${status}): ${detail}`
        : `The upstream speech backend could not download model "${modelId}" (${status}).`,
    );
  };
  const describeMissingConfiguredModels = (modelIds: Set<string>) => {
    const missingModels = [
      {
        envKey: 'STT_MODEL',
        modelId: config.sttModel,
      },
      {
        envKey: 'STT_MODEL_ZH_TW',
        modelId: config.zhTwSttModel,
      },
      {
        envKey: 'TTS_MODEL',
        modelId: config.ttsModel,
      },
      {
        envKey: 'TTS_MODEL_ZH_TW',
        modelId: config.zhTwTtsModel,
      },
    ]
      .filter(({ modelId }) => !modelIds.has(modelId))
      .map(({ envKey, modelId }) => `${envKey} "${modelId}"`);

    if (missingModels.length === 0) {
      return undefined;
    }

    return `Configured upstream models are not installed locally: ${missingModels.join(
      ', ',
    )}. For speaches, download them with POST /v1/models/{model_id} or preload them.`;
  };
  const describeMissingConfiguredNlpModel = (modelIds: Set<string>) => {
    if (modelIds.has(config.nlpModel)) {
      return undefined;
    }

    return `Configured LM Studio model "${config.nlpModel}" is not loaded. Load it in LM Studio or point NLP_MODEL at an available model.`;
  };
  const toUpstreamError = (
    operation: string,
    upstreamName: string,
    error: APIError,
    context?: {
      modelId?: string;
      retryState?: 'initial' | 'after-model-download';
    },
  ) => {
    const detail = getUpstreamErrorDetail(error.error) ?? error.message;
    const status =
      typeof error.status === 'number' ? `${error.status}` : 'unknown';
    const modelDetail = context?.modelId
      ? ` for model "${context.modelId}"`
      : '';
    const retryDetail =
      context?.retryState === 'after-model-download'
        ? ' after its automatic download completed'
        : '';

    return new Error(
      detail
        ? `${operation} failed${modelDetail}${retryDetail} because the upstream ${upstreamName} returned ${status}: ${detail}`
        : `${operation} failed${modelDetail}${retryDetail} because the upstream ${upstreamName} returned ${status}.`,
    );
  };
  const synthesizeWithRetry = async (
    input: SynthesizeInput,
    retryState: 'initial' | 'after-model-download',
  ) => {
    try {
      return await speechClient.audio.speech.create({
        input: input.input,
        model: input.model,
        voice: input.voice,
        response_format: input.responseFormat,
        ...(typeof input.speed === 'number' ? { speed: input.speed } : {}),
      });
    } catch (error) {
      if (
        retryState === 'initial' &&
        error instanceof APIError &&
        error.status === 404
      ) {
        await ensureModelDownloaded('Speech synthesis', input.model);
        return synthesizeWithRetry(input, 'after-model-download');
      }

      if (error instanceof APIError) {
        throw toUpstreamError('Speech synthesis', 'speech backend', error, {
          modelId: input.model,
          retryState,
        });
      }

      throw error;
    }
  };
  const transcribeWithRetry = async (
    input: TranscribeInput,
    retryState: 'initial' | 'after-model-download',
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
      return await speechClient.audio.transcriptions.create({
        ...request,
        ...(input.language ? { language: input.language } : {}),
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(typeof input.temperature === 'number'
          ? { temperature: input.temperature }
          : {}),
      });
    } catch (error) {
      if (
        retryState === 'initial' &&
        error instanceof APIError &&
        error.status === 404
      ) {
        await ensureModelDownloaded('Transcription', input.model);
        return transcribeWithRetry(input, 'after-model-download');
      }

      if (error instanceof APIError) {
        throw toUpstreamError('Transcription', 'speech backend', error, {
          modelId: input.model,
          retryState,
        });
      }

      throw error;
    }
  };

  return {
    async checkUpstream() {
      try {
        const models = await speechClient.models.list();
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
    async checkNlpUpstream() {
      try {
        const models = await nlpClient.models.list();
        const modelIds = new Set(
          models.data.filter(hasModelId).map((model) => model.id),
        );
        const missingConfiguredModel =
          describeMissingConfiguredNlpModel(modelIds);

        if (missingConfiguredModel) {
          return { ok: false, detail: missingConfiguredModel };
        }

        return { ok: true };
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Unknown upstream error';
        return { ok: false, detail };
      }
    },
    async transcribe(input) {
      logGatewayDebug('upstream transcription request', {
        filename: input.filename,
        mediaType: input.mediaType,
        language: input.language ?? null,
        model: input.model,
        responseFormat: input.responseFormat,
        hasPrompt: Boolean(input.prompt),
        temperature: input.temperature ?? null,
      });
      const response = await transcribeWithRetry(input, 'initial');

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
      logGatewayDebug('upstream synthesis request', {
        model: input.model,
        voice: input.voice,
        responseFormat: input.responseFormat,
        speed: input.speed ?? null,
        inputLength: input.input.length,
      });
      const response = await synthesizeWithRetry(input, 'initial');

      return {
        audio: new Uint8Array(await response.arrayBuffer()),
        contentType: contentTypeByFormat[input.responseFormat],
        model: input.model,
        voice: input.voice,
      };
    },
    async processText(input) {
      try {
        const response = await nlpClient.chat.completions.create({
          model: config.nlpModel,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: nlpSystemPrompt,
            },
            {
              role: 'user',
              content: JSON.stringify({
                input: input.input,
                language: input.language ?? null,
                targetLanguage: input.targetLanguage,
              }),
            },
          ],
        });
        const content = response.choices[0]?.message?.content;

        if (typeof content !== 'string' || content.trim().length === 0) {
          throw new Error('The upstream NLP response did not include content.');
        }

        return {
          ...parseTextProcessingResponse(content),
          raw: response,
          model: config.nlpModel,
        };
      } catch (error) {
        if (error instanceof APIError) {
          throw toUpstreamError('Text processing', 'LM Studio backend', error);
        }

        throw error;
      }
    },
  };
};
