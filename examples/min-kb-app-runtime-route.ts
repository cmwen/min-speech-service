import { createSpeechClient } from 'min-speech-service';

const speechClient = createSpeechClient({
  baseUrl: process.env.MIN_SPEECH_SERVICE_URL ?? 'http://127.0.0.1:8790',
});

export const transcribeAttachment = async (file: File) => {
  const result = await speechClient.transcribe(file, {
    filename: file.name,
    language: 'en',
  });

  return result.text;
};

export const synthesizeReply = async (text: string) => {
  return speechClient.speak({
    input: text,
  });
};

// Suggested min-kb-app touch points:
// - apps/runtime/src/index.ts for new /api/speech/* routes
// - apps/runtime/src/chat-flow.ts for transcribe-then-chat flows
// - apps/web/src/api.ts for web client calls
