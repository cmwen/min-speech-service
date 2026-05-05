import type {
  SpeechCapabilities,
  SpeechHealthStatus,
  SpeechSynthesisRequest,
  TranscriptionOptions,
} from './contracts.js';
import { capabilitiesSchema, healthStatusSchema } from './contracts.js';

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
  ) => Promise<{ text: string; model: string; provider: string; raw: unknown }>;
  speak: (request: SpeechSynthesisRequest) => Promise<Blob>;
};

export const createSpeechClient = ({
  baseUrl,
  fetch = globalThis.fetch,
}: SpeechClientOptions): SpeechClient => ({
  async getHealth() {
    const response = await fetch(`${baseUrl}/health`);
    return healthStatusSchema.parse(await response.json());
  },
  async getCapabilities() {
    const response = await fetch(`${baseUrl}/v1/capabilities`);
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

    const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body,
    });

    return (await response.json()) as {
      text: string;
      model: string;
      provider: string;
      raw: unknown;
    };
  },
  async speak(request) {
    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return new Blob([await response.arrayBuffer()], {
      type: response.headers.get('Content-Type') ?? 'audio/wav',
    });
  },
});
