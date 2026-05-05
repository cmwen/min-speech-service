import { z } from 'zod';

import type { SpeechAudioFormat } from './contracts.js';

const envSchema = z.object({
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(8790),
  SPEECH_API_BASE_URL: z.string().url().default('http://127.0.0.1:8000/v1'),
  SPEECH_API_KEY: z.string().default('local-no-auth'),
  STT_MODEL: z
    .string()
    .trim()
    .min(1)
    .default('Systran/faster-distil-whisper-small.en'),
  STT_RESPONSE_FORMAT: z
    .enum(['text', 'json', 'verbose_json', 'srt', 'vtt'])
    .default('json'),
  TTS_MODEL: z
    .string()
    .trim()
    .min(1)
    .default('speaches-ai/Kokoro-82M-v1.0-ONNX'),
  TTS_VOICE: z.string().trim().min(1).default('af_heart'),
  TTS_RESPONSE_FORMAT: z.enum(['mp3', 'wav', 'flac', 'pcm']).default('wav'),
  ALLOWED_ORIGINS: z.string().default('*'),
});

export type AppConfig = {
  host: string;
  port: number;
  provider: 'openai-compatible';
  apiBaseUrl: string;
  apiKey: string;
  sttModel: string;
  sttResponseFormat: 'text' | 'json' | 'verbose_json' | 'srt' | 'vtt';
  ttsModel: string;
  ttsVoice: string;
  ttsResponseFormat: SpeechAudioFormat;
  allowedOrigins: string[];
};

export const readConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = envSchema.parse(env);
  const allowedOrigins = parsed.ALLOWED_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    provider: 'openai-compatible',
    apiBaseUrl: parsed.SPEECH_API_BASE_URL.replace(/\/$/, ''),
    apiKey: parsed.SPEECH_API_KEY,
    sttModel: parsed.STT_MODEL,
    sttResponseFormat: parsed.STT_RESPONSE_FORMAT,
    ttsModel: parsed.TTS_MODEL,
    ttsVoice: parsed.TTS_VOICE,
    ttsResponseFormat: parsed.TTS_RESPONSE_FORMAT,
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ['*'],
  };
};
