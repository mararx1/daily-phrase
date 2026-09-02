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

export function getPhraseByIndex(index: number): Phrase | null {
  if (index < 0 || index >= phrases.length) return null;
  return phrases[index];
}

const STORAGE_PREFIX = "daily-phrase:done:";
const EXTRA_VIEW_KEY = "daily-phrase:extra-view";

function readStore(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(store: Storage, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function doneStorageKey(): string {
  return STORAGE_PREFIX + getTodayKey();
}

export function isDoneToday(): boolean {
  if (typeof window === "undefined") return false;
  const key = doneStorageKey();
  return (
    readStore(window.localStorage, key) === "1" ||
    readStore(window.sessionStorage, key) === "1"
  );
}

/** Persists done; falls back to sessionStorage if localStorage is blocked. */
export function markDoneToday(): boolean {
  if (typeof window === "undefined") return false;
  const key = doneStorageKey();
  if (writeStore(window.localStorage, key, "1")) return true;
  return writeStore(window.sessionStorage, key, "1");
}

export type ExtraView = {
  dateKey: string;
  index: number;
  seen: number[];
};

export function loadExtraView(): ExtraView | null {
  if (typeof window === "undefined") return null;
  const raw = readStore(window.sessionStorage, EXTRA_VIEW_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ExtraView;
    if (
      parsed.dateKey !== getTodayKey() ||
      typeof parsed.index !== "number" ||
      !Array.isArray(parsed.seen)
    ) {
      clearExtraView();
      return null;
    }
    return parsed;
  } catch {
    clearExtraView();
    return null;
  }
}

export function saveExtraView(view: ExtraView): void {
  if (typeof window === "undefined") return;
  writeStore(window.sessionStorage, EXTRA_VIEW_KEY, JSON.stringify(view));
}

export function clearExtraView(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(EXTRA_VIEW_KEY);
  } catch {
    // ignore
  }
}
