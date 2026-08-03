"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Zap, Trophy } from "lucide-react";
import { useCurrency } from "@/components/currency-provider";

interface StatsCardsProps {
  balance: number;
  profit: number;
  activeBets: number;
  winRate: number;
  dailyPnl?: number;
  weeklyPnl?: number;
  pendingBets?: number;
}

export function StatsCards({ balance, profit, activeBets, winRate, dailyPnl, weeklyPnl, pendingBets }: StatsCardsProps) {
  const { symbol, formatMoney } = useCurrency();
  const cards = [
    {
      title: "Total Balance",
      value: formatMoney(balance),
      icon: DollarSign,
      subtext: dailyPnl !== undefined
        ? `${formatMoney(dailyPnl, { showSign: true })} today`
        : undefined,
      subtextType: (dailyPnl ?? 0) >= 0 ? "positive" as const : "negative" as const,
      color: "text-primary",
    },
    {
      title: "Total Profit",
      value: formatMoney(profit),
      icon: TrendingUp,
      subtext: weeklyPnl !== undefined
        ? `${formatMoney(weeklyPnl, { showSign: true })} this week`
        : undefined,
      subtextType: (weeklyPnl ?? 0) >= 0 ? "positive" as const : "negative" as const,
      color: "text-emerald-400",
    },
    {
      title: "Active Bets",
      value: activeBets.toString(),
      icon: Zap,
      subtext: pendingBets !== undefined ? `${pendingBets} pending` : undefined,
      subtextType: "neutral" as const,
      color: "text-amber-400",
    },
    {
      title: "Win Rate",
      value: `${winRate}%`,
      icon: Trophy,
      subtext: undefined,
      subtextType: "neutral" as const,
      color: "text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-5 w-5 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{card.value}</div>
            {card.subtext && (
              <p className={`text-xs mt-1 ${
                card.subtextType === "positive" ? "text-emerald-400" :
                card.subtextType === "negative" ? "text-red-400" :
                "text-muted-foreground"
              }`}>
                {card.subtext}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
