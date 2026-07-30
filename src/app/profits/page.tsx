"use client";

import { useFetch } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useState } from "react";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  createdAt: string;
}

const monthlyProfitData = [
  { month: "Jan", profit: 450, loss: 200, commission: 45 },
  { month: "Feb", profit: 380, loss: 250, commission: 38 },
  { month: "Mar", profit: 620, loss: 180, commission: 62 },
  { month: "Apr", profit: 290, loss: 310, commission: 29 },
  { month: "May", profit: 510, loss: 220, commission: 51 },
  { month: "Jun", profit: 730, loss: 190, commission: 73 },
  { month: "Jul", profit: 580, loss: 280, commission: 58 },
];

const platformBreakdown = [
  { platform: "Bet365", profit: 1240.5, bets: 45, winRate: 68 },
  { platform: "Betway", profit: 607.0, bets: 28, winRate: 57 },
  { platform: "Sportybet", profit: 0, bets: 0, winRate: 0 },
];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg bg-card border border-border p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-xs" style={{ color: entry.color }}>
            {entry.dataKey === "profit" ? "Profit" : entry.dataKey === "loss" ? "Loss" : "Commission"}: $
            {entry.value.toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function ProfitsPage() {
  const { data: transactions, loading } = useFetch<Transaction[]>("/api/transactions", []);
  const [txFilter, setTxFilter] = useState<string>("all");

  const totalProfit = 2847.5;
  const totalLoss = 1235.0;
  const netProfit = totalProfit - totalLoss;
  const totalCommission = 284.75;
  const roi = totalProfit > 0 ? ((netProfit / totalLoss) * 100).toFixed(1) : "0";

  const filteredTransactions =
    txFilter === "all"
      ? transactions
      : transactions.filter((t) => t.type === txFilter);

  const transactionTypes = ["all", "deposit", "bet_placed", "bet_won", "commission"];

  const getTypeColor = (type: string) => {
    switch (type) {
      case "deposit":
      case "bet_won":
        return "text-emerald-400";
      case "bet_placed":
        return "text-red-400";
      case "commission":
        return "text-amber-400";
      default:
        return "text-foreground";
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "deposit":
        return "bg-emerald-400/10 text-emerald-400";
      case "bet_won":
        return "bg-emerald-400/10 text-emerald-400";
      case "bet_placed":
        return "bg-red-400/10 text-red-400";
      case "commission":
        return "bg-amber-400/10 text-amber-400";
      default:
        return "bg-secondary text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profits & Commission</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your earnings, commissions, and transaction history
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Net Profit</span>
              {netProfit >= 0 ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-400" />
              )}
            </div>
            <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {netProfit >= 0 ? "+" : ""}${netProfit.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Profit</span>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              ${totalProfit.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Commission Paid</span>
              <Percent className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400">
              ${totalCommission.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">ROI</span>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">{roi}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Profit Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyProfitData}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#profitGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="loss" stroke="#ef4444" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="h-4 w-4 text-amber-400" />
              Monthly Commission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyProfitData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="commission" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-Platform Profit</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {platformBreakdown.map((p) => (
              <div key={p.platform} className="rounded-lg bg-secondary/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">{p.platform}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {p.bets} bets
                  </Badge>
                </div>
                <p className={`text-xl font-bold ${p.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {p.profit >= 0 ? "+" : ""}${p.profit.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Win Rate: {p.winRate}%
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Transaction History</CardTitle>
            <Select value={txFilter} onValueChange={setTxFilter}>
              <SelectTrigger className="w-36 bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {transactionTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "all" ? "All" : type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Description</TableHead>
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id} className="border-border">
                    <TableCell>
                      <Badge className={`text-[10px] ${getTypeBadge(tx.type)}`}>
                        {tx.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {tx.description || "N/A"}
                    </TableCell>
                    <TableCell className={`text-sm font-medium ${getTypeColor(tx.type)}`}>
                      {tx.amount >= 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString()}
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
