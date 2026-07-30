"use client";

import { useFetch } from "@/lib/hooks";
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
} from "lucide-react";
import { useState } from "react";

interface AdminSettings {
  id: string;
  defaultCommissionRate: number;
  minCommissionRate: number;
  maxCommissionRate: number;
  platformName: string;
  maintenanceMode: boolean;
  maxUsers: number;
  autoApproveAccounts: boolean;
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
  const { data: stats, loading } = useFetch<Stats>("/api/stats", {
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
  const [commissionRate, setCommissionRate] = useState(
    stats.adminSettings ? Math.round(stats.adminSettings.defaultCommissionRate * 100) : 10
  );

  const handleSaveCommission = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
              {stats.adminSettings?.maintenanceMode ? (
                <AlertTriangle className="h-4 w-4 text-red-400" />
              ) : (
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Maintenance</p>
                <p className={`text-sm font-medium ${stats.adminSettings?.maintenanceMode ? "text-red-400" : "text-emerald-400"}`}>
                  {stats.adminSettings?.maintenanceMode ? "Active" : "None"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
            onClick={handleSaveCommission}
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
                {stats.users.map((user) => (
                  <TableRow key={user.id} className="border-border">
                    <TableCell className="text-sm font-medium text-foreground">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          user.role === "admin"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-muted-foreground"
                        }
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-medium ${
                          user.totalProfit - user.totalLoss >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        ${(user.totalProfit - user.totalLoss).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-amber-400">
                      ${user.commissionPaid.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      ${user.balance.toFixed(2)}
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
