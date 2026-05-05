import type {
  ServiceErrorResponse,
  SpeechCapabilities,
  SpeechHealthStatus,
  SpeechSynthesisRequest,
  TranscriptionOptions,
  TranscriptionResult,
} from './contracts.js';
import {
  capabilitiesSchema,
  healthStatusSchema,
  serviceErrorResponseSchema,
  transcriptionResultSchema,
} from './contracts.js';

export type SpeechClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
};

export type SpeechClient = {
  getHealth: () => Promise<SpeechHealthStatus>;
  getCapabilities: () => Promise<SpeechCapabilities>;
  transcribe: (
    file: Blob,
    options?: TranscriptionOptions & { filename?: string },
  ) => Promise<TranscriptionResult>;
  speak: (request: SpeechSynthesisRequest) => Promise<Blob>;
};

export class SpeechClientError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: ServiceErrorResponse | string | undefined;

  constructor(args: {
    message: string;
    status: number;
    statusText: string;
    body: ServiceErrorResponse | string | undefined;
  }) {
    super(args.message);
    this.name = 'SpeechClientError';
    this.status = args.status;
    this.statusText = args.statusText;
    this.body = args.body;
  }
}

const parseErrorBody = async (
  response: Response,
): Promise<ServiceErrorResponse | string | undefined> => {
  const contentType = response.headers.get('Content-Type') ?? '';

  if (contentType.includes('application/json')) {
    const json = await response.json();
    const parsed = serviceErrorResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : JSON.stringify(json);
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
};

const throwForErrorResponse = async (
  response: Response,
  operation: string,
): Promise<never> => {
  const body = await parseErrorBody(response);
  const detail = typeof body === 'string' ? body : body?.error;

  throw new SpeechClientError({
    message: detail
      ? `${operation} failed: ${detail}`
      : `${operation} failed with ${response.status} ${response.statusText}`,
    status: response.status,
    statusText: response.statusText,
    body,
  });
};

export const createSpeechClient = ({
  baseUrl,
  fetch = globalThis.fetch,
}: SpeechClientOptions): SpeechClient => {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  return {
    async getHealth() {
      const response = await fetch(`${normalizedBaseUrl}/health`);

      if (!response.ok) {
        return throwForErrorResponse(response, 'Fetching speech health');
      }

      return healthStatusSchema.parse(await response.json());
    },
    async getCapabilities() {
      const response = await fetch(`${normalizedBaseUrl}/v1/capabilities`);

      if (!response.ok) {
        return throwForErrorResponse(response, 'Fetching speech capabilities');
      }

      return capabilitiesSchema.parse(await response.json());
    },
    async transcribe(file, options) {
      const body = new FormData();
      body.append('file', file, options?.filename ?? 'recording.webm');

      if (options?.language) {
        body.append('language', options.language);
      }

      if (options?.prompt) {
        body.append('prompt', options.prompt);
      }

      if (options?.model) {
        body.append('model', options.model);
      }

      if (typeof options?.temperature === 'number') {
        body.append('temperature', `${options.temperature}`);
      }

      if (options?.responseFormat) {
        body.append('responseFormat', options.responseFormat);
      }

      const response = await fetch(
        `${normalizedBaseUrl}/v1/audio/transcriptions`,
        {
          method: 'POST',
          body,
        },
      );

      if (!response.ok) {
        return throwForErrorResponse(response, 'Transcribing audio');
      }

      return transcriptionResultSchema.parse(await response.json());
    },
    async speak(request) {
      const response = await fetch(`${normalizedBaseUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return throwForErrorResponse(response, 'Synthesizing speech');
      }

      return new Blob([await response.arrayBuffer()], {
        type: response.headers.get('Content-Type') ?? 'audio/wav',
      });
    },
  };
};
