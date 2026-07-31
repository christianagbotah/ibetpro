"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { BrokerConnect } from "@/components/broker/broker-connect";
import { AllocationManager } from "@/components/broker/allocation-manager";
import { BrokerModeToggle } from "@/components/broker/broker-mode-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link2, Wallet, Settings } from "lucide-react";

export default function AccountsPage() {
  const [brokerMode, setBrokerMode] = useState<"demo" | "real">("demo");

  const handleModeChange = useCallback((mode: "demo" | "real") => {
    setBrokerMode(mode);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Broker Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your betting platform, set allocations, and let the AI bot place bets using your
          allocated funds. No deposits needed - the bot uses your broker account directly.
        </p>
      </div>

      <div className="rounded-lg bg-primary/5 border border-primary/10 p-4">
        <h3 className="text-sm font-medium text-foreground mb-1">How It Works</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5">
          <li>1. <strong>Choose your mode</strong> — Demo for testing, Real for live broker connections</li>
          <li>2. <strong>Connect</strong> your broker/betting platform (Sportybet, 1xBet, Bet9ja, etc.)</li>
          <li>3. <strong>Allocate</strong> funds from your broker account for the AI bot to use</li>
          <li>4. The AI bot <strong>places bets</strong> directly on your broker account using your allocation</li>
          <li>5. The bot <strong>monitors</strong> live matches and cashes out if needed, or waits for full settlement</li>
          <li>6. On profit, a <strong>commission</strong> is automatically deducted and sent to admin</li>
          <li>7. Your <strong>net profit</strong> stays in your broker account</li>
        </ol>
      </div>

      <Tabs defaultValue="brokers">
        <TabsList>
          <TabsTrigger value="brokers" className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Brokers
          </TabsTrigger>
          <TabsTrigger value="allocation" className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> Allocation
          </TabsTrigger>
          <TabsTrigger value="mode" className="flex items-center gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Mode
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brokers">
          <BrokerConnect />
        </TabsContent>

        <TabsContent value="allocation">
          <AllocationManager />
        </TabsContent>

        <TabsContent value="mode">
          <div className="max-w-xl">
            <BrokerModeToggle currentMode={brokerMode} onModeChange={handleModeChange} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
