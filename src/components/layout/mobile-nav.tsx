"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Brain,
  Zap,
  Radio,
  Wallet,
  BarChart3,
  Percent,
  Settings,
  History,
  MoreHorizontal,
  Shield,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/auth-provider";

const primaryNavItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/analysis", label: "AI", icon: Brain },
  { href: "/betting", label: "Bet", icon: Zap },
  { href: "/monitor", label: "Live", icon: Radio },
  { href: "/accounts", label: "Brokers", icon: Wallet },
];

const moreNavItems = [
  { href: "/profits", label: "Profits", icon: TrendingUp, badge: null },
  { href: "/commission", label: "Commission", icon: Percent, badge: null },
  { href: "/history", label: "History", icon: History, badge: null },
  { href: "/settings", label: "Settings", icon: Settings, badge: null },
];

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Don't show on login page
  if (pathname === "/login") return null;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  // Haptic feedback on tap (if supported)
  const handleTap = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(5);
    }
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
                onClick={handleTap}
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

          {/* More button */}
          <Sheet>
            <SheetTrigger asChild>
              <button
                onClick={handleTap}
                className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg min-w-[56px] transition-all active:scale-95 text-muted-foreground hover:text-foreground"
              >
                <div className="flex items-center justify-center p-1.5">
                  <MoreHorizontal className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium leading-tight">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-card border-border rounded-t-2xl p-0">
              <SheetHeader className="px-6 pt-6 pb-2">
                <SheetTitle className="text-foreground text-left">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    iBetPro
                  </div>
                  <p className="text-xs text-muted-foreground font-normal mt-1">
                    {user?.email || "User"}
                  </p>
                </SheetTitle>
              </SheetHeader>

              <div className="px-6 pb-8">
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {moreNavItems.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-xl p-4 transition-all active:scale-95",
                          active
                            ? "bg-primary/10 border border-primary/20"
                            : "bg-secondary/50 border border-border hover:bg-secondary"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-6 w-6",
                            active ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <span
                          className={cn(
                            "text-xs font-medium",
                            active ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          {item.label}
                        </span>
                        {item.badge && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </div>

                {/* Quick stats */}
                <div className="mt-6 rounded-xl bg-secondary/30 border border-border p-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Bets</p>
                      <p className="text-sm font-bold text-foreground">0</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Win Rate</p>
                      <p className="text-sm font-bold text-emerald-400">0%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">P&L</p>
                      <p className="text-sm font-bold text-foreground">$0</p>
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
