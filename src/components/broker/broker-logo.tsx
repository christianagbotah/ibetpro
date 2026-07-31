"use client";

import { useState, useCallback } from "react";
import { getPlatformLogoPath, getBrokerSvgPath, generateFallbackLogo } from "@/lib/broker-logos";

interface BrokerLogoProps {
  platform: {
    id: string;
    name: string;
    color?: string;
    logoPath?: string;
  };
  size?: number;
  className?: string;
}

/**
 * Reliable broker logo component with progressive fallback:
 * 1. Try the logoPath or resolved PNG/SVG path
 * 2. On failure, try the SVG version (always exists)
 * 3. On final failure, use inline SVG data URL (never fails)
 */
export function BrokerLogo({ platform, size = 40, className = "" }: BrokerLogoProps) {
  const [stage, setStage] = useState<"primary" | "svg" | "fallback">("primary");

  const handleError = useCallback(() => {
    setStage((prev) => {
      if (prev === "primary") return "svg";
      if (prev === "svg") return "fallback";
      return prev;
    });
  }, []);

  const color = platform.color || "#10b981";

  // Stage 3: Inline SVG data URL (never fails)
  if (stage === "fallback") {
    const dataUrl = generateFallbackLogo(platform.name, color);
    return (
      <div
        className={`flex items-center justify-center rounded-lg overflow-hidden bg-secondary/50 border border-border ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={dataUrl}
          alt={platform.name}
          width={size}
          height={size}
          className="object-contain rounded-lg"
          draggable={false}
        />
      </div>
    );
  }

  // Stage 2: SVG version (always exists on disk)
  if (stage === "svg") {
    const svgPath = getBrokerSvgPath(platform.id);
    if (svgPath) {
      return (
        <div
          className={`flex items-center justify-center rounded-lg overflow-hidden bg-secondary/50 border border-border ${className}`}
          style={{ width: size, height: size }}
        >
          <img
            src={svgPath}
            alt={platform.name}
            width={size}
            height={size}
            className="object-contain rounded-lg"
            onError={handleError}
            draggable={false}
          />
        </div>
      );
    }
    // No SVG path available, go to fallback
    setStage("fallback");
  }

  // Stage 1: Primary logo (logoPath or resolved path)
  const primarySrc = getPlatformLogoPath(platform);

  return (
    <div
      className={`flex items-center justify-center rounded-lg overflow-hidden bg-secondary/50 border border-border ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={primarySrc}
        alt={platform.name}
        width={size}
        height={size}
        className="object-contain rounded-lg"
        onError={handleError}
        draggable={false}
      />
    </div>
  );
}
