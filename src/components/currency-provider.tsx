"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { REGIONS } from "@/lib/regions";

// ============================================================================
// Currency Context — provides user's currency symbol/code to the entire app
// Fetched once from /api/user/profile, shared via React context
// ============================================================================

interface CurrencyContextType {
  /** Currency symbol (e.g. "₵", "₦", "£", "€", "$") */
  symbol: string;
  /** ISO 4217 currency code (e.g. "GHS", "NGN", "GBP", "EUR", "USD") */
  code: string;
  /** Currency name (e.g. "Cedi", "Naira", "Pound Sterling") */
  name: string;
  /** Region code (e.g. "gh", "ng", "gb") */
  region: string;
  /** Format a money amount with the user's currency symbol */
  formatMoney: (amount: number, options?: { compact?: boolean; decimals?: number; showSign?: boolean }) => string;
  /** Whether the currency data has been loaded */
  loaded: boolean;
}

const defaultCurrency: CurrencyContextType = {
  symbol: "₵",
  code: "GHS",
  name: "Cedi",
  region: "gh",
  formatMoney: (amount) => `₵${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  loaded: false,
};

const CurrencyContext = createContext<CurrencyContextType>(defaultCurrency);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState("₵");
  const [code, setCode] = useState("GHS");
  const [name, setName] = useState("Cedi");
  const [region, setRegion] = useState("gh");
  const [loaded, setLoaded] = useState(false);

  // Fetch user's currency from profile API
  useEffect(() => {
    fetch("/api/user/profile")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          const regionInfo = REGIONS.find((r) => r.code === data.region);
          const currencyInfo = REGIONS.find((r) => r.currencyCode === data.currency);
          if (currencyInfo) {
            setSymbol(currencyInfo.currencySymbol);
            setCode(currencyInfo.currencyCode);
            setName(currencyInfo.currencyName);
          } else if (regionInfo) {
            setSymbol(regionInfo.currencySymbol);
            setCode(regionInfo.currencyCode);
            setName(regionInfo.currencyName);
          }
          if (data.region) setRegion(data.region);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const formatMoney = useCallback(
    (amount: number, options?: { compact?: boolean; decimals?: number; showSign?: boolean }) => {
      const { compact = false, decimals = 2, showSign = false } = options || {};

      const prefix = showSign && amount > 0 ? "+" : amount < 0 ? "-" : "";
      const absAmount = Math.abs(amount);

      let formatted: string;
      if (compact && absAmount >= 1_000_000) {
        formatted = `${(absAmount / 1_000_000).toFixed(1)}M`;
      } else if (compact && absAmount >= 1000) {
        formatted = `${(absAmount / 1000).toFixed(1)}K`;
      } else {
        formatted = absAmount.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }

      return `${prefix}${symbol}${formatted}`;
    },
    [symbol]
  );

  return (
    <CurrencyContext.Provider value={{ symbol, code, name, region, formatMoney, loaded }}>
      {children}
    </CurrencyContext.Provider>
  );
}

/**
 * Hook to access the user's currency anywhere in the app.
 *
 * Usage:
 *   const { symbol, code, formatMoney } = useCurrency();
 *   <span>{formatMoney(balance)}</span>       // "₵1,500.00"
 *   <span>{formatMoney(profit, { showSign: true })}</span>  // "+₵200.00"
 *   <span>{symbol}{amount.toFixed(2)}</span>  // "₵200.00" (for simple cases)
 */
export function useCurrency(): CurrencyContextType {
  return useContext(CurrencyContext);
}
