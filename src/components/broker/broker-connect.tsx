"use client";

import { useState, useCallback, useMemo } from "react";
import { useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Link2, RefreshCw, Wallet, Shield, CheckCircle2,
  AlertCircle, Globe, Key, User, Lock, ChevronRight,
  Search, MapPin, Smartphone, Star, ArrowLeft,
} from "lucide-react";
import {
  REGIONS,
  getPlatformsForRegion,
  getCurrencyForRegion,
  getContinents,
  searchRegions,
  type RegionInfo,
  type BrokerPlatformInfo,
} from "@/lib/regions";

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
  currency: string;
  allocatedAmount: number;
  allocationLock: boolean;
  totalBrokerBets: number;
  totalBrokerProfit: number;
  lastBetPlacedAt: string | null;
  features: {
    liveBetting: boolean;
    cashout: boolean;
    partialCashout: boolean;
    accumulators: boolean;
    maxAccumulatorLegs: number;
    minStake: number;
    maxStake: number;
  } | null;
}

type ConnectStep = "region" | "platform" | "credentials";

export function BrokerConnect() {
  const { toast } = useToast();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [step, setStep] = useState<ConnectStep>("region");
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
    apiKey: "",
    token: "",
  });
  const [accountName, setAccountName] = useState("");
  const [regionSearch, setRegionSearch] = useState("");
  const [selectedContinent, setSelectedContinent] = useState<string>("all");

  const { data, loading, refresh } = useFetch<{
    accounts: ConnectedAccount[];
    availablePlatforms: BrokerPlatformInfo[];
  }>("/api/broker/connect", { accounts: [], availablePlatforms: [] });

  const accounts = data?.accounts || [];

  // Get filtered regions based on search and continent
  const filteredRegions = useMemo(() => {
    let regions = regionSearch ? searchRegions(regionSearch) : REGIONS;
    if (selectedContinent !== "all") {
      regions = regions.filter((r) => r.continent === selectedContinent);
    }
    return regions;
  }, [regionSearch, selectedContinent]);

  // Get platforms for selected region
  const platformsForRegion = useMemo(() => {
    if (!selectedRegion) return [];
    return getPlatformsForRegion(selectedRegion);
  }, [selectedRegion]);

  const selectedRegionInfo = useMemo(() => {
    return REGIONS.find((r) => r.code === selectedRegion);
  }, [selectedRegion]);

  const selectedPlatformData = platformsForRegion.find((p) => p.id === selectedPlatform);

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
          region: selectedRegion,
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
        resetForm();
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
  }, [selectedPlatform, credentials, accountName, selectedRegion, toast, refresh]);

  const handleSync = useCallback(async (accountId: string) => {
    try {
      const res = await fetch("/api/broker/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bettingAccountId: accountId }),
      });

      const result = await res.json();

      if (result.success) {
        const currency = result.balance?.currency || "USD";
        toast({
          title: "Account Synced",
          description: `Balance: ${currency} ${result.balance.total.toFixed(2)}`,
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

  const resetForm = () => {
    setCredentials({ username: "", password: "", apiKey: "", token: "" });
    setAccountName("");
    setSelectedPlatform(null);
    setStep("region");
    setRegionSearch("");
    setSelectedContinent("all");
  };

  const handleDialogClose = (open: boolean) => {
    setConnectDialogOpen(open);
    if (!open) resetForm();
  };

  const formatBalance = (amount: number, currency: string) => {
    const region = REGIONS.find((r) => r.currencyCode === currency);
    const symbol = region?.currencySymbol || "$";
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const continents = getContinents();

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" />
              Connected Brokers
            </CardTitle>
            <Dialog open={connectDialogOpen} onOpenChange={handleDialogClose}>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground"
                onClick={() => setConnectDialogOpen(true)}
              >
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                Connect Broker
              </Button>

              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-h-[90vh] max-[640px]:h-screen max-[640px]:max-h-screen max-[640px]:w-screen max-[640px]:max-w-screen max-[640px]:rounded-none max-[640px]:p-4">
                <DialogHeader>
                  <DialogTitle>Connect Your Broker Account</DialogTitle>
                </DialogHeader>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex items-center gap-1.5 text-xs ${step === "region" ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === "region" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {step !== "region" ? "✓" : "1"}
                    </div>
                    Region
                  </div>
                  <div className="h-px flex-1 bg-border" />
                  <div className={`flex items-center gap-1.5 text-xs ${step === "platform" ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === "platform" ? "bg-primary text-primary-foreground" : step === "credentials" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {step === "credentials" ? "✓" : "2"}
                    </div>
                    Platform
                  </div>
                  <div className="h-px flex-1 bg-border" />
                  <div className={`flex items-center gap-1.5 text-xs ${step === "credentials" ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === "credentials" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      3
                    </div>
                    Connect
                  </div>
                </div>

                {/* ====== STEP 1: REGION SELECTION ====== */}
                {step === "region" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Select your country or region. This helps us show betting platforms available in your area and set the right currency.
                    </p>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={regionSearch}
                        onChange={(e) => setRegionSearch(e.target.value)}
                        placeholder="Search country or currency..."
                        className="bg-secondary border-border pl-9"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setSelectedContinent("all")}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                          selectedContinent === "all"
                            ? "bg-primary/10 text-primary border border-primary/30"
                            : "bg-secondary/50 text-muted-foreground border border-border"
                        }`}
                      >
                        All
                      </button>
                      {continents.map((c) => (
                        <button
                          key={c}
                          onClick={() => setSelectedContinent(c)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                            selectedContinent === c
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "bg-secondary/50 text-muted-foreground border border-border"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto -webkit-overflow-scrolling-touch">
                      {filteredRegions.map((region) => {
                        const platformCount = getPlatformsForRegion(region.code).length;
                        return (
                          <button
                            key={region.code}
                            onClick={() => {
                              setSelectedRegion(region.code);
                              setStep("platform");
                            }}
                            className={`flex items-center gap-2 rounded-lg border p-2.5 transition-all text-left hover:bg-primary/5 active:scale-[0.98] ${
                              selectedRegion === region.code
                                ? "border-primary/30 bg-primary/5"
                                : "border-border"
                            }`}
                          >
                            <span className="text-lg">{region.flag}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{region.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {region.currencySymbol} {region.currencyCode} · {platformCount} platforms
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {filteredRegions.length === 0 && (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">No regions found matching your search</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ====== STEP 2: PLATFORM SELECTION ====== */}
                {step === "platform" && selectedRegionInfo && (
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        setStep("region");
                        setSelectedPlatform(null);
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ArrowLeft className="h-3 w-3" /> Change region
                    </button>

                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                      <span className="text-lg">{selectedRegionInfo.flag}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{selectedRegionInfo.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Currency: {selectedRegionInfo.currencySymbol} {selectedRegionInfo.currencyCode} ({selectedRegionInfo.currencyName})
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {platformsForRegion.length} platforms available in {selectedRegionInfo.name}. Select your betting platform.
                    </p>

                    <div className="space-y-2 max-h-64 overflow-y-auto -webkit-overflow-scrolling-touch">
                      {platformsForRegion.map((platform) => {
                        const isPopular = platform.popularIn.includes(selectedRegion);
                        return (
                          <button
                            key={platform.id}
                            onClick={() => {
                              setSelectedPlatform(platform.id);
                              setStep("credentials");
                            }}
                            className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-primary/5 active:scale-[0.98] transition-colors text-left w-full"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white shrink-0"
                                style={{ backgroundColor: platform.color || "#10b981" }}
                              >
                                {platform.logo}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-foreground">{platform.name}</p>
                                  {isPopular && (
                                    <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/30 text-[9px] px-1 py-0">
                                      <Star className="h-2.5 w-2.5 mr-0.5" /> Popular
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {platform.authType.replace(/_/g, " ")} · {platform.mobileApp ? "📱 App" : "Web only"}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ====== STEP 3: CREDENTIALS ====== */}
                {step === "credentials" && selectedPlatformData && selectedRegionInfo && (
                  <div className="space-y-4">
                    <button
                      onClick={() => {
                        setStep("platform");
                        setSelectedPlatform(null);
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ArrowLeft className="h-3 w-3" /> Change platform
                    </button>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: selectedPlatformData.color || "#10b981" }}
                      >
                        {selectedPlatformData.logo}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{selectedPlatformData.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedPlatformData.authType.replace(/_/g, " ")} authentication
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">{selectedRegionInfo.flag} {selectedRegionInfo.name}</p>
                        <p className="text-xs font-medium text-primary">{selectedRegionInfo.currencySymbol} {selectedRegionInfo.currencyCode}</p>
                      </div>
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

                    {/* Platform features */}
                    <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Platform Features</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedPlatformData.features.liveBetting && (
                          <Badge variant="secondary" className="text-[10px]">Live Betting</Badge>
                        )}
                        {selectedPlatformData.features.cashout && (
                          <Badge variant="secondary" className="text-[10px]">Cashout</Badge>
                        )}
                        {selectedPlatformData.features.partialCashout && (
                          <Badge variant="secondary" className="text-[10px]">Partial Cashout</Badge>
                        )}
                        {selectedPlatformData.features.accumulators && (
                          <Badge variant="secondary" className="text-[10px]">Accumulators (up to {selectedPlatformData.features.maxAccumulatorLegs} legs)</Badge>
                        )}
                        {selectedPlatformData.mobileApp && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Smartphone className="h-2.5 w-2.5 mr-0.5" /> Mobile App
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Min stake: {selectedRegionInfo.currencySymbol}{selectedPlatformData.features.minStake.toLocaleString()} ·
                        Max stake: {selectedRegionInfo.currencySymbol}{selectedPlatformData.features.maxStake.toLocaleString()}
                      </p>
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
                Select your region, pick a platform, and connect your account. No deposits needed.
              </p>
              <Button
                size="sm"
                className="mt-4 bg-primary text-primary-foreground"
                onClick={() => setConnectDialogOpen(true)}
              >
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                Select Your Region
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const regionInfo = account.brokerRegion ? REGIONS.find((r) => r.code === account.brokerRegion) : null;
                return (
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
                          <p className="text-xs text-muted-foreground">
                            {account.platformName}
                            {regionInfo && ` · ${regionInfo.flag} ${regionInfo.name}`}
                          </p>
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
                        <p className="text-sm font-bold text-foreground">{formatBalance(account.balance, account.currency)}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <p className="text-[10px] text-muted-foreground">Allocated</p>
                        <p className="text-sm font-bold text-primary">{formatBalance(account.allocatedAmount, account.currency)}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <p className="text-[10px] text-muted-foreground">Bets Placed</p>
                        <p className="text-sm font-bold text-foreground">{account.totalBrokerBets}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2.5">
                        <p className="text-[10px] text-muted-foreground">Profit</p>
                        <p className={`text-sm font-bold ${account.totalBrokerProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatBalance(account.totalBrokerProfit, account.currency)}
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
