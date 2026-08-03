// ============================================================================
// iBetPro Currency Conversion Service
// Uses frankfurter.app (free, open-source, no API key needed)
// Rates are cached for 1 hour to minimize API calls
// Internal accounting stays in base currency (USD/GHS);
// conversion is for display purposes only.
// ============================================================================

import { REGIONS, getRegionInfo } from "./regions";

// Base currency for internal accounting
const BASE_CURRENCY = "GHS"; // Ghana Cedi — matches Africa/Accra timezone

// Cache: rates relative to BASE_CURRENCY, refreshed hourly
let ratesCache: Record<string, number> = { [BASE_CURRENCY]: 1 };
let ratesCacheAt: number = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Fallback rates (used when API is unreachable)
// These are approximate and should be updated periodically
const FALLBACK_RATES: Record<string, number> = {
  GHS: 1,
  USD: 0.0769,   // 1 GHS ≈ 0.077 USD (≈13 GHS/USD)
  NGN: 121.5,    // 1 GHS ≈ 121.5 NGN
  GBP: 0.0608,   // 1 GHS ≈ 0.061 GBP
  EUR: 0.0709,   // 1 GHS ≈ 0.071 EUR
  KES: 10.0,     // 1 GHS ≈ 10 KES
  ZAR: 1.43,     // 1 GHS ≈ 1.43 ZAR
  XOF: 47.5,     // 1 GHS ≈ 47.5 XOF
  XAF: 47.5,     // 1 GHS ≈ 47.5 XAF
  CAD: 0.105,
  AUD: 0.12,
  BRL: 0.39,
  INR: 6.45,
  SEK: 0.81,
  CHF: 0.068,
  JPY: 11.7,
  CNY: 0.557,
  TRY: 2.78,
  EGP: 3.85,
  MAD: 0.74,
  TND: 0.24,
  TZS: 200.0,
  UGX: 290.0,
  RWF: 100.0,
  ETB: 9.5,
  ZMW: 2.1,
  MWK: 135.0,
  BWP: 1.04,
  MZN: 4.9,
  ARS: 82.0,
  MXN: 1.57,
  PLN: 0.31,
  NOK: 0.84,
  UAH: 3.2,
  PKR: 21.7,
  PHP: 4.5,
  VND: 1970.0,
  THB: 2.7,
  MYR: 0.35,
  IDR: 1240.0,
  BDT: 9.3,
  LKR: 24.3,
  QAR: 0.28,
  AED: 0.283,
  SAR: 0.289,
};

/**
 * Fetch live exchange rates from frankfurter.app (free, no API key)
 * Returns rates relative to BASE_CURRENCY
 */
async function fetchLiveRates(): Promise<Record<string, number>> {
  try {
    // frankfurter.app supports ~30 currencies, free, no key
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${BASE_CURRENCY}`,
      { signal: AbortSignal.timeout(5000) } // 5s timeout
    );

    if (!res.ok) {
      console.warn("[Currency] Frankfurter API returned", res.status);
      return FALLBACK_RATES;
    }

    const data = await res.json();
    if (data.rates && typeof data.rates === "object") {
      // Add base currency
      return { [BASE_CURRENCY]: 1, ...data.rates };
    }

    return FALLBACK_RATES;
  } catch (error) {
    console.warn("[Currency] Failed to fetch live rates:", error);
    return FALLBACK_RATES;
  }
}

/**
 * Get cached exchange rates, refreshing if stale
 */
async function getRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - ratesCacheAt > CACHE_TTL_MS) {
    const freshRates = await fetchLiveRates();
    ratesCache = freshRates;
    ratesCacheAt = now;
  }
  return ratesCache;
}

/**
 * Convert an amount from one currency to another
 * @param amount - The amount to convert
 * @param from - Source currency code (e.g. "USD")
 * @param to - Target currency code (e.g. "GHS")
 * @returns Converted amount
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;

  const rates = await getRates();
  const fromRate = rates[from];
  const toRate = rates[to];

  if (!fromRate || !toRate) {
    // Fallback: can't convert, return original amount
    console.warn(`[Currency] No rate for ${from}→${to}, returning original amount`);
    return amount;
  }

  // Convert: amount_in_from → amount_in_base → amount_in_to
  const amountInBase = amount / fromRate;
  return amountInBase * toRate;
}

/**
 * Sync version using cached/fallback rates (for server-side rendering)
 */
export function convertCurrencySync(
  amount: number,
  from: string,
  to: string
): number {
  if (from === to) return amount;

  const fromRate = ratesCache[from] || FALLBACK_RATES[from];
  const toRate = ratesCache[to] || FALLBACK_RATES[to];

  if (!fromRate || !toRate) return amount;

  const amountInBase = amount / fromRate;
  return amountInBase * toRate;
}

/**
 * Format an amount with currency symbol
 * @param amount - The amount
 * @param currencyCode - ISO 4217 currency code (e.g. "GHS", "NGN", "USD")
 * @param options - Formatting options
 */
export function formatMoney(
  amount: number,
  currencyCode: string,
  options: {
    showCode?: boolean;    // Show currency code after symbol (e.g. "₵1,000" vs "₵1,000 GHS")
    compact?: boolean;     // Compact format (e.g. "₵1.2K" instead of "₵1,200")
    decimals?: number;     // Override decimal places
  } = {}
): string {
  const region = REGIONS.find((r) => r.currencyCode === currencyCode);
  const symbol = region?.currencySymbol || "$";

  const { showCode = false, compact = false, decimals } = options;

  let formatted: string;

  if (compact && Math.abs(amount) >= 1000) {
    // Compact format: 1.2K, 1.5M
    if (amount >= 1_000_000) {
      formatted = `${(amount / 1_000_000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      formatted = `${(amount / 1000).toFixed(1)}K`;
    } else {
      formatted = amount.toFixed(decimals ?? 2);
    }
  } else {
    formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: decimals ?? 2,
      maximumFractionDigits: decimals ?? 2,
    });
  }

  const prefix = amount < 0 ? "-" : "";
  const absFormatted = formatted.replace("-", "");

  return `${prefix}${symbol}${absFormatted}${showCode ? ` ${currencyCode}` : ""}`;
}

