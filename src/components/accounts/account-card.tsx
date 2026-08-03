"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, Unplug } from "lucide-react";
import { useCurrency } from "@/components/currency-provider";

interface AccountCardProps {
  account: {
    id: string;
    platform: string;
    accountName: string;
    balance: number;
    currency: string;
    isConnected: boolean;
    lastSyncedAt: string | null;
  };
  onSync?: () => void;
}

const platformColors: Record<string, string> = {
  bet365: "#1e8c4e",
  betway: "#1a1a2e",
  "1xbet": "#1a5276",
  sportybet: "#2e86c1",
  stake: "#1a1a2e",
  pinnacle: "#1a3a5c",
};

const platformLabels: Record<string, string> = {
  bet365: "Bet365",
  betway: "Betway",
  "1xbet": "1xBet",
  sportybet: "Sportybet",
  stake: "Stake",
  pinnacle: "Pinnacle",
};

export function AccountCard({ account, onSync }: AccountCardProps) {
  const { symbol } = useCurrency();
  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Platform Logo */}
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white text-xs font-bold"
              style={{ backgroundColor: platformColors[account.platform] || "#333" }}
            >
              {platformLabels[account.platform]?.slice(0, 2).toUpperCase() || "??"}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {platformLabels[account.platform] || account.platform}
              </p>
              <p className="text-xs text-muted-foreground">{account.accountName}</p>
            </div>
          </div>
          <Badge
            variant={account.isConnected ? "default" : "destructive"}
            className={
              account.isConnected
                ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                : ""
            }
          >
            {account.isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        {/* Balance */}
        <div className="mt-4 rounded-lg bg-secondary/50 p-3">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className="text-xl font-bold text-foreground">
            {symbol}
            {account.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Last Sync & Actions */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {account.lastSyncedAt
              ? `Last sync: ${new Date(account.lastSyncedAt).toLocaleTimeString()}`
              : "Never synced"}
          </span>
          <div className="flex items-center gap-1">
            {account.isConnected && (
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => onSync?.()}
                title="Sync balance"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon-xs"
              variant="ghost"
              title={account.isConnected ? "Disconnect" : "Connect"}
            >
              {account.isConnected ? (
                <Unplug className="h-3.5 w-3.5 text-red-400" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 text-primary" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
