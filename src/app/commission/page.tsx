"use client";

import { useFetch } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, TrendingUp, ArrowRight, CheckCircle2,
  Clock, AlertCircle, RefreshCw,
} from "lucide-react";
import { useCurrency } from "@/components/currency-provider";

interface CommissionEntry {
  id: string;
  bettingAccountId: string;
  betId: string | null;
  accumulatorId: string | null;
  grossProfit: number;
  commissionRate: number;
  commissionAmount: number;
  netProfit: number;
  status: string;
  transferRef: string | null;
  transferredAt: string | null;
  failureReason: string | null;
  createdAt: string;
  bettingAccount: {
    platform: string;
    accountName: string;
  };
}

interface CommissionSummary {
  totalEntries: number;
  totalGrossProfit: number;
  totalCommission: number;
  totalNetProfit: number;
  pendingCommission: number;
  transferredCommission: number;
}

export default function CommissionPage() {
  const { symbol } = useCurrency();
  const { data: dailyData, loading: dailyLoading } = useFetch<{
    ledger: CommissionEntry[];
    summary: CommissionSummary;
  }>("/api/commission?period=daily", {
    ledger: [],
    summary: { totalEntries: 0, totalGrossProfit: 0, totalCommission: 0, totalNetProfit: 0, pendingCommission: 0, transferredCommission: 0 },
  });

  const { data: weeklyData } = useFetch<{
    ledger: CommissionEntry[];
    summary: CommissionSummary;
  }>("/api/commission?period=weekly", {
    ledger: [],
    summary: { totalEntries: 0, totalGrossProfit: 0, totalCommission: 0, totalNetProfit: 0, pendingCommission: 0, transferredCommission: 0 },
  });

  const { data: allData } = useFetch<{
    ledger: CommissionEntry[];
    summary: CommissionSummary;
  }>("/api/commission?period=all", {
    ledger: [],
    summary: { totalEntries: 0, totalGrossProfit: 0, totalCommission: 0, totalNetProfit: 0, pendingCommission: 0, transferredCommission: 0 },
  });

  const renderSummary = (summary: CommissionSummary) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Gross Profit</span>
          </div>
          <p className="text-lg font-bold text-emerald-400">{symbol}{summary.totalGrossProfit.toFixed(2)}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-muted-foreground">Commission</span>
          </div>
          <p className="text-lg font-bold text-amber-400">{symbol}{summary.totalCommission.toFixed(2)}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Net Profit</span>
          </div>
          <p className="text-lg font-bold text-primary">{symbol}{summary.totalNetProfit.toFixed(2)}</p>
        </CardContent>
      </Card>
    </div>
  );

  const renderLedger = (ledger: CommissionEntry[]) => {
    if (ledger.length === 0) {
      return (
        <div className="text-center py-8">
          <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No commission entries yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Commission is automatically deducted from winning bets
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {ledger.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    entry.status === "transferred"
                      ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/30"
                      : entry.status === "pending"
                      ? "bg-amber-400/10 text-amber-400 border-amber-400/30"
                      : "bg-red-400/10 text-red-400 border-red-400/30"
                  }
                >
                  {entry.status === "transferred" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {entry.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                  {entry.status === "failed" && <AlertCircle className="h-3 w-3 mr-1" />}
                  {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                </Badge>
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  {entry.bettingAccount.platform} | {entry.bettingAccount.accountName}
                </span>
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded bg-secondary/50 p-2">
                <p className="text-[10px] text-muted-foreground">Gross Profit</p>
                <p className="text-xs font-bold text-emerald-400">{symbol}{entry.grossProfit.toFixed(2)}</p>
              </div>
              <div className="rounded bg-secondary/50 p-2">
                <p className="text-[10px] text-muted-foreground">Rate</p>
                <p className="text-xs font-bold text-foreground">{Math.round(entry.commissionRate * 100)}%</p>
              </div>
              <div className="rounded bg-secondary/50 p-2">
                <p className="text-[10px] text-muted-foreground">Commission</p>
                <p className="text-xs font-bold text-amber-400">{symbol}{entry.commissionAmount.toFixed(2)}</p>
              </div>
              <div className="rounded bg-secondary/50 p-2">
                <p className="text-[10px] text-muted-foreground">Net</p>
                <p className="text-xs font-bold text-primary">{symbol}{entry.netProfit.toFixed(2)}</p>
              </div>
            </div>

            {entry.failureReason && (
              <p className="text-xs text-red-400 mt-1">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                {entry.failureReason}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Commission Tracking</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all commission deductions and transfers to admin. Commission is automatically
            deducted from winning bets and transferred to the admin account.
          </p>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-3">
            <p className="text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3 inline mr-1" />
              How it works: When a bet wins, the commission percentage is automatically deducted from
              your profit and sent to the admin&apos;s account. You receive the net profit after commission.
              This ensures the platform is sustainable while you keep the majority of your earnings.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="daily">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="daily" className="flex-1 sm:flex-initial">Today</TabsTrigger>
          <TabsTrigger value="weekly" className="flex-1 sm:flex-initial">This Week</TabsTrigger>
          <TabsTrigger value="all" className="flex-1 sm:flex-initial">All Time</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          {renderSummary(dailyData?.summary || { totalEntries: 0, totalGrossProfit: 0, totalCommission: 0, totalNetProfit: 0, pendingCommission: 0, transferredCommission: 0 })}
          {renderLedger(dailyData?.ledger || [])}
        </TabsContent>

        <TabsContent value="weekly" className="space-y-4">
          {renderSummary(weeklyData?.summary || { totalEntries: 0, totalGrossProfit: 0, totalCommission: 0, totalNetProfit: 0, pendingCommission: 0, transferredCommission: 0 })}
          {renderLedger(weeklyData?.ledger || [])}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {renderSummary(allData?.summary || { totalEntries: 0, totalGrossProfit: 0, totalCommission: 0, totalNetProfit: 0, pendingCommission: 0, transferredCommission: 0 })}
          {renderLedger(allData?.ledger || [])}
        </TabsContent>
      </Tabs>
    </div>
  );
}
