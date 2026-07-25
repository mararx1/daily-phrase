"use client";

import { useEffect } from "react";
import {
  getReminderEnabled,
  registerServiceWorker,
  refreshReminderSchedule,
} from "@/lib/notifications";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "refresh-reminder-phrase") return;
      if (!getReminderEnabled()) return;
      void refreshReminderSchedule();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    void registerServiceWorker();

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
