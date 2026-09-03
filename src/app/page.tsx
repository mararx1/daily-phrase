"use client";

import { useEffect, useState } from "react";
import {
  clearExtraView,
  getAnotherPhrase,
  getPhraseByIndex,
  getPhraseIndex,
  getTodayKey,
  getTodayPhrase,
  getTodayPhraseIndex,
  isDoneToday,
  loadExtraView,
  markDoneToday,
  saveExtraView,
} from "@/lib/daily";
import {
  disableDailyReminder,
  enableDailyReminder,
  ensureRemindersOnVisit,
  getReminderBlockReason,
  getReminderEnabled,
  getReminderPermission,
  isReminderTestAvailable,
  sendTestReminder,
  syncDoneStateToServiceWorker,
  type ReminderBlockReason,
} from "@/lib/notifications";
import {
  isSpeechSupported,
  prepareSpeechEngine,
  speakEnglish,
  stopSpeaking,
} from "@/lib/speech";

type Playing = "phrase" | "example" | null;

const btnMotion =
  "transition-colors motion-reduce:transition-none motion-reduce:active:scale-100";
const btnFill = `min-h-11 rounded-full bg-ink px-5 text-sm font-medium text-surface hover:opacity-90 active:scale-[0.98] active:opacity-80 ${btnMotion}`;
const btnOutline = `min-h-11 rounded-full border border-line px-5 text-sm font-medium text-ink hover:bg-line active:bg-line active:scale-[0.98] ${btnMotion}`;
const btnBlockFill = `w-full min-h-14 rounded-2xl bg-ink text-base font-medium text-surface hover:opacity-90 active:scale-[0.98] active:opacity-80 ${btnMotion}`;
const btnBlockOutline = `w-full min-h-14 rounded-2xl border border-line bg-transparent text-base font-medium text-ink hover:bg-line active:bg-line active:scale-[0.98] ${btnMotion}`;
const btnText = `min-h-11 w-full text-sm font-medium text-ink hover:underline ${btnMotion}`;

function SoundIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16.5 8.5a5 5 0 010 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M18.7 6.3a8 8 0 010 11.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 15V6a2 2 0 012-2h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-12 w-12 text-ink"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        className="stroke-surface"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function todayLabel(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());
}

