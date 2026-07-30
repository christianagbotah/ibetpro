"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Zap, Trophy } from "lucide-react";

interface StatsCardsProps {
  balance: number;
  profit: number;
  activeBets: number;
  winRate: number;
}

export function StatsCards({ balance, profit, activeBets, winRate }: StatsCardsProps) {
  const cards = [
    {
      title: "Total Balance",
      value: `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-primary",
    },
    {
      title: "Total Profit",
      value: `$${profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: profit >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      title: "Active Bets",
      value: activeBets.toString(),
      icon: Zap,
      color: "text-amber-400",
    },
    {
      title: "Win Rate",
      value: `${winRate}%`,
      icon: Trophy,
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
