"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlatformLogoPath, getBrokerLogoUrl } from "@/lib/broker-logos";
import { Separator } from "@/components/ui/separator";
import {
  Wallet, ArrowUpRight, ArrowDownLeft, DollarSign, TrendingUp,
  Shield, Lock, Unlock, AlertCircle, CheckCircle2,
} from "lucide-react";

interface AllocationData {
  id: string;
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  profitFromAlloc: number;
  commissionFromAlloc: number;
  status: string;
  activatedAt: string;
  bettingAccount: {
    id: string;
    platform: string;
    accountName: string;
    balance: number;
    allocatedAmount: number;
    allocationLock: boolean;
  };
}

interface AllocationSummary {
  totalAllocated: number;
  totalUsed: number;
  totalRemaining: number;
  totalProfit: number;
  totalCommission: number;
  activeCount: number;
  netAfterCommission: number;
}

export function AllocationManager() {
  const { toast } = useToast();
  const [allocationAmount, setAllocationAmount] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [setting, setSetting] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const { data, loading, refresh } = useFetch<{
    allocations: AllocationData[];
    summary: AllocationSummary;
  }>("/api/broker/allocation", { allocations: [], summary: { totalAllocated: 0, totalUsed: 0, totalRemaining: 0, totalProfit: 0, totalCommission: 0, activeCount: 0, netAfterCommission: 0 } });

  const { data: brokerData } = useFetch<{
    accounts: Array<{
      id: string;
      platform: string;
      platformName: string;
      accountName: string;
      balance: number;
      allocatedAmount: number;
      isConnected: boolean;
    }>;
  }>("/api/broker/connect", { accounts: [] });

  const connectedAccounts = brokerData?.accounts?.filter((a) => a.isConnected) || [];
  const allocations = data?.allocations || [];
  const summary = data?.summary || { totalAllocated: 0, totalUsed: 0, totalRemaining: 0, totalProfit: 0, totalCommission: 0, activeCount: 0, netAfterCommission: 0 };

  const handleSetAllocation = useCallback(async () => {
    if (!selectedAccountId || !allocationAmount || parseFloat(allocationAmount) <= 0) {
      toast({ title: "Error", description: "Select an account and enter a valid amount", variant: "destructive" });
      return;
    }

    setSetting(true);
    try {
      const res = await fetch("/api/broker/allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bettingAccountId: selectedAccountId,
          amount: parseFloat(allocationAmount),
        }),
      });

      const result = await res.json();

      if (result.success) {
        toast({
          title: "Allocation Set!",
          description: `$${parseFloat(allocationAmount).toFixed(2)} allocated from your broker account`,
        });
        setAllocationAmount("");
        setSelectedAccountId("");
        refresh();
      } else {
        toast({
          title: "Allocation Failed",
          description: result.error || "Failed to set allocation",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to set allocation", variant: "destructive" });
    } finally {
      setSetting(false);
    }
  }, [selectedAccountId, allocationAmount, toast, refresh]);

  const handleReleaseAllocation = useCallback(async (allocationId: string) => {
    setReleasing(true);
    try {
      const res = await fetch("/api/broker/allocation", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocationId }),
      });

      const result = await res.json();

      if (result.success) {
        toast({
          title: "Allocation Released",
          description: `Released $${result.releasedAmount?.toFixed(2)} back to your broker account`,
        });
        refresh();
      } else {
        toast({
          title: "Release Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setReleasing(false);
    }
  }, [toast, refresh]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Allocated</span>
            </div>
            <p className="text-xl font-bold text-foreground">${summary.totalAllocated.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">In Active Bets</span>
            </div>
            <p className="text-xl font-bold text-amber-400">${summary.totalUsed.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Profit</span>
            </div>
            <p className="text-xl font-bold text-emerald-400">${summary.totalProfit.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Commission</span>
            </div>
            <p className="text-xl font-bold text-amber-400">${summary.totalCommission.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Set Allocation */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            Set Allocation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
            <p className="text-xs text-muted-foreground">
              Allocate funds from your broker account for the AI bot to use for auto-betting.
              The bot will only use this allocated amount - never more than you authorize.
              Profits are returned to your broker account minus the commission.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Select Broker Account</Label>
              {connectedAccounts.length === 0 ? (
                <p className="text-xs text-amber-400 mt-1">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  No connected broker accounts. Connect a broker first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-1">
                  {connectedAccounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => setSelectedAccountId(account.id)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        selectedAccountId === account.id
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-secondary/50 text-muted-foreground border border-border"
                      }`}
                    >
                      <img
                        src={getPlatformLogoPath({ id: account.platform, name: account.platformName, color: "#10b981" })}
                        alt={account.platformName}
                        className="h-5 w-5 object-contain rounded"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.dataset.retried) {
                            target.dataset.retried = "true";
                            target.src = getBrokerLogoUrl(account.platform, account.platformName, "#10b981");
                          } else {
                            target.style.display = "none";
                          }
                        }}
                      />
                      {account.accountName} (${account.balance.toFixed(2)})
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Allocation Amount ($)</Label>
              <Input
                type="number"
                value={allocationAmount}
                onChange={(e) => setAllocationAmount(e.target.value)}
                placeholder="e.g. 500"
                min="10"
                className="bg-secondary border-border mt-1"
              />
            </div>

            <Button
              className="w-full bg-primary text-primary-foreground"
              onClick={handleSetAllocation}
              disabled={setting || !selectedAccountId || !allocationAmount}
            >
              {setting ? (
                <><div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" /> Setting...</>
              ) : (
                <><Wallet className="h-4 w-4 mr-2" /> Allocate Funds</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Allocations */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowDownLeft className="h-4 w-4 text-primary" />
            Allocation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allocations.length === 0 ? (
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No allocations yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Set an allocation from your broker account to start auto-betting
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {allocations.map((alloc) => (
                <div
                  key={alloc.id}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          alloc.status === "active"
                            ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/30"
                            : alloc.status === "locked"
                            ? "bg-amber-400/10 text-amber-400 border-amber-400/30"
                            : "bg-secondary text-muted-foreground"
                        }
                      >
                        {alloc.status === "active" && <Unlock className="h-3 w-3 mr-1" />}
                        {alloc.status === "locked" && <Lock className="h-3 w-3 mr-1" />}
                        {alloc.status === "released" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {alloc.status.charAt(0).toUpperCase() + alloc.status.slice(1)}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">
                        {alloc.bettingAccount.accountName}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alloc.activatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Amount</p>
                      <p className="text-sm font-bold text-foreground">${alloc.amount.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Used</p>
                      <p className="text-sm font-bold text-amber-400">${alloc.usedAmount.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Remaining</p>
                      <p className="text-sm font-bold text-primary">${alloc.remainingAmount.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Profit</p>
                      <p className={`text-sm font-bold ${alloc.profitFromAlloc >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ${alloc.profitFromAlloc.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {alloc.commissionFromAlloc > 0 && (
                    <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-2">
                      <p className="text-xs text-amber-400">
                        <DollarSign className="h-3 w-3 inline mr-1" />
                        Commission: ${alloc.commissionFromAlloc.toFixed(2)} | Net: ${(alloc.profitFromAlloc - alloc.commissionFromAlloc).toFixed(2)}
                      </p>
                    </div>
                  )}

                  {alloc.status === "active" && alloc.usedAmount === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-400 border-red-400/30 hover:bg-red-400/5"
                      onClick={() => handleReleaseAllocation(alloc.id)}
                      disabled={releasing}
                    >
                      Release Allocation
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
