"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Link2,
  Unlink,
  ArrowUpDown,
} from "lucide-react";

interface BettingAccount {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  balance: number;
  currency: string;
  isConnected: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

const PLATFORMS = [
  { id: "bet365", name: "Bet365", icon: "🟡" },
  { id: "betway", name: "Betway", icon: "🔵" },
  { id: "1xbet", name: "1xBet", icon: "🟢" },
  { id: "sportybet", name: "Sportybet", icon: "🟠" },
  { id: "stake", name: "Stake", icon: "🔵" },
  { id: "pinnacle", name: "Pinnacle", icon: "🟣" },
];

export default function AccountsPage() {
  const { data: accounts, loading, refetch } = useFetch<BettingAccount[]>("/api/accounts", []);
  const [showConnect, setShowConnect] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    platform: "",
    accountName: "",
    accessToken: "",
  });

  const handleConnect = useCallback(async () => {
    if (!formData.platform || !formData.accountName) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowConnect(false);
        setFormData({ platform: "", accountName: "", accessToken: "" });
        refetch();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to connect account");
      }
    } catch {
      alert("Failed to connect account");
    } finally {
      setConnecting(false);
    }
  }, [formData, refetch]);

  const handleSync = useCallback(async (accountId: string) => {
    setSyncing(accountId);
    try {
      const res = await fetch("/api/accounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (res.ok) {
        refetch();
      }
    } catch {
      // Handle error silently
    } finally {
      setSyncing(null);
    }
  }, [refetch]);

  const handleDisconnect = useCallback(async (accountId: string) => {
    if (!confirm("Are you sure you want to disconnect this account?")) return;
    try {
      const res = await fetch(`/api/accounts?id=${accountId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        refetch();
      }
    } catch {
      // Handle error silently
    }
  }, [refetch]);

  const getPlatformInfo = (platformId: string) => {
    return PLATFORMS.find(p => p.id === platformId) || { id: platformId, name: platformId, icon: "⚪" };
  };

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const connectedCount = accounts.filter(a => a.isConnected).length;

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
            Connect and manage your betting platform accounts
          </p>
        </div>
        <Button
          onClick={() => setShowConnect(!showConnect)}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Connect Account
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Total Balance</span>
              <Wallet className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">${totalBalance.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Connected</span>
              <Link2 className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{connectedCount} / {accounts.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Platforms</span>
              <ArrowUpDown className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-foreground">{accounts.length} / 6</p>
          </CardContent>
        </Card>
      </div>

      {/* Connect Form */}
      {showConnect && (
        <Card className="bg-card border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connect New Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Platform</label>
                <Select
                  value={formData.platform}
                  onValueChange={(v) => { if (v) setFormData({ ...formData, platform: v }); }}
                >
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => (
                      <SelectItem key={p.id} value={p.id} disabled={accounts.some(a => a.platform === p.id)}>
                        {p.icon} {p.name}
                        {accounts.some(a => a.platform === p.id) ? " (Connected)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Account Name</label>
                <Input
                  value={formData.accountName}
                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                  placeholder="My Bet365 Account"
                  className="bg-secondary border-border mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Access Token (optional)</label>
                <Input
                  value={formData.accessToken}
                  onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                  placeholder="Paste your API token"
                  type="password"
                  className="bg-secondary border-border mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleConnect}
                disabled={connecting || !formData.platform || !formData.accountName}
                className="bg-primary hover:bg-primary/90"
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                {connecting ? "Connecting..." : "Connect"}
              </Button>
              <Button variant="outline" onClick={() => setShowConnect(false)} className="border-border">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="p-8 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No betting accounts connected yet. Connect one to start betting.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Platform</TableHead>
                  <TableHead className="text-muted-foreground">Account</TableHead>
                  <TableHead className="text-muted-foreground">Balance</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Last Synced</TableHead>
                  <TableHead className="text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const platformInfo = getPlatformInfo(account.platform);
                  return (
                    <TableRow key={account.id} className="border-border">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{platformInfo.icon}</span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{platformInfo.name}</p>
                            <p className="text-[10px] text-muted-foreground">{account.accountId}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{account.accountName}</TableCell>
                      <TableCell>
                        <p className="text-sm font-bold text-foreground">
                          {account.currency} {account.balance.toFixed(2)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {account.isConnected ? (
                          <Badge className="bg-emerald-400/10 text-emerald-400 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge className="bg-red-400/10 text-red-400 text-[10px]">
                            <XCircle className="h-3 w-3 mr-1" />
                            Disconnected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {account.lastSyncedAt
                          ? new Date(account.lastSyncedAt).toLocaleString()
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-border text-xs h-7"
                            onClick={() => handleSync(account.id)}
                            disabled={syncing === account.id || !account.isConnected}
                          >
                            {syncing === account.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-400/30 text-red-400 hover:bg-red-400/10 text-xs h-7"
                            onClick={() => handleDisconnect(account.id)}
                          >
                            <Unlink className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
