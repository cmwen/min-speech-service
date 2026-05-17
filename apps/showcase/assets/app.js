const storageKey = 'min-speech-showcase-state-v1';

const state = {
  capabilities: null,
  installPrompt: null,
  mediaRecorder: null,
  stream: null,
  chunks: [],
  selectedBlob: null,
  selectedFilename: 'recording.webm',
  selectedMimeType: 'audio/webm',
  audioUrl: null,
  ttsUrl: null,
};

const ids = {
  audioUpload: document.getElementById('audio-upload'),
  copyRewrite: document.getElementById('copy-rewrite'),
  copyTranscript: document.getElementById('copy-transcript'),
  detectedLanguage: document.getElementById('result-detected-language'),
  fillers: document.getElementById('result-fillers'),
  health: document.getElementById('health-status'),
  installApp: document.getElementById('install-app'),
  installState: document.getElementById('install-state'),
  intent: document.getElementById('result-intent'),
  networkStatus: document.getElementById('network-status'),
  nlpInput: document.getElementById('nlp-input'),
  nlpLanguage: document.getElementById('nlp-language'),
  nlpStatus: document.getElementById('nlp-status'),
  playback: document.getElementById('tts-playback'),
  processText: document.getElementById('process-text'),
  recordingPreview: document.getElementById('recording-preview'),
  rewritten: document.getElementById('result-rewritten'),
  speakText: document.getElementById('speak-text'),
  startRecording: document.getElementById('start-recording'),
  stopRecording: document.getElementById('stop-recording'),
  sttStatus: document.getElementById('stt-status'),
  targetLanguage: document.getElementById('target-language'),
  transcript: document.getElementById('transcript'),
  transcriptLanguage: document.getElementById('transcript-language'),
  transcribeRecording: document.getElementById('transcribe-recording'),
  translated: document.getElementById('result-translated'),
  ttsInput: document.getElementById('tts-input'),
  ttsLanguage: document.getElementById('tts-language'),
  ttsStatus: document.getElementById('tts-status'),
  cleaned: document.getElementById('result-cleaned'),
};

const persistedFields = [
  'transcriptLanguage',
  'nlpLanguage',
  'targetLanguage',
  'ttsLanguage',
  'transcript',
  'nlpInput',
  'ttsInput',
];

const setStatus = (element, message, isError = false) => {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle('error', isError);
};

const setButtonState = (button, disabled) => {
  if (button) {
    button.disabled = disabled;
  }
};

const revokeIfPresent = (url) => {
  if (url) {
    URL.revokeObjectURL(url);
  }
};

const saveState = () => {
  const payload = Object.fromEntries(
    persistedFields.map((key) => [key, ids[key]?.value ?? '']),
  );
  localStorage.setItem(storageKey, JSON.stringify(payload));
};

const restoreState = () => {
  const raw = localStorage.getItem(storageKey);

  if (!raw) {
    return;
  }

  try {
    const data = JSON.parse(raw);
    for (const key of persistedFields) {
      if (ids[key] && typeof data[key] === 'string') {
        ids[key].value = data[key];
      }
    }
  } catch {
    localStorage.removeItem(storageKey);
  }
};

const updateNetworkState = () => {
  ids.networkStatus.textContent = navigator.onLine
    ? 'Online'
    : 'Offline shell active';
};

const updateInstallState = (ready) => {
  ids.installState.textContent = ready
    ? 'Install available'
    : 'Install from browser menu';
  ids.installApp.hidden = !ready;
};

