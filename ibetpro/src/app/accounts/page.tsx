"use client";

import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/components/auth/auth-provider";
import { AccountCard } from "@/components/accounts/account-card";
import { ConnectDialog } from "@/components/accounts/connect-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Wallet, Link2 } from "lucide-react";

interface Account {
  id: string;
  platform: string;
  accountName: string;
  balance: number;
  currency: string;
  isConnected: boolean;
  lastSyncedAt: string | null;
}

export default function AccountsPage() {
  const { isAuthenticated } = useAuth();
  const { data: accounts, loading, refetch } = useFetch<Account[]>("/api/accounts", []);

  const handleSync = async () => {
    refetch();
  };

  const handleConnect = async (platform: string, accountName: string) => {
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          accountName,
        }),
      });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error("Failed to connect account:", error);
    }
  };

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const connectedCount = accounts.filter((a) => a.isConnected).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading accounts...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Betting Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your connected betting platforms
          </p>
        </div>
        <ConnectDialog onConnect={handleConnect} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Balance</p>
              <p className="text-lg font-bold text-foreground">
                ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10">
              <Wallet className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Accounts</p>
              <p className="text-lg font-bold text-foreground">{accounts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10">
              <Link2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Connected</p>
              <p className="text-lg font-bold text-foreground">
                {connectedCount}/{accounts.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} onSync={handleSync} />
        ))}
      </div>

      {accounts.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No betting accounts connected yet. Connect your first account to get started.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Supported: Bet365, Betway, 1xBet, Sportybet, Stake, Pinnacle
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
