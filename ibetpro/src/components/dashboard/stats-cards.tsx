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
      change: "+12.5%",
      changeType: "positive" as const,
      color: "text-primary",
    },
    {
      title: "Total Profit",
      value: `$${profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      change: "+$134.50",
      changeType: "positive" as const,
      color: "text-emerald-400",
    },
    {
      title: "Active Bets",
      value: activeBets.toString(),
      icon: Zap,
      change: "5 pending",
      changeType: "neutral" as const,
      color: "text-amber-400",
    },
    {
      title: "Win Rate",
      value: `${winRate}%`,
      icon: Trophy,
      change: "+3.2%",
      changeType: "positive" as const,
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
            <p className={`text-xs mt-1 ${
              card.changeType === "positive" ? "text-emerald-400" : "text-muted-foreground"
            }`}>
              {card.changeType === "positive" && "+"}
              {card.change} from last week
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
