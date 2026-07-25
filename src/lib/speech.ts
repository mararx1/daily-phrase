type SpeakOptions = {
  onStart?: () => void;
  onEnd?: () => void;
  /** Slightly slower for teaching clarity. Default 0.9 */
  rate?: number;
};

let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;

function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  if (!lang.startsWith("en")) return -Infinity;

  let score = 0;

  if (lang === "en-us") score += 55;
  else if (lang === "en-gb") score += 42;
  else if (lang.startsWith("en-")) score += 28;
  else score += 15;

  if (name.includes("google")) score += 48;
  if (name.includes("neural")) score += 40;
  if (name.includes("online") && name.includes("natural")) score += 36;
  if (name.includes("enhanced")) score += 32;
  if (name.includes("premium")) score += 30;
  if (name.includes("natural")) score += 22;

  if (name.includes("aria")) score += 34;
  if (name.includes("jenny")) score += 32;
  if (name.includes("guy")) score += 24;
  if (name.includes("samantha")) score += 30;
  if (name.includes("daniel")) score += 26;
  if (name.includes("karen")) score += 20;
  if (name.includes("moira")) score += 16;
  if (name.includes("alex") && !name.includes("compact")) score += 18;
  if (name.includes("siri")) score += 14;

  if (!voice.localService) score += 12;

  if (name.includes("compact")) score -= 50;
  if (name.includes("eloquence")) score -= 30;
  if (name.includes("novelty") || name.includes("bad news")) score -= 80;
  if (name.includes("whisper")) score -= 40;
  if (name.includes("superstar") || name.includes("organ")) score -= 80;

  return score;
}

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;

  for (const voice of voices) {
    const score = scoreVoice(voice);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }

  return bestScore > -Infinity ? best : null;
}

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!isSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    cachedVoice = pickBestVoice(voices);
    voicesLoaded = true;
  }
  return voices;
}

/** Warm up voices early so Listen can speak synchronously on tap. */
export function prepareSpeechEngine(): void {
  if (!isSupported()) return;

  refreshVoices();

  const synth = window.speechSynthesis;
  const onVoices = () => {
    refreshVoices();
    if (voicesLoaded) {
      synth.removeEventListener("voiceschanged", onVoices);
    }
  };

  synth.addEventListener("voiceschanged", onVoices);

  // Some browsers populate voices slightly later
  window.setTimeout(refreshVoices, 100);
  window.setTimeout(refreshVoices, 500);
  window.setTimeout(refreshVoices, 1200);
}

export function getActiveVoiceName(): string | null {
  if (!cachedVoice) refreshVoices();
  return cachedVoice?.name ?? null;
}

export function stopSpeaking(): void {
  if (!isSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

/**
 * Speaks English text with the clearest available system voice.
 * Must stay synchronous after the click (no await) — required on iOS.
 */
export function speakEnglish(text: string, options: SpeakOptions = {}): void {
  if (!isSupported() || !text.trim()) {
    options.onEnd?.();
    return;
  }

  const synth = window.speechSynthesis;
  refreshVoices();

  // Reset stuck Chrome/Safari state, then speak in the same user gesture.
  try {
    synth.cancel();
  } catch {
    // ignore
  }

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang =
    cachedVoice?.lang && cachedVoice.lang.toLowerCase().startsWith("en")
      ? cachedVoice.lang
      : "en-US";
  utterance.rate = options.rate ?? 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  if (cachedVoice) {
    utterance.voice = cachedVoice;
  }

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onEnd?.();

  // Speak immediately (keeps iOS user-activation).
  synth.speak(utterance);

  // Chrome sometimes parks the utterance as paused.
  window.setTimeout(() => {
    try {
      if (synth.paused) synth.resume();
    } catch {
      // ignore
    }
  }, 0);
}
