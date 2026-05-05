import { z } from 'zod';

export const speechAudioFormatSchema = z.enum(['mp3', 'wav', 'flac', 'pcm']);
export const transcriptionResponseFormatSchema = z.enum([
  'text',
  'json',
  'verbose_json',
  'srt',
  'vtt',
]);

export const speechSynthesisRequestSchema = z.object({
  input: z.string().trim().min(1),
  voice: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  responseFormat: speechAudioFormatSchema.optional(),
  speed: z.number().min(0.25).max(4).optional(),
});

export const transcriptionOptionsSchema = z.object({
  language: z.string().trim().min(2).max(16).optional(),
  prompt: z.string().trim().min(1).max(500).optional(),
  model: z.string().trim().min(1).optional(),
  temperature: z.number().min(0).max(1).optional(),
  responseFormat: transcriptionResponseFormatSchema.optional(),
});

export const healthStatusSchema = z.object({
  ok: z.boolean(),
  provider: z.literal('openai-compatible'),
  upstreamOk: z.boolean(),
  upstreamBaseUrl: z.string().url(),
  sttModel: z.string(),
  ttsModel: z.string(),
  defaultVoice: z.string(),
  detail: z.string().optional(),
});

export const capabilitiesSchema = z.object({
  provider: z.literal('openai-compatible'),
  upstreamBaseUrl: z.string().url(),
  transcription: z.object({
    endpoint: z.literal('/v1/audio/transcriptions'),
    model: z.string(),
    responseFormats: z.array(transcriptionResponseFormatSchema),
  }),
  synthesis: z.object({
    endpoint: z.literal('/v1/audio/speech'),
    model: z.string(),
    defaultVoice: z.string(),
    responseFormats: z.array(speechAudioFormatSchema),
  }),
  realtime: z.object({
    supported: z.boolean(),
    upstreamEndpoint: z.string().optional(),
  }),
});

export const transcriptionResultSchema = z.object({
  text: z.string(),
  model: z.string(),
  provider: z.literal('openai-compatible'),
  raw: z.unknown(),
});

export const serviceErrorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

export type SpeechAudioFormat = z.infer<typeof speechAudioFormatSchema>;
export type SpeechSynthesisRequest = z.infer<
  typeof speechSynthesisRequestSchema
>;
export type TranscriptionOptions = z.infer<typeof transcriptionOptionsSchema>;
export type SpeechHealthStatus = z.infer<typeof healthStatusSchema>;
export type SpeechCapabilities = z.infer<typeof capabilitiesSchema>;
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;
export type ServiceErrorResponse = z.infer<typeof serviceErrorResponseSchema>;
