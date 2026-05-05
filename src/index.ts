import { startApp } from './app.js';
import { readConfig } from './config.js';
import { createOpenAiGateway } from './gateway.js';
import { createSpeechService } from './service.js';

const config = readConfig();
const gateway = createOpenAiGateway(config);
const service = createSpeechService(config, gateway);

startApp(config, service);

console.log(
  `[min-speech-service] listening on http://${config.host}:${config.port} -> ${config.apiBaseUrl}`,
);
