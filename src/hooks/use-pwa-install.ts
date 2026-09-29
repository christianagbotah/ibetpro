"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ibetpro_install_dismissed";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000;

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;
  const dismissedAt = parseInt(dismissed, 10);
  if (Date.now() - dismissedAt > DISMISS_DURATION) {
    localStorage.removeItem(DISMISS_KEY);
    return false;
  }
  return true;
}

function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return "standalone" in navigator &&
    Boolean((navigator as unknown as { standalone?: boolean }).standalone);
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(detectInstalled);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (detectInstalled()) return;

    const beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      if (!isDismissed()) {
        setTimeout(() => setShowBanner(true), 3000);
      }
    };

    const appInstalledHandler = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setInstallPrompt(null);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", beforeInstallHandler);
    window.addEventListener("appinstalled", appInstalledHandler);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    let mobileTimer: ReturnType<typeof setTimeout> | null = null;
    if (isMobile && !isDismissed()) {
      mobileTimer = setTimeout(() => setShowBanner(true), 5000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
      if (mobileTimer) clearTimeout(mobileTimer);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === "accepted") {
        setIsInstalled(true);
        setShowBanner(false);
        localStorage.removeItem(DISMISS_KEY);
      }
    } catch (error) {
      console.error("Install prompt failed:", error);
    }
    setInstallPrompt(null);
  }, [installPrompt]);

  const dismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }, []);

  return {
    isInstalled,
    showBanner,
    install,
    dismiss,
    canInstall: !!installPrompt,
    isMobile:
      typeof window !== "undefined" &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  };
}
