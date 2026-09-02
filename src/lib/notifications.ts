import {
  getPhraseForDateKey,
  getTodayKey,
  getTodayPhrase,
  isDoneToday,
  toDateKey,
} from "./daily";

const REMINDER_STORAGE_KEY = "daily-phrase:reminders";

/** Local times for daily phrase notifications. */
export const REMINDER_SLOTS = [
  { hour: 12, minute: 0 },
  { hour: 20, minute: 0 },
] as const;

export type ReminderPermission =
  | NotificationPermission
  | "unsupported";

export type ReminderBlockReason =
  | "ok"
  | "insecure"
  | "ios-install"
  | "unsupported";

export type ReminderVisitResult = {
  enabled: boolean;
  denied: boolean;
  /** Native dialog needs a tap (browser blocked auto-prompt). */
  needsTap: boolean;
};

export function isSecureAppContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** True when running as installed Home Screen / standalone PWA. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true
    || window.matchMedia("(display-mode: standalone)").matches
  );
}

export function isNotificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "Notification" in window
  );
}

export function getReminderBlockReason(): ReminderBlockReason {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (isNotificationsSupported()) return "ok";
  // iOS Safari exposes Notification only after Add to Home Screen (16.4+)
  if (isIosDevice() && !isStandaloneDisplay()) return "ios-install";
  return "unsupported";
}

/** Local preview control — shown on localhost / LAN during development. */
export function isReminderTestAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".trycloudflare.com") ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host)
  );
}

export function getReminderPermission(): ReminderPermission {
  if (!isNotificationsSupported()) return "unsupported";
  return Notification.permission;
}

export function getReminderEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REMINDER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setReminderEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      REMINDER_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // private mode — ignore
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function postToServiceWorker(message: Record<string, unknown>): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const worker =
    registration.active ??
    navigator.serviceWorker.controller ??
    registration.waiting ??
    registration.installing;
  if (!worker) return;
  worker.postMessage(message);
}

function phrasePayloadForKeys(keys: string[]): Record<
  string,
  { phrase: string; translation: string }
> {
  const out: Record<string, { phrase: string; translation: string }> = {};
  for (const key of keys) {
    const item = getPhraseForDateKey(key);
    out[key] = { phrase: item.phrase, translation: item.translation };
  }
  return out;
}

function nearbyDateKeys(): string[] {
  const keys: string[] = [];
  const base = new Date();
  for (let offset = 0; offset <= 2; offset++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    keys.push(toDateKey(d));
  }
  return keys;
}

async function pushScheduleToServiceWorker(): Promise<void> {
  await postToServiceWorker({
    type: "schedule",
    times: REMINDER_SLOTS.map((slot) => ({
      hour: slot.hour,
      minute: slot.minute,
    })),
    phrases: phrasePayloadForKeys(nearbyDateKeys()),
  });
}

export async function syncDoneStateToServiceWorker(): Promise<void> {
  if (!isNotificationsSupported()) return;
  await postToServiceWorker({
    type: "sync-done",
    key: getTodayKey(),
    done: isDoneToday(),
    phrases: phrasePayloadForKeys(nearbyDateKeys()),
  });
}

export async function refreshReminderSchedule(): Promise<void> {
  if (!isNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  if (!getReminderEnabled()) return;

  await registerServiceWorker();
  await syncDoneStateToServiceWorker();
  await pushScheduleToServiceWorker();
}

async function activateReminders(): Promise<boolean> {
  await registerServiceWorker();
  setReminderEnabled(true);
  await syncDoneStateToServiceWorker();
  await pushScheduleToServiceWorker();
  return true;
}

/**
 * On app open: arm the schedule only if the user already opted in.
 * Never prompt for permission without a tap.
 */
export async function ensureRemindersOnVisit(): Promise<ReminderVisitResult> {
  if (!isNotificationsSupported()) {
    return { enabled: false, denied: false, needsTap: false };
  }

  await registerServiceWorker();

  if (Notification.permission === "denied") {
    setReminderEnabled(false);
    return { enabled: false, denied: true, needsTap: false };
  }

  if (Notification.permission === "granted") {
    if (getReminderEnabled()) {
      await activateReminders();
      return { enabled: true, denied: false, needsTap: false };
    }
    return { enabled: false, denied: false, needsTap: false };
  }

  return { enabled: false, denied: false, needsTap: true };
}

/** User-tapped allow (when auto-prompt was blocked). */
export async function enableDailyReminder(): Promise<boolean> {
  if (!isNotificationsSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setReminderEnabled(false);
    return false;
  }

  return activateReminders();
}

export async function disableDailyReminder(): Promise<void> {
  setReminderEnabled(false);
  if (!isNotificationsSupported()) return;
  await postToServiceWorker({ type: "cancel" });
}

function notificationIconUrl(): string {
  return new URL("/icon-192.png", window.location.origin).href;
}

function notificationBadgeUrl(): string {
  return new URL("/favicon-32.png", window.location.origin).href;
}

/** Fires the same notification payload immediately (for local preview). */
export async function sendTestReminder(): Promise<boolean> {
  if (!isNotificationsSupported()) return false;
  if (Notification.permission !== "granted") return false;

  const today = getTodayPhrase();
  const options: NotificationOptions = {
    body: today.translation,
    tag: "daily-phrase",
    icon: notificationIconUrl(),
    badge: notificationBadgeUrl(),
  };

  await registerServiceWorker();
  await syncDoneStateToServiceWorker();
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(today.phrase, options);
    return true;
  } catch {
    new Notification(today.phrase, options);
    return true;
  }
}
