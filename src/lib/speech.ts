export type VoiceGender = "female" | "male";

type SpeakOptions = {
  onStart?: () => void;
  onEnd?: () => void;
  /** Slightly slower for teaching clarity. Default 0.9 */
  rate?: number;
  /** Phrase = female, Example = male */
  gender?: VoiceGender;
};

let femaleVoice: SpeechSynthesisVoice | null = null;
let maleVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;

const FEMALE_HINTS = [
  "samantha",
  "victoria",
  "karen",
  "moira",
  "fiona",
  "tessa",
  "veena",
  "kate",
  "serena",
  "zira",
  "hazel",
  "aria",
  "jenny",
  "sara",
  "susan",
  "allison",
  "emily",
  "woman",
  "female",
  "google us english",
  "google uk english female",
];

const MALE_HINTS = [
  "daniel",
  "david",
  "mark",
  "james",
  "thomas",
  "fred",
  "guy",
  "tony",
  "aaron",
  "nathan",
  "rishi",
  "oliver",
  "man",
  "male",
  "google uk english male",
  "microsoft david",
  "microsoft mark",
  "microsoft guy",
];

function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function detectGender(voice: SpeechSynthesisVoice): VoiceGender | null {
  const name = voice.name.toLowerCase();

  if (MALE_HINTS.some((h) => name.includes(h))) return "male";
  if (FEMALE_HINTS.some((h) => name.includes(h))) return "female";

  // Common Apple default: Alex is male; most unmarked "Google US English" is female-ish
  if (name.includes("alex") && !name.includes("compact")) return "male";

  return null;
}

function qualityScore(voice: SpeechSynthesisVoice): number {
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
  if (!voice.localService) score += 12;

  if (name.includes("compact")) score -= 50;
  if (name.includes("eloquence")) score -= 30;
  if (name.includes("novelty") || name.includes("bad news")) score -= 80;
  if (name.includes("whisper")) score -= 40;
  if (name.includes("superstar") || name.includes("organ")) score -= 80;

  return score;
}

function pickBest(
  voices: SpeechSynthesisVoice[],
  gender: VoiceGender,
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

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!isSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return voices;

  femaleVoice = pickBest(voices, "female");
  maleVoice = pickBest(voices, "male");

  // Fallbacks if gender labels are sparse on this device
  if (!femaleVoice || !maleVoice) {
    const ranked = [...voices]
      .filter((v) => v.lang.toLowerCase().startsWith("en"))
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    if (!femaleVoice && ranked[0]) femaleVoice = ranked[0];
    if (!maleVoice) {
      maleVoice =
        ranked.find((v) => v !== femaleVoice) ?? ranked[0] ?? null;
    }
    if (!femaleVoice) {
      femaleVoice =
        ranked.find((v) => v !== maleVoice) ?? ranked[0] ?? null;
    }
  }

  voicesLoaded = true;
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

  window.setTimeout(refreshVoices, 100);
  window.setTimeout(refreshVoices, 500);
  window.setTimeout(refreshVoices, 1200);
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
 * Speaks English text. Must stay synchronous after the click (iOS).
 * Default gender: female (phrase). Pass gender: "male" for examples.
 */
export function speakEnglish(text: string, options: SpeakOptions = {}): void {
  if (!isSupported() || !text.trim()) {
    options.onEnd?.();
    return;
  }

  const synth = window.speechSynthesis;
  refreshVoices();

  const gender: VoiceGender = options.gender ?? "female";
  const voice = gender === "male" ? maleVoice : femaleVoice;

  try {
    synth.cancel();
  } catch {
    // ignore
  }

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang =
    voice?.lang && voice.lang.toLowerCase().startsWith("en")
      ? voice.lang
      : "en-US";
  utterance.rate = options.rate ?? 0.9;
  // Soft pitch cue if OS only exposes one usable English voice
  utterance.pitch = gender === "female" ? 1.05 : 0.92;
  utterance.volume = 1;

  if (voice) {
    utterance.voice = voice;
  }

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onEnd?.();

  synth.speak(utterance);

  window.setTimeout(() => {
    try {
      if (synth.paused) synth.resume();
    } catch {
      // ignore
    }
  }, 0);
}
