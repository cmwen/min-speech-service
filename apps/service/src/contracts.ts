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
  language: z.string().trim().min(2).max(16).optional(),
  voice: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  responseFormat: speechAudioFormatSchema.optional(),
  speed: z.number().min(0.25).max(4).optional(),
});

export const textProcessingEndpointSchema = z.enum([
  '/v1/npl',
  '/v1/text/process',
]);

export const textProcessingRequestSchema = z.object({
  input: z.string().trim().min(1),
  language: z.string().trim().min(2).max(16).optional(),
  targetLanguage: z.string().trim().min(2).max(16).optional(),
});

const speechLanguageModelSchema = z.object({
  language: z.string(),
  model: z.string(),
});

const speechLanguageVoiceSchema = z.object({
  language: z.string(),
  model: z.string(),
  defaultVoice: z.string(),
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
  nlpModel: z.string().optional(),
  nlpUpstreamOk: z.boolean().optional(),
  nlpUpstreamBaseUrl: z.string().url().optional(),
  detail: z.string().optional(),
});

export const capabilitiesSchema = z.object({
  provider: z.literal('openai-compatible'),
  upstreamBaseUrl: z.string().url(),
  transcription: z.object({
    endpoint: z.literal('/v1/audio/transcriptions'),
    model: z.string(),
    responseFormats: z.array(transcriptionResponseFormatSchema),
    languagePresets: z.array(speechLanguageModelSchema).optional(),
  }),
  synthesis: z.object({
    endpoint: z.literal('/v1/audio/speech'),
    model: z.string(),
    defaultVoice: z.string(),
    responseFormats: z.array(speechAudioFormatSchema),
    languagePresets: z.array(speechLanguageVoiceSchema).optional(),
  }),
  realtime: z.object({
    supported: z.boolean(),
    upstreamEndpoint: z.string().optional(),
  }),
  textProcessing: z
    .object({
      endpoint: textProcessingEndpointSchema,
      model: z.string(),
      targetLanguage: z.string(),
      features: z.array(z.string()),
    })
    .optional(),
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

export const textProcessingGatewayResultSchema = z.object({
  detectedLanguage: z.string().trim().min(1),
  intent: z.string().trim().min(1),
  cleanedText: z.string().trim().min(1),
  rewrittenText: z.string().trim().min(1),
  translatedText: z.string().trim().min(1),
  fillerWords: z.array(z.string()).default([]),
});

export const textProcessingResultSchema = z.object({
  sourceText: z.string(),
  detectedLanguage: z.string(),
  intent: z.string(),
  cleanedText: z.string(),
  rewrittenText: z.string(),
  translatedText: z.string(),
  targetLanguage: z.string(),
  fillerWords: z.array(z.string()),
  model: z.string(),
  provider: z.literal('openai-compatible'),
  raw: z.unknown(),
});

export type SpeechAudioFormat = z.infer<typeof speechAudioFormatSchema>;
export type SpeechSynthesisRequest = z.infer<
  typeof speechSynthesisRequestSchema
>;
export type TextProcessingRequest = z.infer<typeof textProcessingRequestSchema>;
export type TranscriptionOptions = z.infer<typeof transcriptionOptionsSchema>;
export type SpeechHealthStatus = z.infer<typeof healthStatusSchema>;
export type SpeechCapabilities = z.infer<typeof capabilitiesSchema>;
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;
export type ServiceErrorResponse = z.infer<typeof serviceErrorResponseSchema>;
export type TextProcessingGatewayResult = z.infer<
  typeof textProcessingGatewayResultSchema
>;
export type TextProcessingResult = z.infer<typeof textProcessingResultSchema>;
