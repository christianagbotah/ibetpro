"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Plus } from "lucide-react";

const platforms = [
  { id: "bet365", name: "Bet365", color: "#1e8c4e" },
  { id: "betway", name: "Betway", color: "#1a1a2e" },
  { id: "1xbet", name: "1xBet", color: "#1a5276" },
  { id: "sportybet", name: "Sportybet", color: "#2e86c1" },
  { id: "stake", name: "Stake", color: "#1a1a2e" },
  { id: "pinnacle", name: "Pinnacle", color: "#1a3a5c" },
];

interface ConnectDialogProps {
  onConnect?: (platform: string, accountName: string) => void;
}

export function ConnectDialog({ onConnect }: ConnectDialogProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!selectedPlatform || !accountName) return;
    setConnecting(true);
    // Simulate connection
    await new Promise((resolve) => setTimeout(resolve, 1500));
    onConnect?.(selectedPlatform, accountName);
    setConnecting(false);
    setSelectedPlatform(null);
    setAccountName("");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/80">
          <Plus className="h-4 w-4" />
          Connect New Account
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Connect Betting Account
          </DialogTitle>
          <DialogDescription>
            Select a platform and enter your account details to connect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Platform Selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Select Platform</Label>
            <div className="grid grid-cols-3 gap-2">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlatform(p.id)}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs transition-all ${
                    selectedPlatform === p.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary/50 hover:border-border"
                  }`}
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded text-white text-[10px] font-bold"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.slice(0, 2)}
                  </div>
                  <span className="text-foreground">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Account Name */}
          <div>
            <Label className="text-sm font-medium">Account Name</Label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g., My Bet365 Account"
              className="bg-secondary border-border mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            onClick={handleConnect}
            disabled={!selectedPlatform || !accountName || connecting}
          >
            {connecting ? "Connecting..." : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
