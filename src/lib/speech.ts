type SpeakOptions = {
  onStart?: () => void;
  onEnd?: () => void;
  /** Phrase is a bit snappier; example is slower, chunked, male voice. */
  kind?: "phrase" | "example";
};

let phraseVoice: SpeechSynthesisVoice | null = null;
let exampleVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;
let speakGeneration = 0;

const PREMIUM_HINTS = [
  "premium",
  "enhanced",
  "neural",
  "natural",
  "siri",
  "online",
];

const FEMALE_NAMES = [
  "samantha",
  "nicky",
  "zoe",
  "ava",
  "allison",
  "susan",
  "victoria",
  "karen",
  "moira",
  "tessa",
  "serena",
  "kate",
  "aria",
  "jenny",
  "zira",
  "hazel",
  "fiona",
  "veena",
  "samantha",
  "female",
  "woman",
];

const MALE_NAMES = [
  "aaron",
  "daniel",
  "alex",
  "tom",
  "oliver",
  "rishi",
  "nathan",
  "david",
  "james",
  "thomas",
  "lee",
  "bruce",
  "gordon",
  "guy",
  "mark",
  "evan",
  "noah",
  "male",
  "man",
];

const BAD_NAME =
  /fred|compact|eloquence|novelty|whisper|albert|zarvox|trinoids|boing|bells|bubbles|cellos|deranged|jester|organ|superstar|wobbles|bad news|good news|bahh|princess|junior|ralph|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/;

function isSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return "speechSynthesis" in window && window.speechSynthesis != null;
  } catch {
    return false;
  }
}

export function isSpeechSupported(): boolean {
  return isSupported();
}

function hasWord(name: string, word: string): boolean {
  return new RegExp(`(?:^|[^a-z])${word}(?:[^a-z]|$)`).test(name);
}

function detectGender(voice: SpeechSynthesisVoice): "female" | "male" | null {
  const name = voice.name.toLowerCase();
  if (FEMALE_NAMES.some((word) => hasWord(name, word))) return "female";
  if (MALE_NAMES.some((word) => hasWord(name, word))) return "male";
  return null;
}

function qualityScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  if (!lang.startsWith("en")) return -Infinity;
  if (BAD_NAME.test(name)) return -Infinity;

  let score = 0;

  if (lang === "en-us") score += 60;
  else if (lang === "en-gb") score += 44;
  else if (lang.startsWith("en-")) score += 24;
  else score += 10;

  if (PREMIUM_HINTS.some((hint) => name.includes(hint))) score += 48;
  if (name.includes("google")) score += 42;
  if (!voice.localService) score += 10;

  return score;
}

function pickBest(
  voices: SpeechSynthesisVoice[],
  gender: "female" | "male",
): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;

  for (const voice of voices) {
    if (detectGender(voice) !== gender) continue;
    const score = qualityScore(voice);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }

  return bestScore > -Infinity ? best : null;
}

function pickAnyEnglish(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const score = qualityScore(voice);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best;
}

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!isSupported()) return [];
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
  if (!voices.length) return voices;

  const fallback = pickAnyEnglish(voices);
  phraseVoice = pickBest(voices, "female") ?? fallback;
  exampleVoice = pickBest(voices, "male") ?? fallback;
  voicesLoaded = true;
  return voices;
}

/** Warm up voices early so Listen can speak synchronously on tap. */
export function prepareSpeechEngine(): void {
  if (!isSupported()) return;

  try {
    refreshVoices();
  } catch {
    return;
  }

  const synth = window.speechSynthesis;
  try {
    const onVoices = () => {
      refreshVoices();
      if (voicesLoaded) {
        synth.removeEventListener("voiceschanged", onVoices);
      }
    };

    synth.addEventListener("voiceschanged", onVoices);
    window.setTimeout(refreshVoices, 100);
    window.setTimeout(refreshVoices, 500);
    window.setTimeout(refreshVoices, 1200);
  } catch {
    // ignore
  }
}

export function stopSpeaking(): void {
  speakGeneration += 1;
  if (!isSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

function normalizeForSpeech(text: string): string {
  return text
    .replace(/[—–]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitForSpeech(text: string): string[] {
  const normalized = normalizeForSpeech(text);
  const parts = normalized.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
}

function makeUtterance(
  text: string,
  voice: SpeechSynthesisVoice | null,
  rate: number,
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang =
    voice?.lang && voice.lang.toLowerCase().startsWith("en")
      ? voice.lang
      : "en-US";
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  return utterance;
}

/**
 * Speaks English text. Must stay synchronous after the click (iOS).
 * Phrase uses the best female English voice; example uses the best male
 * English voice (Fred and novelty voices are skipped). No pitch-shifting.
 */
export function speakEnglish(text: string, options: SpeakOptions = {}): boolean {
  if (!isSupported() || !text.trim()) {
    return false;
  }

  let synth: SpeechSynthesis;
  try {
    synth = window.speechSynthesis;
    refreshVoices();
  } catch {
    return false;
  }

  const generation = ++speakGeneration;
  const kind = options.kind ?? "phrase";
  const voice = kind === "example" ? exampleVoice : phraseVoice;
  const chunks =
    kind === "example" ? splitForSpeech(text) : [normalizeForSpeech(text)];
  const rate = kind === "example" ? 0.92 : 0.96;

  try {
    synth.cancel();
  } catch {
    // ignore
  }

  const isCurrent = () => generation === speakGeneration;

  try {
    chunks.forEach((chunk, index) => {
      const utterance = makeUtterance(chunk, voice, rate);
      const last = index === chunks.length - 1;
      if (index === 0) {
        utterance.onstart = () => {
          if (isCurrent()) options.onStart?.();
        };
      }
      utterance.onend = () => {
        if (last && isCurrent()) options.onEnd?.();
      };
      utterance.onerror = () => {
        if (isCurrent()) options.onEnd?.();
      };
      synth.speak(utterance);
    });
  } catch {
    return false;
  }

  window.setTimeout(() => {
    try {
      if (synth.paused) synth.resume();
    } catch {
      // ignore
    }
  }, 0);

  return true;
}
