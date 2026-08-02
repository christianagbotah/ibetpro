"use client";

import { useFetch } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UserStats {
  balance: number;
  bankroll: number;
  totalProfit: number;
  totalLoss: number;
  commissionPaid: number;
  dailyPnl: number;
  weeklyPnl: number;
  totalBets: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  winRate: number;
  roi: number;
  totalStaked: number;
  monthlyData: Array<{ month: string; profit: number; loss: number; commission: number }>;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg bg-card border border-border p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-xs" style={{ color: entry.color }}>
            {entry.dataKey === "profit" ? "Profit" : "Loss"}: $
            {Math.abs(entry.value).toFixed(2)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function ProfitChart() {
  const { data: stats } = useFetch<UserStats>("/api/stats/user", {
    balance: 0,
    bankroll: 0,
    totalProfit: 0,
    totalLoss: 0,
    commissionPaid: 0,
    dailyPnl: 0,
    weeklyPnl: 0,
    totalBets: 0,
    wonBets: 0,
    lostBets: 0,
    pendingBets: 0,
    winRate: 0,
    roi: 0,
    totalStaked: 0,
    monthlyData: [],
  });

  const chartData = (stats.monthlyData || []).filter(
    (d) => d.profit > 0 || d.loss > 0
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Profit Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#10b981"
                  fill="url(#profitGradient)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="loss"
                  stroke="#ef4444"
                  fill="url(#lossGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No profit data yet. Place bets to see your trend.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
