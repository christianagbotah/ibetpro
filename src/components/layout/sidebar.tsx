"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Brain,
  Zap,
  Monitor,
  Wallet,
  TrendingUp,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Dice5,
  History,
  LogIn,
  Link2,
  DollarSign,
  Download,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/auth/auth-provider";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analysis", label: "AI Analysis", icon: Brain },
  { href: "/betting", label: "Betting", icon: Zap },
  { href: "/tips", label: "AI Tips", icon: Target },
  { href: "/monitor", label: "Monitor", icon: Monitor },
  { href: "/history", label: "History", icon: History },
  { href: "/accounts", label: "Brokers", icon: Link2 },
  { href: "/profits", label: "Profits", icon: TrendingUp },
  { href: "/commission", label: "Commission", icon: DollarSign },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminItems = [
  { href: "/admin", label: "Admin Panel", icon: Shield },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user, isAuthenticated, isAdmin: isAdminUser } = useAuth();
  const { canInstall, install, isInstalled } = usePWAInstall();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Dice5 className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-foreground">
            iBet<span className="text-primary">Pro</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {isAuthenticated && isAdminUser && (
          <>
            <Separator className="my-3" />
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onNavigate?.()}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Install App button — shown when not installed and can install */}
      {canInstall && !isInstalled && (
        <div className={cn("px-2 py-2", !collapsed && "px-3")}>
          <Button
            onClick={install}
            className={cn(
              "w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2",
              collapsed ? "px-0 justify-center" : ""
            )}
          >
            <Download className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Install App</span>}
          </Button>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-full h-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* User info */}
      {!collapsed && (
        <div className="border-t border-border p-4">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                  {user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          ) : (
            <Link href="/login" onClick={() => onNavigate?.()}>
              <Button variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10">
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            </Link>
          )}
        </div>
      )}
    </aside>
  );
}
