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

export default function Home() {
  const [phrase, setPhrase] = useState(() => getTodayPhrase());
  const [seenIndexes, setSeenIndexes] = useState<number[]>(() => [
    getTodayPhraseIndex(),
  ]);
  const [done, setDone] = useState(false);
  const [extra, setExtra] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setDone(isDoneToday());
    setMounted(true);
    prepareSpeechEngine();
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
      </div>
    </main>
  );
}
