import { describe, expect, it } from 'vitest';

import { createSpeechClient } from '../src/client.js';

const runLiveTests = process.env.RUN_LIVE_SPEECH_TESTS === '1';
const describeLive = runLiveTests ? describe : describe.skip;

describeLive('live speech integration', () => {
  const baseUrl =
    process.env.LIVE_SPEECH_SERVICE_URL ?? 'http://127.0.0.1:8790';
  const client = createSpeechClient({ baseUrl });

  it('returns health and capabilities from a running service', async () => {
    await expect(client.getHealth()).resolves.toMatchObject({
      provider: 'openai-compatible',
    });
    await expect(client.getCapabilities()).resolves.toMatchObject({
      provider: 'openai-compatible',
    });
  });
});
