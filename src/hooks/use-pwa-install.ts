"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ibetpro_install_dismissed";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

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

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Also check navigator.standalone for iOS Safari
    if ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone) {
      setIsInstalled(true);
      return;
    }

    // Listen for beforeinstallprompt (Chrome/Edge on Android, desktop)
    const beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      // Show banner after a short delay (if not dismissed)
      if (!isDismissed()) {
        setTimeout(() => setShowBanner(true), 3000);
      }
    };

    window.addEventListener("beforeinstallprompt", beforeInstallHandler);

    // Listen for appinstalled event (if user installs via browser chrome)
    const appInstalledHandler = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setInstallPrompt(null);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("appinstalled", appInstalledHandler);

    // On mobile without beforeinstallprompt support (iOS Safari),
    // still show the banner with manual instructions
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && !isInstalled && !isDismissed()) {
      setTimeout(() => setShowBanner(true), 5000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
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
    isMobile: typeof window !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  };
}
