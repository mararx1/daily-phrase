import { legacyPhrases } from "./legacy-phrases";
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
const HISTORY_STORAGE_KEY = "daily-phrase:history";
const HISTORY_BACKUP_KEY = "daily-phrase:history:backup";
const HISTORY_RECOVERED_KEY = "daily-phrase:history:recovered-v1";

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

function isPhraseSnapshot(value: unknown): value is Phrase {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.phrase === "string" &&
    item.phrase.length > 0 &&
    typeof item.translation === "string" &&
    typeof item.example === "string" &&
    typeof item.exampleTranslation === "string"
  );
}

function indexForDateKey(dateKey: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function backupHistoryRaw(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(HISTORY_BACKUP_KEY)) return;
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) window.localStorage.setItem(HISTORY_BACKUP_KEY, raw);
  } catch {
    // ignore
  }
}

function readHistoryRaw(key: string = HISTORY_STORAGE_KEY): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistHistory(items: Phrase[]): Phrase[] {
  if (typeof window === "undefined") return items;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage unavailable — fail silently
  }
  return items;
}

function addPhrase(target: Phrase[], seen: Set<string>, phrase: Phrase | null): void {
  if (!phrase || seen.has(phrase.phrase)) return;
  seen.add(phrase.phrase);
  target.push(phrase);
}

function phrasesAtIndex(index: number): Phrase[] {
  if (!Number.isInteger(index) || index < 0) return [];
  const found: Phrase[] = [];
  if (index < legacyPhrases.length) found.push(legacyPhrases[index]);
  if (index < phrases.length) found.push(phrases[index]);
  return found;
}

function recoverFromDoneKeys(): Phrase[] {
  if (typeof window === "undefined") return [];
  const recovered: Phrase[] = [];
  const seen = new Set<string>();
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      if (window.localStorage.getItem(key) !== "1") continue;
      const dateKey = key.slice(STORAGE_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
      addPhrase(
        recovered,
        seen,
        legacyPhrases[indexForDateKey(dateKey, legacyPhrases.length)],
      );
      addPhrase(
        recovered,
        seen,
        phrases[indexForDateKey(dateKey, phrases.length)],
      );
    }
  } catch {
    // ignore
  }
  return recovered;
}

function collectFromEntries(entries: unknown[], recoverLegacy: boolean): Phrase[] {
  const result: Phrase[] = [];
  const seen = new Set<string>();

  for (const item of entries) {
    if (isPhraseSnapshot(item)) {
      addPhrase(result, seen, item);
      if (recoverLegacy) {
        const currentIndex = phrases.findIndex(
          (entry) => entry.phrase === item.phrase,
        );
        if (currentIndex >= 0) {
          addPhrase(result, seen, legacyPhrases[currentIndex] ?? null);
        }
      }
      continue;
    }
    if (typeof item === "number") {
      for (const phrase of phrasesAtIndex(item)) {
        addPhrase(result, seen, phrase);
      }
    }
  }

  return result;
}

/**
 * Previously shown phrases, newest first.
 * Stored as full snapshots so library edits do not drop history.
 */
export function getSeenPhrases(): Phrase[] {
  if (typeof window === "undefined") return [];

  let recovered = false;
  try {
    recovered = window.localStorage.getItem(HISTORY_RECOVERED_KEY) === "1";
  } catch {
    recovered = true;
  }

  if (!recovered) {
    backupHistoryRaw();
    const mergedEntries = [
      ...readHistoryRaw(HISTORY_STORAGE_KEY),
      ...readHistoryRaw(HISTORY_BACKUP_KEY),
    ];
    const restored = collectFromEntries(mergedEntries, true);
    for (const phrase of recoverFromDoneKeys()) {
      if (restored.some((item) => item.phrase === phrase.phrase)) continue;
      restored.push(phrase);
    }
    try {
      window.localStorage.setItem(HISTORY_RECOVERED_KEY, "1");
    } catch {
      // ignore
    }
    return persistHistory(restored);
  }

  return collectFromEntries(readHistoryRaw(), false);
}

export function markPhraseSeen(phrase: Phrase): Phrase[] {
  if (typeof window === "undefined") return [];
  const next = [
    phrase,
    ...getSeenPhrases().filter((item) => item.phrase !== phrase.phrase),
  ];
  return persistHistory(next);
}
