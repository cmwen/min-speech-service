import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';

import type { AppConfig } from './config.js';
import {
  speechSynthesisRequestSchema,
  transcriptionOptionsSchema,
} from './contracts.js';
import type { SpeechService } from './service.js';

const pickBodyValue = <T>(value: T | T[] | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : value;

export const createApp = (config: AppConfig, service: SpeechService) => {
  const app = new Hono();

  app.use('*', async (c, next) =>
    cors({
      origin: (origin) => {
        if (
          !origin ||
          config.allowedOrigins.includes('*') ||
          config.allowedOrigins.includes(origin)
        ) {
          return origin || '*';
        }

        return null;
      },
    })(c, next),
  );

  app.get('/health', async (c) => c.json(await service.getHealth()));

  app.get('/v1/capabilities', (c) => c.json(service.getCapabilities()));

  app.post('/v1/audio/transcriptions', async (c) => {
    const body = await c.req.parseBody();
    const file = pickBodyValue(body.file);

    if (!(file instanceof File)) {
      return c.json({ error: 'Expected multipart field "file".' }, 400);
    }

    const options = transcriptionOptionsSchema.parse({
      language: pickBodyValue(body.language),
      prompt: pickBodyValue(body.prompt),
      model: pickBodyValue(body.model),
      temperature:
        typeof pickBodyValue(body.temperature) === 'string'
          ? Number(pickBodyValue(body.temperature))
          : undefined,
      responseFormat:
        pickBodyValue(body.response_format) ??
        pickBodyValue(body.responseFormat),
    });

    const result = await service.transcribe(file, options);
    return c.json({
      text: result.text,
      model: result.model,
      provider: config.provider,
      raw: result.raw,
    });
  });

  app.post('/v1/audio/speech', async (c) => {
    const request = speechSynthesisRequestSchema.parse(await c.req.json());
    const result = await service.synthesize(request);
    c.header('Content-Type', result.contentType);
    c.header('X-Speech-Model', result.model);
    c.header('X-Speech-Voice', result.voice);
    return c.body(Uint8Array.from(result.audio));
  });

  app.onError((error, c) => {
    if (error instanceof ZodError) {
      return c.json(
        {
          error: 'Request validation failed.',
          details: error.issues,
        },
        400,
      );
    }

    return c.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500,
    );
  });

  return app;
};

export const startApp = (config: AppConfig, service: SpeechService) =>
  serve({
    fetch: createApp(config, service).fetch,
    hostname: config.host,
    port: config.port,
  });
