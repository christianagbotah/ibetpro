"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Brain,
  Zap,
  Radio,
  User,
  BarChart3,
  Wallet,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryNavItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/analysis", label: "AI", icon: Brain },
  { href: "/betting", label: "Bet", icon: Zap },
  { href: "/monitor", label: "Live", icon: Radio },
  { href: "/accounts", label: "Brokers", icon: Wallet },
];

const secondaryNavItems = [
  { href: "/profits", label: "Profits", icon: BarChart3 },
  { href: "/commission", label: "Commission", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  // Don't show on login page
  if (pathname === "/login") return null;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      {/* Main bottom nav */}
      <div className="bg-card/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-around px-1 py-1 safe-area-bottom">
          {primaryNavItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg min-w-[56px] transition-all active:scale-95",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-xl transition-all",
                    active ? "bg-primary/10 p-1.5" : "p-1.5"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      active && "drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                    )}
                  />
                </div>
                <span className="text-[10px] font-medium leading-tight">
                  {item.label}
                </span>
                {active && (
                  <div className="absolute -bottom-0 h-0.5 w-8 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function MobileMoreSheet() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <div className="lg:hidden">
      {/* Extra nav items accessible from settings page */}
    </div>
  );
}
