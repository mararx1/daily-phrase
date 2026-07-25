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
 * Picks a random phrase, skipping ones already seen today when possible.
 */
export function getAnotherPhrase(seenIndexes: number[]): Phrase {
  const seen = new Set(seenIndexes);
  const pool: number[] = [];

  for (let i = 0; i < phrases.length; i++) {
    if (!seen.has(i)) pool.push(i);
  }

  // All seen — pick any except the last one so it still feels random
  if (pool.length === 0) {
    const last = seenIndexes[seenIndexes.length - 1] ?? -1;
    for (let i = 0; i < phrases.length; i++) {
      if (i !== last) pool.push(i);
    }
    if (pool.length === 0) return phrases[0];
  }

  const index = pool[Math.floor(Math.random() * pool.length)];
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
