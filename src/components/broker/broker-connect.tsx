"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Link2, RefreshCw, Wallet, Shield, CheckCircle2,
  AlertCircle, Globe, Key, User, Lock, ChevronRight,
} from "lucide-react";

interface BrokerPlatform {
  id: string;
  name: string;
  regions: string[];
  authType: string;
  supportedSports: string[];
  features: {
    liveBetting: boolean;
    cashout: boolean;
    partialCashout: boolean;
    accumulators: boolean;
    maxAccumulatorLegs: number;
    minStake: number;
    maxStake: number;
  };
}

interface ConnectedAccount {
  id: string;
  platform: string;
  platformName: string;
  accountName: string;
  isConnected: boolean;
  sessionValid: boolean;
  needsRefresh: boolean;
  sessionExpiry: string | null;
  brokerType: string;
  brokerRegion: string | null;
  balance: number;
  allocatedAmount: number;
  allocationLock: boolean;
  totalBrokerBets: number;
  totalBrokerProfit: number;
  lastBetPlacedAt: string | null;
  features: BrokerPlatform["features"] | null;
}

export function BrokerConnect() {
  const { toast } = useToast();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
    apiKey: "",
    token: "",
  });
  const [accountName, setAccountName] = useState("");
  const [region, setRegion] = useState("");

  const { data, loading, refresh } = useFetch<{
    accounts: ConnectedAccount[];
    availablePlatforms: BrokerPlatform[];
  }>("/api/broker/connect", { accounts: [], availablePlatforms: [] });

  const accounts = data?.accounts || [];
  const platforms = data?.availablePlatforms || [];

  const handleConnect = useCallback(async () => {
    if (!selectedPlatform) return;
    setConnecting(true);

    try {
      const res = await fetch("/api/broker/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformId: selectedPlatform,
          credentials,
          region,
          accountName: accountName || undefined,
        }),
      });

      const result = await res.json();

      if (result.success) {
        toast({
          title: "Broker Connected!",
          description: `${result.account.accountName} connected successfully`,
        });
        setConnectDialogOpen(false);
        setCredentials({ username: "", password: "", apiKey: "", token: "" });
        setAccountName("");
        setSelectedPlatform(null);
        refresh();
      } else {
        toast({
          title: "Connection Failed",
          description: result.error || "Failed to connect broker",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to connect broker",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  }, [selectedPlatform, credentials, accountName, region, toast, refresh]);

  const handleSync = useCallback(async (accountId: string) => {
    try {
      const res = await fetch("/api/broker/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bettingAccountId: accountId }),
      });

      const result = await res.json();

      if (result.success) {
        toast({
          title: "Account Synced",
          description: `Balance: $${result.balance.total.toFixed(2)}`,
        });
        refresh();
      } else {
        toast({
          title: "Sync Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Sync Error", variant: "destructive" });
    }
  }, [toast, refresh]);

  const selectedPlatformData = platforms.find((p) => p.id === selectedPlatform);

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" />
              Connected Brokers
            </CardTitle>
            <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary text-primary-foreground">
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Connect Broker
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Connect Your Broker Account</DialogTitle>
                </DialogHeader>

                {!selectedPlatform ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Select your betting platform. Your broker account will be linked securely,
                      and you choose how much to allocate for auto-betting.
                    </p>
                    <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
                      {platforms.map((platform) => (
                        <button
                          key={platform.id}
                          onClick={() => setSelectedPlatform(platform.id)}
                          className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-primary/5 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                              <Globe className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{platform.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Auth: {platform.authType.replace(/_/g, " ")} | Regions: {platform.regions.join(", ")}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Globe className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{selectedPlatformData?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedPlatformData?.authType.replace(/_/g, " ")} authentication
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => setSelectedPlatform(null)}
                      >
                        Change
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Account Name</Label>
                        <Input
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          placeholder={`My ${selectedPlatformData?.name} Account`}
                          className="bg-secondary border-border mt-1"
                        />
                      </div>

                      {selectedPlatformData?.regions && selectedPlatformData.regions.length > 1 && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Region</Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {selectedPlatformData.regions.map((r) => (
                              <button
                                key={r}
                                onClick={() => setRegion(r)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                                  region === r
                                    ? "bg-primary/10 text-primary border border-primary/30"
                                    : "bg-secondary/50 text-muted-foreground border border-border"
                                }`}
                              >
                                {r.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <Separator />

                      {selectedPlatformData?.authType === "web_session" && (
                        <>
                          <div>
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" /> Username / Email
                            </Label>
                            <Input
                              value={credentials.username}
                              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                              placeholder="Your broker username"
                              className="bg-secondary border-border mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Lock className="h-3 w-3" /> Password
                            </Label>
                            <Input
                              type="password"
                              value={credentials.password}
                              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                              placeholder="Your broker password"
                              className="bg-secondary border-border mt-1"
                            />
                          </div>
                        </>
                      )}

                      {selectedPlatformData?.authType === "api_key" && (
                        <div>
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Key className="h-3 w-3" /> API Key
                          </Label>
                          <Input
                            value={credentials.apiKey}
                            onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
                            placeholder="Your broker API key"
                            className="bg-secondary border-border mt-1"
                          />
                        </div>
                      )}

                      {selectedPlatformData?.authType === "oauth" && (
                        <div>
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Shield className="h-3 w-3" /> OAuth Token
                          </Label>
                          <Input
                            value={credentials.token}
                            onChange={(e) => setCredentials({ ...credentials, token: e.target.value })}
                            placeholder="OAuth access token"
                            className="bg-secondary border-border mt-1"
                          />
                        </div>
                      )}

                      {selectedPlatformData?.authType === "manual" && (
                        <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-3">
                          <p className="text-xs text-muted-foreground">
                            Manual connection: You provide your account details and manage bets manually.
                            The app will track your allocation and commission.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                      <p className="text-xs text-muted-foreground">
                        <Shield className="h-3 w-3 inline mr-1" />
                        Your credentials are encrypted and stored securely. The app only uses your
                        allocation to place bets and never withdraws more than you authorize.
                      </p>
                    </div>

                    <Button
                      className="w-full bg-primary text-primary-foreground"
                      onClick={handleConnect}
                      disabled={connecting}
                    >
                      {connecting ? (
                        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Connecting...</>
                      ) : (
                        <><Link2 className="h-4 w-4 mr-2" /> Connect {selectedPlatformData?.name}</>
                      )}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8">
              <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No brokers connected yet. Connect your betting platform to get started.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The app uses your broker allocation to place bets - no deposits needed.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Globe className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{account.accountName}</p>
                        <p className="text-xs text-muted-foreground">{account.platformName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {account.isConnected ? (
                        <Badge className="bg-emerald-400/10 text-emerald-400 border-emerald-400/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                        </Badge>
                      ) : (
                        <Badge className="bg-red-400/10 text-red-400 border-red-400/30">
                          <AlertCircle className="h-3 w-3 mr-1" /> Disconnected
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSync(account.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Balance</p>
                      <p className="text-sm font-bold text-foreground">${account.balance.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Allocated</p>
                      <p className="text-sm font-bold text-primary">${account.allocatedAmount.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Bets Placed</p>
                      <p className="text-sm font-bold text-foreground">{account.totalBrokerBets}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <p className="text-[10px] text-muted-foreground">Profit</p>
                      <p className={`text-sm font-bold ${account.totalBrokerProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ${account.totalBrokerProfit.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {account.needsRefresh && (
                    <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-2">
                      <p className="text-xs text-amber-400">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Session needs refresh. Click sync to reconnect.
                      </p>
                    </div>
                  )}

                  {account.features && (
                    <div className="flex flex-wrap gap-1.5">
                      {account.features.liveBetting && (
                        <Badge variant="secondary" className="text-[10px]">Live Betting</Badge>
                      )}
                      {account.features.cashout && (
                        <Badge variant="secondary" className="text-[10px]">Cashout</Badge>
                      )}
                      {account.features.partialCashout && (
                        <Badge variant="secondary" className="text-[10px]">Partial Cashout</Badge>
                      )}
                      {account.features.accumulators && (
                        <Badge variant="secondary" className="text-[10px]">Accumulators</Badge>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
