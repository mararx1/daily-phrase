import { phrases, type Phrase } from "./phrases";

/**
 * Returns a YYYY-MM-DD key based on the user's local calendar date.
 */
export function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Deterministically picks today's phrase from the local calendar date,
 * so it stays the same across reloads within the same day.
 */
export function getTodayPhraseIndex(): number {
  const todayKey = getTodayKey();
  let hash = 0;
  for (let i = 0; i < todayKey.length; i++) {
    hash = (hash * 31 + todayKey.charCodeAt(i)) >>> 0;
  }
  return hash % phrases.length;
}

export function getTodayPhrase(): Phrase {
  return phrases[getTodayPhraseIndex()];
}

/**
 * Picks another phrase, skipping ones already seen today when possible.
 */
export function getAnotherPhrase(seenIndexes: number[]): Phrase {
  if (seenIndexes.length >= phrases.length) {
    const next = (seenIndexes[seenIndexes.length - 1] + 1) % phrases.length;
    return phrases[next];
  }

  const seen = new Set(seenIndexes);
  let index = (seenIndexes[seenIndexes.length - 1] + 1) % phrases.length;
  while (seen.has(index)) {
    index = (index + 1) % phrases.length;
  }
  return phrases[index];
}

export function getPhraseIndex(phrase: Phrase): number {
  return phrases.indexOf(phrase);
}

const STORAGE_PREFIX = "daily-phrase:done:";

export function isDoneToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + getTodayKey()) === "1";
  } catch {
    return false;
  }
}

export function markDoneToday(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + getTodayKey(), "1");
  } catch {
    // localStorage unavailable (e.g. private mode) — fail silently
  }
}
