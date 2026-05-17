import { createSpeechClient } from 'min-speech-service';

const speechClient = createSpeechClient({
  baseUrl: process.env.MIN_SPEECH_SERVICE_URL ?? 'http://127.0.0.1:8790',
});

export const transcribeRecording = async (file: File) => {
  const result = await speechClient.transcribe(file, {
    filename: file.name,
    language: 'en',
  });

  return result.text;
};

export const synthesizeAssistantMessage = async (text: string) => {
  return speechClient.speak({
    input: text,
  });
};

// Suggested gemma-agent-pwa touch points:
// - apps/api/src/index.ts for proxy endpoints
// - apps/web/src/lib/api.ts for browser integration
// - apps/web/src/App.tsx for record/playback controls
