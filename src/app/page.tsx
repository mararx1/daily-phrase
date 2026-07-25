"use client";

import { useEffect, useState } from "react";
import {
  getAnotherPhrase,
  getPhraseIndex,
  getTodayPhrase,
  getTodayPhraseIndex,
  isDoneToday,
  markDoneToday,
} from "@/lib/daily";
import {
  enableDailyReminder,
  ensureRemindersOnVisit,
  getReminderBlockReason,
  getReminderPermission,
  isReminderTestAvailable,
  sendTestReminder,
  syncDoneStateToServiceWorker,
  type ReminderBlockReason,
} from "@/lib/notifications";
import { prepareSpeechEngine, speakEnglish, stopSpeaking } from "@/lib/speech";

function SoundIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
      />
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

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="#1c1c1e" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke="#fafafa"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReminderPanel({
  reason,
  enabled,
  denied,
  needsTap,
  busy,
  showTest,
  onAllow,
  onTest,
}: {
  reason: ReminderBlockReason;
  enabled: boolean;
  denied: boolean;
  needsTap: boolean;
  busy: boolean;
  showTest: boolean;
  onAllow: () => void;
  onTest: () => void;
}) {
  if (reason === "insecure") {
    return (
      <p className="text-center text-xs text-muted">
        Open via HTTPS to enable reminders
      </p>
    );
  }

  if (reason === "ios-install") {
    return (
      <p className="text-center text-xs leading-relaxed text-muted">
        On iPhone: Share → Add to Home Screen,
        <br />
        then open the app icon for reminders
      </p>
    );
  }

  if (reason === "unsupported") {
    return (
      <p className="text-center text-xs text-muted">
        Notifications not supported in this browser
      </p>
    );
  }

  if (denied) {
    return (
      <p className="text-center text-xs text-muted">
        Notifications blocked in browser settings
      </p>
    );
  }

  if (needsTap) {
    return (
      <div className="flex flex-col items-stretch gap-1">
        <button
          type="button"
          onClick={onAllow}
          disabled={busy}
          className="w-full rounded-2xl border border-line py-3 text-sm font-medium text-ink transition-transform active:scale-[0.98] active:bg-line disabled:opacity-50"
        >
          Allow phrase reminders
        </button>
        <p className="text-center text-xs text-muted">12:00 and 20:00 every day</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      {enabled ? (
        <p className="py-2 text-center text-xs text-muted">
          Reminders on · 12:00 & 20:00
        </p>
      ) : null}
      {showTest ? (
        <button
          type="button"
          onClick={onTest}
          disabled={busy}
          className="w-full py-1 text-xs text-muted transition-colors active:text-ink disabled:opacity-50"
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
  const [mounted, setMounted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [reminderReason, setReminderReason] =
    useState<ReminderBlockReason>("unsupported");
  const [reminderTest, setReminderTest] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderDenied, setReminderDenied] = useState(false);
  const [reminderNeedsTap, setReminderNeedsTap] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);

  useEffect(() => {
    setDone(isDoneToday());
    setMounted(true);
    prepareSpeechEngine();

    const reason = getReminderBlockReason();
    setReminderReason(reason);
    setReminderTest(isReminderTestAvailable());
    if (reason !== "ok") return;

    void ensureRemindersOnVisit().then((result) => {
      setReminderOn(result.enabled);
      setReminderDenied(result.denied);
      setReminderNeedsTap(result.needsTap);
    });
  }, []);

  const handleListen = () => {
    speakEnglish(phrase.phrase, {
      gender: "female",
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  };

  const handleListenExample = () => {
    speakEnglish(phrase.example, {
      gender: "male",
      rate: 0.86,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  };

  const handleDone = () => {
    stopSpeaking();
    setSpeaking(false);
    markDoneToday();
    setExtra(false);
    setDone(true);
    void syncDoneStateToServiceWorker();
  };

  const handleReminderAllow = async () => {
    if (reminderBusy) return;
    setReminderBusy(true);
    try {
      const ok = await enableDailyReminder();
      setReminderOn(ok);
      setReminderNeedsTap(!ok && getReminderPermission() === "default");
      setReminderDenied(!ok && getReminderPermission() === "denied");
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
      }
      setReminderDenied(!ok && getReminderPermission() === "denied");
    } finally {
      setReminderBusy(false);
    }
  };

  const handleWantMore = () => {
    stopSpeaking();
    setSpeaking(false);

    const next = getAnotherPhrase(seenIndexes);
    const nextIndex = getPhraseIndex(next);
    setPhrase(next);
    setSeenIndexes((prev) =>
      nextIndex === -1 || prev.includes(nextIndex) ? prev : [...prev, nextIndex],
    );
    setExtra(true);
    setDone(false);
  };

  if (!mounted) {
    return <main className="min-h-screen bg-surface" />;
  }

  if (done) {
    return (
      <main className="flex min-h-[100dvh] flex-col bg-surface px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center transition-opacity duration-300">
          <CheckIcon />
          <p className="text-lg font-medium text-ink">Done for today</p>
          <p className="max-w-xs text-2xl font-semibold leading-snug text-ink">
            {phrase.phrase}
          </p>
          <p className="text-sm text-muted">Come back tomorrow</p>
        </div>
        <div className="mx-auto w-full max-w-[440px] pb-8 pt-4">
          <button
            type="button"
            onClick={handleWantMore}
            className="w-full rounded-2xl border border-line bg-transparent py-4 text-base font-medium text-ink transition-transform active:scale-[0.98] active:bg-line"
          >
            I want more
          </button>
          <div className="mt-2">
            <ReminderPanel
              reason={reminderReason}
              enabled={reminderOn}
              denied={reminderDenied}
              needsTap={reminderNeedsTap}
              busy={reminderBusy}
              showTest={reminderTest}
              onAllow={handleReminderAllow}
              onTest={handleReminderTest}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-surface px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          {extra ? "One more phrase" : "Today's phrase"}
        </p>

        <div className="flex flex-col items-center gap-2">
          <h1 className="max-w-xs text-3xl font-semibold leading-snug text-ink">
            {phrase.phrase}
          </h1>
          <p className="max-w-xs text-base text-muted">{phrase.translation}</p>
        </div>

        <button
          type="button"
          onClick={handleListen}
          aria-pressed={speaking}
          className={`flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors active:bg-line ${
            speaking ? "bg-line" : ""
          }`}
        >
          <SoundIcon />
          Listen
        </button>

        <div className="mt-4 flex max-w-xs flex-col items-center gap-3 border-t border-line pt-5">
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-base text-ink">{phrase.example}</p>
            <p className="text-sm text-muted">{phrase.exampleTranslation}</p>
          </div>
          <button
            type="button"
            onClick={handleListenExample}
            aria-pressed={speaking}
            className="flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-muted transition-colors active:bg-line"
          >
            <SoundIcon />
            Example
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[440px] pb-8 pt-4">
        <button
          type="button"
          onClick={handleDone}
          className="w-full rounded-2xl bg-ink py-4 text-base font-medium text-surface transition-transform active:scale-[0.98]"
        >
          Done for today
        </button>
        <div className="mt-2">
          <ReminderPanel
            reason={reminderReason}
            enabled={reminderOn}
            denied={reminderDenied}
            needsTap={reminderNeedsTap}
            busy={reminderBusy}
            showTest={reminderTest}
            onAllow={handleReminderAllow}
            onTest={handleReminderTest}
          />
        </div>
      </div>
    </main>
  );
}
