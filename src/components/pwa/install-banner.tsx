"use client";

import { usePWAInstall } from "@/hooks/use-pwa-install";
import { X, Download, Smartphone } from "lucide-react";

export function PWAInstallBanner() {
  const { showBanner, install, dismiss, canInstall } = usePWAInstall();

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4">
      <div className="max-w-lg mx-auto bg-card border border-primary/20 rounded-xl p-3 shadow-lg shadow-primary/5 flex items-center gap-3 animate-slide-in-right">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Smartphone className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">Install iBetPro App</p>
          <p className="text-[10px] text-muted-foreground">
            {canInstall
              ? "Add to home screen for the best mobile experience"
              : "Open in browser menu → 'Add to Home Screen'"}
          </p>
        </div>
        {canInstall && (
          <button
            onClick={install}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
          >
            <Download className="h-3 w-3 mr-1 inline" /> Install
          </button>
        )}
        <button
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