/**
 * Get currency info for a region code
 */
export function getCurrencyInfo(regionCode: string) {
  const region = getRegionInfo(regionCode);
  if (region) {
    return {
      code: region.currencyCode,
      symbol: region.currencySymbol,
      name: region.currencyName,
    };
  }
  return { code: "GHS", symbol: "₵", name: "Cedi" };
}

/**
 * Get all unique currencies supported by the platform
 */
export function getSupportedCurrencies(): {
  code: string;
  symbol: string;
  name: string;
}[] {
  const seen = new Set<string>();
  return REGIONS.filter((r) => {
    if (seen.has(r.currencyCode)) return false;
    seen.add(r.currencyCode);
    return true;
  }).map((r) => ({
    code: r.currencyCode,
    symbol: r.currencySymbol,
    name: r.currencyName,
  }));
}

/**
 * Auto-detect region from browser timezone
 * Maps IANA timezone to region code
 */
export function detectRegionFromTimezone(timezone: string): string {
  // Direct timezone → region mapping
  const tzToRegion: Record<string, string> = {
    // West Africa
    "Africa/Lagos": "ng",
    "Africa/Accra": "gh",
    "Africa/Abidjan": "ci",
    "Africa/Dakar": "sn",
    "Africa/Douala": "cm",
    // East Africa
    "Africa/Nairobi": "ke",
    "Africa/Dar_es_Salaam": "tz",
    "Africa/Kampala": "ug",
    "Africa/Kigali": "rw",
    "Africa/Addis_Ababa": "et",
    // Southern Africa
    "Africa/Johannesburg": "za",
    "Africa/Lusaka": "zm",
    "Africa/Blantyre": "mw",
    "Africa/Gaborone": "bw",
    "Africa/Maputo": "mz",
    // North Africa
    "Africa/Cairo": "eg",
    "Africa/Casablanca": "ma",
    "Africa/Tunis": "tn",
    // Europe
    "Europe/London": "gb",
    "Europe/Dublin": "ie",
    "Europe/Berlin": "de",
    "Europe/Paris": "fr",
    "Europe/Madrid": "es",
    "Europe/Rome": "it",
    "Europe/Lisbon": "pt",
    "Europe/Amsterdam": "nl",
    "Europe/Stockholm": "se",
    "Europe/Oslo": "no",
    "Europe/Warsaw": "pl",
    "Europe/Athens": "gr",
    "Europe/Istanbul": "tr",
    // Americas
    "America/New_York": "us",
    "America/Chicago": "us",
    "America/Denver": "us",
    "America/Los_Angeles": "us",
    "America/Toronto": "ca",
    "America/Vancouver": "ca",
    "America/Sao_Paulo": "br",
    "America/Buenos_Aires": "ar",
    "America/Mexico_City": "mx",
    // Asia
    "Asia/Kolkata": "in",
    "Asia/Karachi": "pk",
    "Asia/Dhaka": "bd",
    "Asia/Bangkok": "th",
    "Asia/Singapore": "my",
    "Asia/Tokyo": "jp",
    "Asia/Shanghai": "cn",
    "Asia/Seoul": "kr",
    "Asia/Dubai": "ae",
    "Asia/Qatar": "qa",
    "Asia/Riyadh": "sa",
  };

  return tzToRegion[timezone] || "gh"; // Default to Ghana (matches Africa/Accra)
}

// Force-refresh rates (useful for cron or admin action)
export async function refreshRates(): Promise<Record<string, number>> {
  ratesCacheAt = 0; // Invalidate cache
  return getRates();
}
