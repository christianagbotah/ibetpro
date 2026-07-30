"use client";

import { Bell, Search, Menu, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/auth-provider";
import { useFetch } from "@/lib/hooks";
import Link from "next/link";

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

interface UserStats {
  balance: number;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const { data: stats } = useFetch<UserStats>("/api/stats/user", { balance: 0 });

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
                ${stats.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
            </Button>

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
