"use client";

import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  DollarSign,
  Zap,
  Activity,
  TrendingUp,
  Settings,
  Save,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Key,
  Globe,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect } from "react";

interface AdminSettings {
  id: string;
  defaultCommissionRate: number;
  minCommissionRate: number;
  maxCommissionRate: number;
  platformName: string;
  maintenanceMode: boolean;
  maxUsers: number;
  autoApproveAccounts: boolean;
  oddsApiKey: string | null;
  apiFootballKey: string | null;
}

interface Stats {
  totalUsers: number;
  totalBets: number;
  totalCommission: number;
  totalBetVolume: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  totalProfit: number;
  totalLoss: number;
  totalCommissionPaid: number;
  winRate: number;
  liveMatches: number;
  upcomingMatches: number;
  adminSettings: AdminSettings | null;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    balance: number;
    totalProfit: number;
    totalLoss: number;
    commissionPaid: number;
    createdAt: string;
  }>;
}

export default function AdminPage() {
  const { user, isAdmin: isAdminUser } = useAuth();
  const { data: stats, loading, refetch } = useFetch<Stats>("/api/stats", {
    totalUsers: 0,
    totalBets: 0,
    totalCommission: 0,
    totalBetVolume: 0,
    wonBets: 0,
    lostBets: 0,
    pendingBets: 0,
    totalProfit: 0,
    totalLoss: 0,
    totalCommissionPaid: 0,
    winRate: 0,
    liveMatches: 0,
    upcomingMatches: 0,
    adminSettings: null,
    users: [],
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commissionRate, setCommissionRate] = useState(10);
  const [oddsApiKey, setOddsApiKey] = useState("");
  const [apiFootballKey, setApiFootballKey] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; matchesSynced: number; errors?: string[] } | null>(null);

  // Load current admin settings
  useEffect(() => {
    async function loadAdminSettings() {
      try {
        const res = await fetch("/api/admin");
        if (res.ok) {
          const data = await res.json();
          setCommissionRate(Math.round(data.defaultCommissionRate * 100));
          if (data.oddsApiKey) setOddsApiKey(data.oddsApiKey);
          if (data.apiFootballKey) setApiFootballKey(data.apiFootballKey);
        }
      } catch (error) {
        console.error("Failed to load admin settings:", error);
      }
    }
    loadAdminSettings();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultCommissionRate: commissionRate / 100,
          oddsApiKey,
          apiFootballKey,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        refetch();
      }
    } catch (error) {
      console.error("Failed to save admin settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncData = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "auto" }),
      });

      if (res.ok) {
        const data = await res.json();
        setSyncResult(data);
        refetch();
      }
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  const hasApiKeys = !!(oddsApiKey || apiFootballKey);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading admin panel...
        </div>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-foreground">Admin Access Required</p>
          <p className="text-sm text-muted-foreground mt-1">
            You need admin privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform overview and management
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Users</p>
              <p className="text-lg font-bold text-foreground">{stats.totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Bets</p>
              <p className="text-lg font-bold text-foreground">{stats.totalBets}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10">
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Commission Earned</p>
              <p className="text-lg font-bold text-emerald-400">
                ${stats.totalCommission.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-400/10">
              <TrendingUp className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bet Volume</p>
              <p className="text-lg font-bold text-foreground">
                ${stats.totalBetVolume.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Won Bets</p>
            <p className="text-lg font-bold text-emerald-400">{stats.wonBets}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Lost Bets</p>
            <p className="text-lg font-bold text-red-400">{stats.lostBets}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-400">{stats.pendingBets}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Platform Win Rate</p>
            <p className="text-lg font-bold text-primary">{stats.winRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* API Keys Configuration */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-amber-400" />
            API Keys Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasApiKeys && (
            <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-3 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-medium text-amber-400">API Keys Required</p>
              </div>
              <p className="text-xs text-muted-foreground">
                To fetch real-time odds and team statistics, configure at least one API key.
                The Odds API provides live bookmaker odds, and API-Football provides team statistics and fixtures.
                Without API keys, the app will have no match data.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                The Odds API Key
              </Label>
              <Input
                type="password"
                placeholder="Enter your the-odds-api.com key"
                value={oddsApiKey}
                onChange={(e) => setOddsApiKey(e.target.value)}
                className="bg-secondary border-border"
              />
              <p className="text-[10px] text-muted-foreground">
                Get a free key at the-odds-api.com. Provides live odds from multiple bookmakers.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                API-Football Key
              </Label>
              <Input
                type="password"
                placeholder="Enter your api-football.com key"
                value={apiFootballKey}
                onChange={(e) => setApiFootballKey(e.target.value)}
                className="bg-secondary border-border"
              />
              <p className="text-[10px] text-muted-foreground">
                Get a key at api-football.com. Provides team statistics, fixtures, and live scores.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/80"
              onClick={handleSaveSettings}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : saved ? "Saved!" : "Save API Keys"}
            </Button>
            <Button
              variant="outline"
              className="border-primary/30 text-primary hover:bg-primary/10"
              onClick={handleSyncData}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {syncing ? "Syncing..." : "Sync Live Data"}
            </Button>
          </div>

          {syncResult && (
            <div className={`rounded-lg p-3 ${syncResult.success ? "bg-emerald-400/5 border border-emerald-400/10" : "bg-red-400/5 border border-red-400/10"}`}>
              <div className="flex items-center gap-2">
                {syncResult.success ? (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                )}
                <span className={`text-sm ${syncResult.success ? "text-emerald-400" : "text-red-400"}`}>
                  {syncResult.success
                    ? `Synced ${syncResult.matchesSynced} matches`
                    : "Sync failed"}
                </span>
              </div>
              {syncResult.errors && syncResult.errors.map((err, i) => (
                <p key={i} className="text-xs text-muted-foreground mt-1">{err}</p>
              ))}
            </div>
          )}

          {hasApiKeys && (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <p className="text-xs text-emerald-400">API keys configured. Data sync is active.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Health */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Platform Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-medium text-emerald-400">Operational</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Live Matches</p>
                <p className="text-sm font-medium text-foreground">{stats.liveMatches}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <div>
                <p className="text-xs text-muted-foreground">Upcoming</p>
                <p className="text-sm font-medium text-foreground">{stats.upcomingMatches}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasApiKeys ? (
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">API Status</p>
                <p className={`text-sm font-medium ${hasApiKeys ? "text-emerald-400" : "text-amber-400"}`}>
                  {hasApiKeys ? "Connected" : "No Keys"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commission Rate */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-amber-400" />
            Commission Rate Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium">Default Commission Rate</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min={stats.adminSettings?.minCommissionRate ? Math.round(stats.adminSettings.minCommissionRate * 100) : 5}
                  max={stats.adminSettings?.maxCommissionRate ? Math.round(stats.adminSettings.maxCommissionRate * 100) : 25}
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(parseInt(e.target.value) || 10)}
                  className="bg-secondary border-border w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Range: {stats.adminSettings?.minCommissionRate ? Math.round(stats.adminSettings.minCommissionRate * 100) : 5}% - {stats.adminSettings?.maxCommissionRate ? Math.round(stats.adminSettings.maxCommissionRate * 100) : 25}%
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg bg-secondary/50 p-4">
              <span className="text-3xl font-bold text-amber-400">{commissionRate}%</span>
              <span className="text-xs text-muted-foreground">Commission Rate</span>
            </div>
          </div>

          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            onClick={handleSaveSettings}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Commission Rate"}
          </Button>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Email</TableHead>
                  <TableHead className="text-muted-foreground">Role</TableHead>
                  <TableHead className="text-muted-foreground">Profit/Loss</TableHead>
                  <TableHead className="text-muted-foreground">Commission</TableHead>
                  <TableHead className="text-muted-foreground">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.users.map((u) => (
                  <TableRow key={u.id} className="border-border">
                    <TableCell className="text-sm font-medium text-foreground">
                      {u.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          u.role === "admin"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-muted-foreground"
                        }
                      >
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-medium ${
                          u.totalProfit - u.totalLoss >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        ${(u.totalProfit - u.totalLoss).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-amber-400">
                      ${u.commissionPaid.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      ${u.balance.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
