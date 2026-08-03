"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Search, Menu, LogOut, User, CheckCircle2, XCircle, Info, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/auth-provider";
import { useCurrency } from "@/components/currency-provider";
import { useFetch } from "@/lib/hooks";
import Link from "next/link";

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

interface UserStats {
  balance: number;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

interface NotificationsData {
  notifications: Notification[];
  unreadCount: number;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "warning":
      return <XCircle className="h-4 w-4 text-red-400" />;
    case "info":
      return <Info className="h-4 w-4 text-primary" />;
    case "cashout":
      return <DollarSign className="h-4 w-4 text-amber-400" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString();
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const { symbol } = useCurrency();
  const { data: stats } = useFetch<UserStats>("/api/stats/user", { balance: 0 });
  const { data: notifData, refetch: refetchNotifs } = useFetch<NotificationsData>("/api/notifications", {
    notifications: [],
    unreadCount: 0,
  });
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => refetchNotifs(), 60000);
    return () => clearInterval(interval);
  }, [refetchNotifs]);

  const notifications = notifData.notifications || [];
  const unreadCount = notifData.unreadCount || 0;

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMobileMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search matches, bets..."
            className="w-64 pl-9 bg-secondary border-border"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isAuthenticated ? (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5">
              <span className="text-xs text-muted-foreground">Balance</span>
              <span className="text-sm font-bold text-primary">
                {symbol}{stats.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => setShowNotifs(!showNotifs)}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>

              {showNotifs && (
                <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 rounded-xl border border-border bg-card shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between p-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                    {unreadCount > 0 && (
                      <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                        {unreadCount} new
                      </Badge>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No notifications yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Bet results and alerts will appear here
                        </p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <Link
                          key={notif.id}
                          href={notif.link || "#"}
                          onClick={() => setShowNotifs(false)}
                          className="flex items-start gap-3 p-3 border-b border-border/50 hover:bg-secondary/50 transition-colors"
                        >
                          <div className="mt-0.5">{getNotificationIcon(notif.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{notif.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {notif.message}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatTimeAgo(notif.timestamp)}
                            </p>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <div className="p-2 border-t border-border">
                      <Link
                        href="/history"
                        onClick={() => setShowNotifs(false)}
                        className="block text-center text-xs text-primary hover:text-primary/80 transition-colors py-1"
                      >
                        View all activity
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground hidden sm:block">
                {user?.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <Link href="/login">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/80">
              Sign In
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
