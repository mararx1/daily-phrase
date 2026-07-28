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
 * Deterministically picks a phrase from a YYYY-MM-DD key,
 * so it stays the same across reloads within the same day.
 */
export function getPhraseIndexForDateKey(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return hash % phrases.length;
}

export function getPhraseForDateKey(dateKey: string): Phrase {
  return phrases[getPhraseIndexForDateKey(dateKey)];
}

export function getTodayPhraseIndex(): number {
  return getPhraseIndexForDateKey(getTodayKey());
}

export function getTodayPhrase(): Phrase {
  return getPhraseForDateKey(getTodayKey());
}

/** Local calendar YYYY-MM-DD for a Date. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
const HISTORY_STORAGE_KEY = "daily-phrase:history";

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

/**
 * Previously shown phrase indexes, newest first.
 * Invalid / out-of-range indexes are dropped.
 */
export function getSeenPhraseIndexes(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<number>();
    const result: number[] = [];
    for (const item of parsed) {
      if (typeof item !== "number" || !Number.isInteger(item)) continue;
      if (item < 0 || item >= phrases.length) continue;
      if (seen.has(item)) continue;
      seen.add(item);
      result.push(item);
    }
    return result;
  } catch {
    return [];
  }
}

export function markPhraseSeen(index: number): number[] {
  if (typeof window === "undefined") return [];
  if (!Number.isInteger(index) || index < 0 || index >= phrases.length) {
    return getSeenPhraseIndexes();
  }

  const next = [index, ...getSeenPhraseIndexes().filter((i) => i !== index)];
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — fail silently
  }
  return next;
}

export function getPhraseByIndex(index: number): Phrase | null {
  if (!Number.isInteger(index) || index < 0 || index >= phrases.length) {
    return null;
  }
  return phrases[index];
}
