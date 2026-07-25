/* Daily Phrase — local reminder service worker */

const STATE_CACHE = "daily-phrase-state-v1";
const STATE_URL = "/__daily-phrase-state";
const ICON_PATH = "/icon-192.png";
const BADGE_PATH = "/favicon-32.png";
const DEFAULT_TIMES = [
  { hour: 12, minute: 0 },
  { hour: 20, minute: 0 },
];

/** @type {ReturnType<typeof setTimeout> | null} */
let scheduleTimer = null;

function assetUrl(path) {
  return new URL(path, self.location.origin).href;
}

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeTimes(times) {
  if (!Array.isArray(times) || times.length === 0) return DEFAULT_TIMES;
  return times
    .map((slot) => ({
      hour: typeof slot.hour === "number" ? slot.hour : 12,
      minute: typeof slot.minute === "number" ? slot.minute : 0,
    }))
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

/** Milliseconds until the soonest slot among daily times. */
function msUntilNextSlot(times) {
  const now = Date.now();
  let best = Infinity;

  for (const slot of normalizeTimes(times)) {
    const next = new Date();
    next.setHours(slot.hour, slot.minute, 0, 0);
    if (next.getTime() <= now) {
      next.setDate(next.getDate() + 1);
    }
    const delay = next.getTime() - now;
    if (delay < best) best = delay;
  }

  return best === Infinity ? msUntilNextSlot(DEFAULT_TIMES) : best;
}

async function getState() {
  const cache = await caches.open(STATE_CACHE);
  const res = await cache.match(STATE_URL);
  if (!res) {
    return {
      enabled: false,
      times: DEFAULT_TIMES,
      doneKey: null,
      done: false,
      phrases: {},
    };
  }
  return res.json();
}

async function setState(partial) {
  const prev = await getState();
  const next = { ...prev, ...partial };
  if (partial.phrases && typeof partial.phrases === "object") {
    next.phrases = { ...(prev.phrases || {}), ...partial.phrases };
  }
  if (partial.times) {
    next.times = normalizeTimes(partial.times);
  }
  const cache = await caches.open(STATE_CACHE);
  await cache.put(
    STATE_URL,
    new Response(JSON.stringify(next), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  return next;
}

function notificationContent(state) {
  const key = todayKey();
  const entry = state.phrases && state.phrases[key];
  if (entry && entry.phrase) {
    return {
      title: entry.phrase,
      body: entry.translation || "",
    };
  }
  return {
    title: "Today's phrase",
    body: "Your phrase is ready — go look",
  };
}

function notificationOptions(state) {
  const { body } = notificationContent(state);
  return {
    body,
    tag: "daily-phrase",
    icon: assetUrl(ICON_PATH),
    badge: assetUrl(BADGE_PATH),
  };
}

async function askClientsToRefreshPhrases() {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage({ type: "refresh-reminder-phrase" });
  }
}

async function showReminder() {
  const state = await getState();
  if (!state.enabled) return;

  const key = todayKey();
  if (state.done && state.doneKey === key) {
    await armSchedule();
    return;
  }

  const { title } = notificationContent(state);
  await self.registration.showNotification(title, notificationOptions(state));

  await armSchedule();
  await askClientsToRefreshPhrases();
}

async function armSchedule() {
  if (scheduleTimer != null) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }

  const state = await getState();
  if (!state.enabled) return;

  const delay = msUntilNextSlot(state.times || DEFAULT_TIMES);
  scheduleTimer = setTimeout(() => {
    showReminder();
  }, delay);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open("daily-phrase-icons-v1")
      .then((cache) => cache.addAll([ICON_PATH, BADGE_PATH]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(() => armSchedule()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  event.waitUntil(
    (async () => {
      if (data.type === "schedule") {
        await setState({
          enabled: true,
          times: data.times || DEFAULT_TIMES,
          phrases: data.phrases,
        });
        await armSchedule();
        return;
      }

      if (data.type === "cancel") {
        await setState({ enabled: false });
        if (scheduleTimer != null) {
          clearTimeout(scheduleTimer);
          scheduleTimer = null;
        }
        return;
      }

      if (data.type === "sync-done") {
        await setState({
          doneKey: data.key ?? null,
          done: Boolean(data.done),
          phrases: data.phrases,
        });
        return;
      }

      if (data.type === "test") {
        const state = await getState();
        const { title } = notificationContent(state);
        await self.registration.showNotification(
          title,
          notificationOptions(state),
        );
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow("/");
      }),
  );
});
