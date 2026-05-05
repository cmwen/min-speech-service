import OpenAI from 'openai';

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

export const createOpenAiGateway = (config: AppConfig): SpeechGateway => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBaseUrl,
  });

  return {
    async checkUpstream() {
      try {
        await client.models.list();
        return { ok: true };
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Unknown upstream error';
        return { ok: false, detail };
      }
    },
    async transcribe(input) {
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

      const response = await client.audio.transcriptions.create({
        ...request,
        ...(input.language ? { language: input.language } : {}),
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(typeof input.temperature === 'number'
          ? { temperature: input.temperature }
          : {}),
      });

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
      const response = await client.audio.speech.create({
        input: input.input,
        model: input.model,
        voice: input.voice,
        response_format: input.responseFormat,
        ...(typeof input.speed === 'number' ? { speed: input.speed } : {}),
      });

      return {
        audio: new Uint8Array(await response.arrayBuffer()),
        contentType: contentTypeByFormat[input.responseFormat],
        model: input.model,
        voice: input.voice,
      };
    },
  };
};
