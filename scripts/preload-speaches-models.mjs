import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');

const defaults = {
  SPEECH_API_BASE_URL: 'http://127.0.0.1:8000/v1',
  SPEECH_API_KEY: 'local-no-auth',
  STT_MODEL: 'Systran/faster-distil-whisper-small.en',
  STT_MODEL_ZH_TW: 'Systran/faster-whisper-small',
  TTS_MODEL: 'speaches-ai/Kokoro-82M-v1.0-ONNX',
  TTS_MODEL_ZH_TW: 'speaches-ai/piper-zh_CN-huayan-medium',
};

const parseEnvFile = (path) => {
  if (!existsSync(path)) {
    return {};
  }

  const content = readFileSync(path, 'utf8');
  const values = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (key.length === 0) {
      continue;
    }

    values[key] =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue;
  }

  return values;
};

const env = {
  ...defaults,
  ...parseEnvFile(resolve(rootDir, '.env.example')),
  ...parseEnvFile(resolve(rootDir, '.env')),
  ...process.env,
};

const baseUrl = `${env.SPEECH_API_BASE_URL}`.replace(/\/$/u, '');
const modelsEndpoint = `${baseUrl}/models`;
const models = [
  env.STT_MODEL,
  env.STT_MODEL_ZH_TW,
  env.TTS_MODEL,
  env.TTS_MODEL_ZH_TW,
].filter((value, index, array) => value && array.indexOf(value) === index);

const getErrorDetail = async (response) => {
  const body = await response.text();

  if (body.length === 0) {
    return `${response.status} ${response.statusText}`.trim();
  }

  try {
    const parsed = JSON.parse(body);

    if (typeof parsed?.detail === 'string') {
      return parsed.detail;
    }

    if (typeof parsed?.message === 'string') {
      return parsed.message;
    }
  } catch {
    // Fall back to the raw body when the upstream returns plain text.
  }

  return body;
};

for (const model of models) {
  console.log(`Preloading ${model}`);
  const response = await fetch(
    `${modelsEndpoint}/${encodeURIComponent(model)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SPEECH_API_KEY}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not preload "${model}": ${await getErrorDetail(response)}`,
    );
  }
}

console.log(`Preloaded ${models.length} configured speech model(s).`);
