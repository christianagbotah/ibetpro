"use client";

import { usePWAInstall } from "@/hooks/use-pwa-install";
import { X, Download, Smartphone, Share } from "lucide-react";

export function PWAInstallBanner() {
  const { showBanner, install, dismiss, canInstall, isMobile } = usePWAInstall();

  if (!showBanner) return null;

  // Detect iOS for specific instructions
  const isIOS = typeof window !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="fixed bottom-16 left-0 right-0 z-[60] p-3 sm:p-4 sm:bottom-0">
      <div className="max-w-lg mx-auto bg-card border border-primary/20 rounded-xl p-4 shadow-lg shadow-primary/10 flex flex-col gap-3 animate-slide-in-right">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Install iBetPro App</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {canInstall
                ? "Tap the button below to install instantly — no app store needed!"
                : isIOS
                  ? "Tap the Share button below, then 'Add to Home Screen'"
                  : "Open browser menu → 'Install app' or 'Add to Home Screen'"}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors -mt-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {canInstall ? (
          /* Direct install button — Chrome/Edge with beforeinstallprompt */
          <button
            onClick={install}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            <Download className="h-5 w-5" />
            Install Now
          </button>
        ) : isIOS ? (
          /* iOS Safari — guide to Share → Add to Home Screen */
          <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <Share className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-foreground">
                Tap <Share className="h-3 w-3 inline mx-0.5" /> Share → &quot;Add to Home Screen&quot;
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Look for the share icon at the bottom of Safari
              </p>
            </div>
          </div>
        ) : (
          /* Generic mobile — browser menu instructions */
          <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-foreground">
                Tap browser menu (⋮) → &quot;Install app&quot; or &quot;Add to Home Screen&quot;
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Works in Chrome, Edge, and Samsung Internet
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
