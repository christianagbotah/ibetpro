"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Shield,
  Zap,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Globe,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

type BrokerMode = "demo" | "real";

interface BrokerModeToggleProps {
  currentMode?: BrokerMode;
  onModeChange?: (mode: BrokerMode) => void;
}

export function BrokerModeToggle({ currentMode: propMode, onModeChange }: BrokerModeToggleProps) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<BrokerMode>(propMode || "demo");
  const [loading, setLoading] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<BrokerMode | null>(null);

  // Fetch current mode from API
  const fetchMode = useCallback(async () => {
    try {
      const res = await fetch("/api/broker/mode");
      if (res.ok) {
        const data = await res.json();
        setMode(data.mode || "demo");
        onModeChange?.(data.mode || "demo");
      }
    } catch (error) {
      console.error("Failed to fetch broker mode:", error);
    }
  }, [onModeChange]);

  useEffect(() => {
    if (!propMode) {
      fetchMode();
    }
  }, [propMode, fetchMode]);

  const handleModeSwitch = async (targetMode: BrokerMode) => {
    if (targetMode === mode) return;

    // If switching to real mode, show confirmation dialog
    if (targetMode === "real") {
      setPendingMode(targetMode);
      setConfirmDialogOpen(true);
      return;
    }

    // Switching to demo mode is straightforward
    await performSwitch(targetMode);
  };

  const performSwitch = async (targetMode: BrokerMode) => {
    setLoading(true);
    try {
      const res = await fetch("/api/broker/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: targetMode }),
      });

      const data = await res.json();

      if (data.success) {
        setMode(targetMode);
        onModeChange?.(targetMode);
        addToast("success", data.message);
      } else {
        addToast("error", data.error || "Failed to switch broker mode");
        // If there was an error, the mode might have been reset
        if (data.mode) {
          setMode(data.mode);
        }
      }
    } catch {
      addToast("error", "Failed to switch broker mode");
    } finally {
      setLoading(false);
      setConfirmDialogOpen(false);
      setPendingMode(null);
    }
  };

  const isDemo = mode === "demo";
  const isReal = mode === "real";

  return (
    <>
      <Card className={`border-2 ${isDemo ? "border-blue-500/30 bg-blue-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              {isDemo ? (
                <FlaskConical className="h-4 w-4 text-blue-400" />
              ) : (
                <Globe className="h-4 w-4 text-emerald-400" />
              )}
              Broker Mode
            </CardTitle>
            <Badge className={`text-xs ${isDemo ? "bg-blue-400/10 text-blue-400 border-blue-400/30" : "bg-emerald-400/10 text-emerald-400 border-emerald-400/30"}`}>
              {isDemo ? "Sandbox" : "Live"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode description */}
          <div className="rounded-lg bg-secondary/30 p-3">
            {isDemo ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  <FlaskConical className="h-3 w-3 inline mr-1 text-blue-400" />
                  <strong className="text-blue-400">Sandbox Mode</strong> — Broker connections are simulated.
                  Any credentials will work for testing. No real money is involved.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">No real API calls</Badge>
                  <Badge variant="secondary" className="text-[10px]">Simulated balance</Badge>
                  <Badge variant="secondary" className="text-[10px]">Safe for testing</Badge>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  <Globe className="h-3 w-3 inline mr-1 text-emerald-400" />
                  <strong className="text-emerald-400">Live Mode</strong> — Real broker API connections.
                  Your actual broker credentials are used. Real money is at stake.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">Real API calls</Badge>
                  <Badge variant="secondary" className="text-[10px]">Live balance</Badge>
                  <Badge variant="secondary" className="text-[10px]">Real money</Badge>
                </div>
              </div>
            )}
          </div>

          {/* Toggle buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleModeSwitch("demo")}
              disabled={loading || isDemo}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                isDemo
                  ? "border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/5"
                  : "border-border bg-card hover:border-blue-500/30 hover:bg-blue-500/5"
              } ${loading ? "opacity-50" : ""}`}
            >
              {isDemo && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-400" />
                </div>
              )}
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isDemo ? "bg-blue-500/20" : "bg-secondary/50"}`}>
                <FlaskConical className={`h-5 w-5 ${isDemo ? "text-blue-400" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-medium ${isDemo ? "text-blue-400" : "text-foreground"}`}>Demo</p>
                <p className="text-[10px] text-muted-foreground">Test with simulated data</p>
              </div>
            </button>

            <button
              onClick={() => handleModeSwitch("real")}
              disabled={loading || isReal}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                isReal
                  ? "border-emerald-500/50 bg-emerald-500/10 shadow-lg shadow-emerald-500/5"
                  : "border-border bg-card hover:border-emerald-500/30 hover:bg-emerald-500/5"
              } ${loading ? "opacity-50" : ""}`}
            >
              {isReal && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
              )}
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isReal ? "bg-emerald-500/20" : "bg-secondary/50"}`}>
                <Zap className={`h-5 w-5 ${isReal ? "text-emerald-400" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-medium ${isReal ? "text-emerald-400" : "text-foreground"}`}>Real</p>
                <p className="text-[10px] text-muted-foreground">Connect to live brokers</p>
              </div>
            </button>
          </div>

          {/* Warning banner for real mode */}
          {isReal && (
            <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-3">
              <p className="text-xs text-amber-400">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                <strong>Live Mode Active:</strong> Your broker credentials are being used to make real API calls.
                Real money is at stake. The AI bot will place actual bets using your broker account.
              </p>
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Switching mode...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog for switching to Real mode */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Switch to Real Mode?
            </DialogTitle>
            <DialogDescription>
              You are about to switch from Demo to Real broker mode.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-4 space-y-3">
              <p className="text-sm text-amber-400 font-medium">Important:</p>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                  <span>Real broker API calls will be made with your credentials</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                  <span>The AI bot will place <strong>actual bets</strong> using your broker account</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                  <span>Real money is at stake — you could lose your allocated funds</span>
                </li>
                <li className="flex items-start gap-2">
                  <Shield className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
                  <span>Commission will be automatically deducted from profits</span>
                </li>
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">
              Make sure you have connected at least one broker account and set your allocation
              before switching to Real mode.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setConfirmDialogOpen(false);
                  setPendingMode(null);
                }}
              >
                Stay in Demo
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => pendingMode && performSwitch(pendingMode)}
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Switching...</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" /> Switch to Real</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