function ReminderPanel({
  reason,
  enabled,
  denied,
  needsTap,
  busy,
  showTest,
  onAllow,
  onDisable,
  onTest,
}: {
  reason: ReminderBlockReason;
  enabled: boolean;
  denied: boolean;
  needsTap: boolean;
  busy: boolean;
  showTest: boolean;
  onAllow: () => void;
  onDisable: () => void;
  onTest: () => void;
}) {
  const hint = "text-sm leading-relaxed text-muted";

  if (reason === "insecure") {
    return (
      <p className={hint}>Open this page over HTTPS to turn on reminders.</p>
    );
  }

  if (reason === "ios-install") {
    return (
      <p className={hint}>
        On iPhone: Share → Add to Home Screen, then open the app icon to enable
        reminders.
      </p>
    );
  }

  if (reason === "unsupported") {
    return (
      <p className={hint}>Reminders are not supported in this browser.</p>
    );
  }

  if (denied) {
    return (
      <p className={hint} role="status">
        Notifications are blocked in browser settings. Enable them there, then
        return here to turn reminders on.
      </p>
    );
  }

  if (needsTap || !enabled) {
    return (
      <div className="flex flex-col items-stretch gap-2">
        <button
          type="button"
          onClick={onAllow}
          disabled={busy}
          className={`w-full ${btnOutline} disabled:opacity-50`}
        >
          Remind me at 12:00 and 20:00
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <p className={hint}>Reminders on · 12:00 and 20:00</p>
      <button
        type="button"
        onClick={onDisable}
        disabled={busy}
        className={`${btnText} disabled:opacity-50`}
      >
        Turn off reminders
      </button>
      {showTest ? (
        <button
          type="button"
          onClick={onTest}
          disabled={busy}
          className={`${btnText} text-muted disabled:opacity-50`}
        >
          Send test notification
        </button>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [phrase, setPhrase] = useState(() => getTodayPhrase());
  const [seenIndexes, setSeenIndexes] = useState<number[]>(() => [
    getTodayPhraseIndex(),
  ]);
  const [done, setDone] = useState(false);
  const [extra, setExtra] = useState(false);
  const [playing, setPlaying] = useState<Playing>(null);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [dateText, setDateText] = useState("");
  const [reminderReason, setReminderReason] =
    useState<ReminderBlockReason>("unsupported");
  const [reminderTest, setReminderTest] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderDenied, setReminderDenied] = useState(false);
  const [reminderNeedsTap, setReminderNeedsTap] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [remindersReady, setRemindersReady] = useState(false);

  useEffect(() => {
    setDateText(todayLabel());
    if (!isSpeechSupported()) {
      setStatus("Playback isn't available in this browser.");
    }
    prepareSpeechEngine();

    const extraView = loadExtraView();
    if (isDoneToday() && extraView) {
      const restored = getPhraseByIndex(extraView.index);
      if (restored) {
        setPhrase(restored);
        setSeenIndexes(extraView.seen);
        setExtra(true);
        setDone(false);
      } else {
        clearExtraView();
        setDone(true);
      }
    } else if (isDoneToday()) {
      setPhrase(getTodayPhrase());
      setDone(true);
      setExtra(false);
    } else {
      clearExtraView();
      setPhrase(getTodayPhrase());
      setSeenIndexes([getTodayPhraseIndex()]);
    }

    const reason = getReminderBlockReason();
    setReminderReason(reason);
    setReminderTest(isReminderTestAvailable());
    if (reason === "ok") {
      const permission = getReminderPermission();
      setReminderDenied(permission === "denied");
      setReminderNeedsTap(permission === "default");
      setReminderOn(permission === "granted" && getReminderEnabled());
    }
    setRemindersReady(true);

    if (reason !== "ok") return;

    void ensureRemindersOnVisit().then((result) => {
      setReminderOn(result.enabled);
      setReminderDenied(result.denied);
      setReminderNeedsTap(result.needsTap);
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      stopSpeaking();
      setPlaying(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const persistExtra = (nextPhrase: typeof phrase, seen: number[]) => {
    const index = getPhraseIndex(nextPhrase);
    saveExtraView({
      dateKey: getTodayKey(),
      index: index === -1 ? getTodayPhraseIndex() : index,
      seen,
    });
  };

  const haltSpeech = () => {
    stopSpeaking();
    setPlaying(null);
  };

  const playClip = (clip: Exclude<Playing, null>, text: string) => {
    if (playing === clip) {
      haltSpeech();
      return;
    }
    if (!isSpeechSupported()) {
      setStatus("Playback isn't available in this browser.");
      return;
    }
    const started = speakEnglish(text, {
      kind: clip,
      onStart: () => setPlaying(clip),
      onEnd: () => setPlaying((current) => (current === clip ? null : current)),
    });
    if (!started) {
      haltSpeech();
      setStatus("Playback isn't available in this browser.");
    } else {
      setPlaying(clip);
      setStatus("");
    }
  };

  const handleDone = () => {
    haltSpeech();
    markDoneToday();
    clearExtraView();
    setExtra(false);
    setPhrase(getTodayPhrase());
    setDone(true);
    setStatus("");
    void syncDoneStateToServiceWorker();
  };

  const handleWantMore = () => {
    haltSpeech();
    setStatus("");
    const next = getAnotherPhrase(seenIndexes);
    const nextIndex = getPhraseIndex(next);
    const seen =
      nextIndex === -1 || seenIndexes.includes(nextIndex)
        ? seenIndexes
        : [...seenIndexes, nextIndex];
    setPhrase(next);
    setSeenIndexes(seen);
    setExtra(true);
    setDone(false);
    persistExtra(next, seen);
  };

  const handleBackToToday = () => {
    haltSpeech();
    setStatus("");
    clearExtraView();
    setExtra(false);
    setPhrase(getTodayPhrase());
    setSeenIndexes([getTodayPhraseIndex()]);
    setDone(isDoneToday());
  };

  const handleCopy = async () => {
    const text = phrase.phrase;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      ok = document.execCommand("copy");
      area.remove();
    }
    if (ok) {
      setCopied(true);
      setStatus("Phrase copied.");
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      setStatus("Couldn't copy the phrase.");
    }
  };

  const handleReminderAllow = async () => {
    if (reminderBusy) return;
    setReminderBusy(true);
    try {
      const ok = await enableDailyReminder();
      setReminderOn(ok);
      setReminderNeedsTap(!ok && getReminderPermission() === "default");
      setReminderDenied(!ok && getReminderPermission() === "denied");
      setStatus(ok ? "Reminders on." : "");
    } finally {
      setReminderBusy(false);
    }
  };

  const handleReminderDisable = async () => {
    if (reminderBusy) return;
    setReminderBusy(true);
    try {
      await disableDailyReminder();
      setReminderOn(false);
      setReminderNeedsTap(getReminderPermission() === "default");
      setStatus("Reminders off.");
    } finally {
      setReminderBusy(false);
    }
  };

  const handleReminderTest = async () => {
    if (reminderBusy) return;
    setReminderBusy(true);
    try {
      const ok = await sendTestReminder();
      if (ok) {
        setReminderOn(true);
        setReminderNeedsTap(false);
        setStatus("Test notification sent.");
      }
      setReminderDenied(!ok && getReminderPermission() === "denied");
    } finally {
      setReminderBusy(false);
    }
  };

  const showDone = done && !extra;
  const liveText = playing
    ? playing === "phrase"
      ? "Playing the phrase."
      : "Playing the example."
    : status;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-surface px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        {showDone ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-4 py-10">
            <CheckIcon />
            <p className="text-lg font-medium text-ink">Saved for today</p>
            <div className="flex w-full flex-col gap-2">
              <p className="text-sm text-muted">
                Today&apos;s phrase
                {dateText ? ` · ${dateText}` : ""}
              </p>
              <h1 className="text-3xl font-semibold leading-snug text-ink">
                {phrase.phrase}
              </h1>
              <p lang="ru" className="text-base text-muted">
                {phrase.translation}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center gap-6 py-10">
            <p className="text-sm font-medium text-muted">
              {extra ? "Another phrase" : "Today's phrase"}
              {dateText ? ` · ${dateText}` : ""}
            </p>

            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold leading-snug text-ink">
                {phrase.phrase}
              </h1>
              <p lang="ru" className="text-base text-muted">
                {phrase.translation}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => playClip("phrase", phrase.phrase)}
                  aria-pressed={playing === "phrase"}
                  aria-label={
                    playing === "phrase" ? "Stop phrase" : "Listen to phrase"
                  }
                  className={`inline-flex items-center justify-center gap-2 ${
                    playing === "phrase" ? btnOutline : btnFill
                  }`}
                >
                  {playing === "phrase" ? <StopIcon /> : <SoundIcon />}
                  {playing === "phrase" ? "Stop" : "Listen to phrase"}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={copied ? "Phrase copied" : "Copy phrase"}
                  className={`inline-flex items-center justify-center gap-2 ${btnOutline}`}
                >
                  <CopyIcon />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-line pt-5">
              <p className="text-base leading-relaxed text-ink">
                {phrase.example}
              </p>
              <p lang="ru" className="text-sm leading-relaxed text-muted">
                {phrase.exampleTranslation}
              </p>
              <button
                type="button"
                onClick={() => playClip("example", phrase.example)}
                aria-pressed={playing === "example"}
                  aria-label={
                    playing === "example" ? "Stop example" : "Listen to example"
                  }
                  className={`inline-flex w-fit items-center justify-center gap-2 ${
                  playing === "example" ? btnFill : btnOutline
                }`}
              >
                {playing === "example" ? <StopIcon /> : <SoundIcon />}
                {playing === "example" ? "Stop" : "Listen to example"}
              </button>
            </div>
          </div>
        )}

        <div
          className="min-h-5 text-sm text-muted"
          role="status"
          aria-live="polite"
        >
          {liveText}
        </div>

        <div className="flex flex-col gap-2 pb-8 pt-4">
          {showDone ? (
            <button type="button" onClick={handleWantMore} className={btnBlockFill}>
              Practice another phrase
            </button>
          ) : extra ? (
            <>
              <button type="button" onClick={handleWantMore} className={btnBlockFill}>
                Next phrase
              </button>
              <button
                type="button"
                onClick={handleBackToToday}
                className={btnBlockOutline}
              >
                Back to today's phrase
              </button>
            </>
          ) : (
            <button type="button" onClick={handleDone} className={btnBlockOutline}>
              Done for today
            </button>
          )}
          {remindersReady ? (
            <ReminderPanel
              reason={reminderReason}
              enabled={reminderOn}
              denied={reminderDenied}
              needsTap={reminderNeedsTap}
              busy={reminderBusy}
              showTest={reminderTest && reminderOn}
              onAllow={handleReminderAllow}
              onDisable={handleReminderDisable}
              onTest={handleReminderTest}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