const fetchJson = async (url, init) => {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed for ${url}`);
  }

  return data;
};

const loadCapabilities = async () => {
  state.capabilities = await fetchJson('/v1/capabilities');
  ids.targetLanguage.value =
    ids.targetLanguage.value.trim() ||
    state.capabilities.textProcessing?.targetLanguage ||
    'en';
  saveState();
};

const refreshHealth = async () => {
  try {
    const data = await fetchJson('/health');
    ids.health.textContent = data.ok
      ? 'Speech and NLP backends are reachable.'
      : (data.detail ?? 'One or more backends need attention.');
  } catch (error) {
    setStatus(
      ids.health,
      error instanceof Error ? error.message : 'Health check failed.',
      true,
    );
  }
};

const selectAudioBlob = (blob, filename, mimeType) => {
  state.selectedBlob = blob;
  state.selectedFilename = filename;
  state.selectedMimeType = mimeType;
  revokeIfPresent(state.audioUrl);
  state.audioUrl = URL.createObjectURL(blob);
  ids.recordingPreview.src = state.audioUrl;
  ids.recordingPreview.hidden = false;
};

const startRecording = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(
      ids.sttStatus,
      'Microphone capture is not available in this browser.',
      true,
    );
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.chunks = [];
    state.mediaRecorder = new MediaRecorder(state.stream);
    state.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        state.chunks.push(event.data);
      }
    });
    state.mediaRecorder.addEventListener('stop', () => {
      const mimeType = state.mediaRecorder?.mimeType || 'audio/webm';
      const blob = new Blob(state.chunks, { type: mimeType });
      selectAudioBlob(blob, 'recording.webm', mimeType);
      state.stream?.getTracks().forEach((track) => {
        track.stop();
      });
      state.stream = null;
      setButtonState(ids.startRecording, false);
      setButtonState(ids.stopRecording, true);
      setStatus(
        ids.sttStatus,
        'Recording captured. Send it to the speech-to-text endpoint.',
      );
    });
    state.mediaRecorder.start();
    setButtonState(ids.startRecording, true);
    setButtonState(ids.stopRecording, false);
    setStatus(ids.sttStatus, 'Recording...');
  } catch (error) {
    setStatus(
      ids.sttStatus,
      error instanceof Error ? error.message : 'Unable to start recording.',
      true,
    );
  }
};

const stopRecording = () => {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
};

const handleFileSelection = () => {
  const file = ids.audioUpload.files?.[0];

  if (!file) {
    return;
  }

  selectAudioBlob(file, file.name, file.type || 'application/octet-stream');
  setStatus(ids.sttStatus, `Ready to transcribe ${file.name}.`);
};

const transcribeAudio = async () => {
  if (!state.selectedBlob) {
    setStatus(
      ids.sttStatus,
      'Record audio or choose a file before requesting a transcription.',
      true,
    );
    return;
  }

  try {
    setStatus(ids.sttStatus, 'Transcribing...');
    const body = new FormData();
    body.append(
      'file',
      state.selectedBlob,
      state.selectedFilename || 'recording.webm',
    );
    if (ids.transcriptLanguage.value.trim()) {
      body.append('language', ids.transcriptLanguage.value.trim());
    }
    const data = await fetchJson('/v1/audio/transcriptions', {
      method: 'POST',
      body,
    });
    ids.transcript.value = data.text;
    if (!ids.nlpInput.value.trim()) {
      ids.nlpInput.value = data.text;
    }
    saveState();
    setStatus(ids.sttStatus, 'Transcription ready.');
  } catch (error) {
    setStatus(
      ids.sttStatus,
      error instanceof Error ? error.message : 'Transcription failed.',
      true,
    );
  }
};

const renderResult = (data) => {
  ids.intent.textContent = data.intent;
  ids.detectedLanguage.textContent = data.detectedLanguage;
  ids.cleaned.textContent = data.cleanedText;
  ids.rewritten.textContent = data.rewrittenText;
  ids.translated.textContent = data.translatedText;
  ids.fillers.innerHTML = '';

  if (Array.isArray(data.fillerWords) && data.fillerWords.length > 0) {
    for (const word of data.fillerWords) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = word;
      ids.fillers.appendChild(badge);
    }
    return;
  }

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = 'No filler words found';
  ids.fillers.appendChild(badge);
};

const processText = async () => {
  const input = ids.nlpInput.value.trim();

  if (!input) {
    setStatus(ids.nlpStatus, 'Enter text to process.', true);
    return;
  }

  try {
    setStatus(
      ids.nlpStatus,
      'Asking the Gemma text-processing model to clean and interpret the text...',
    );
    const data = await fetchJson('/v1/text/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
        language: ids.nlpLanguage.value.trim() || undefined,
        targetLanguage: ids.targetLanguage.value.trim() || undefined,
      }),
    });
    renderResult(data);
    ids.ttsInput.value = data.rewrittenText;
    saveState();
    setStatus(ids.nlpStatus, 'Intent, cleaned text, and translation ready.');
  } catch (error) {
    setStatus(
      ids.nlpStatus,
      error instanceof Error ? error.message : 'Text processing failed.',
      true,
    );
  }
};

const synthesizeSpeech = async () => {
  const input = ids.ttsInput.value.trim();

  if (!input) {
    setStatus(ids.ttsStatus, 'Enter text to synthesize.', true);
    return;
  }

  try {
    setStatus(ids.ttsStatus, 'Generating speech...');
    const response = await fetch('/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
        language: ids.ttsLanguage.value.trim() || undefined,
        responseFormat:
          state.capabilities?.synthesis?.responseFormats?.includes('wav')
            ? 'wav'
            : undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => undefined);
      throw new Error(data?.error ?? 'Speech generation failed.');
    }

    const blob = await response.blob();
    revokeIfPresent(state.ttsUrl);
    state.ttsUrl = URL.createObjectURL(blob);
    ids.playback.src = state.ttsUrl;
    saveState();
    await ids.playback.play().catch(() => undefined);
    setStatus(ids.ttsStatus, 'Speech ready.');
  } catch (error) {
    setStatus(
      ids.ttsStatus,
      error instanceof Error ? error.message : 'Speech generation failed.',
      true,
    );
  }
};

const installApp = async () => {
  if (!state.installPrompt) {
    return;
  }

  state.installPrompt.prompt();
  await state.installPrompt.userChoice.catch(() => undefined);
  state.installPrompt = null;
  updateInstallState(false);
};

for (const key of persistedFields) {
  ids[key]?.addEventListener('change', saveState);
  ids[key]?.addEventListener('input', saveState);
}

ids.audioUpload?.addEventListener('change', handleFileSelection);
ids.copyRewrite?.addEventListener('click', () => {
  if (ids.rewritten.textContent?.trim()) {
    ids.ttsInput.value = ids.rewritten.textContent.trim();
    saveState();
  }
});
ids.copyTranscript?.addEventListener('click', () => {
  if (ids.transcript.value.trim()) {
    ids.nlpInput.value = ids.transcript.value.trim();
    saveState();
  }
});
ids.installApp?.addEventListener('click', installApp);
ids.processText?.addEventListener('click', processText);
ids.speakText?.addEventListener('click', synthesizeSpeech);
ids.startRecording?.addEventListener('click', startRecording);
ids.stopRecording?.addEventListener('click', stopRecording);
ids.transcribeRecording?.addEventListener('click', transcribeAudio);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPrompt = event;
  updateInstallState(true);
});

window.addEventListener('appinstalled', () => {
  state.installPrompt = null;
  updateInstallState(false);
});

window.addEventListener('online', updateNetworkState);
window.addEventListener('offline', updateNetworkState);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

restoreState();
updateNetworkState();
updateInstallState(false);
await Promise.all([loadCapabilities(), refreshHealth()]);
