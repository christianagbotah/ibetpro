"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Brain, Loader2, AlertCircle, Shield, Zap, TrendingUp, CheckCircle2 } from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for registration success message from URL params
  useEffect(() => {
    if (searchParams.get("registered") === "true") {
      setSuccess("Account created successfully! Please sign in with your credentials.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (isAuthenticated) {
      const callbackUrl = searchParams.get("callbackUrl") || "/";
      router.push(callbackUrl);
    }
  }, [isAuthenticated, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isRegister) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Registration failed");
          return;
        }

        // Redirect to login page with success message
        router.push("/login?registered=true");
      } else {
        const result = await login(email, password);
        if (result.success) {
          // Small delay to let NextAuth session refresh propagate
          await new Promise((resolve) => setTimeout(resolve, 300));
          const callbackUrl = searchParams.get("callbackUrl") || "/";
          router.push(callbackUrl);
        } else {
          setError(result.error || "Invalid credentials");
        }
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Left: Branding & Features */}
        <div className="hidden lg:block">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Brain className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  iBet<span className="text-primary">Pro</span>
                </h1>
                <p className="text-xs text-muted-foreground">AI-Powered Betting Intelligence</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">4-Model Ensemble AI</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Poisson Distribution, ELO Rating, Monte Carlo Simulation, and Bookmaker Odds Implied Probability combined for maximum accuracy.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-400/10">
                <Shield className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Kelly Criterion Staking</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Optimal bet sizing with quarter-Kelly strategy and 10% bankroll cap. Risk management built into every recommendation.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Auto-Betting Engine</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Set your risk parameters and let AI automatically place value bets, manage cashouts, and protect your bankroll.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-400/10">
                <TrendingUp className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Real-Time Cashout</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  AI monitors live matches and recommends optimal cashout moments based on win probability calculations.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 rounded-xl bg-secondary/50 border border-border">
            <p className="text-xs text-muted-foreground">
              <span className="text-primary font-medium">10% commission</span> is deducted from winning bet profits to support platform maintenance and AI model improvements.
            </p>
          </div>
        </div>

        {/* Right: Login Form */}
        <div>
          <div className="text-center mb-6 lg:hidden">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Brain className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">iBetPro</h1>
            </div>
            <p className="text-xs text-muted-foreground">AI-Powered Betting Intelligence</p>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-center text-lg">
                {isRegister ? "Create Account" : "Sign In"}
              </CardTitle>
              <p className="text-center text-xs text-muted-foreground">
                {isRegister
                  ? "Join iBetPro and start winning with AI"
                  : "Welcome back! Enter your credentials"}
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {isRegister && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Full Name</Label>
                    <Input
                      type="text"
                      placeholder="Enter your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-secondary border-border"
                      required={isRegister}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email</Label>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-secondary border-border"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Password</Label>
                    {!isRegister && (
                      <button
                        type="button"
                        onClick={() => router.push("/forgot-password")}
                        className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-secondary border-border"
                    required
                    minLength={8}
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    <p className="text-xs text-red-400">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-400">{success}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/80 h-10"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isRegister ? (
                    "Create Account"
                  ) : (
                    "Sign In"
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(!isRegister);
                      setError("");
                      setSuccess("");
                    }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {isRegister
                      ? "Already have an account? Sign in"
                      : "Don't have an account? Register"}
                  </button>
                </div>

                {isRegister && (
                  <div className="rounded-lg bg-secondary/50 p-3 mt-4">
                    <p className="text-[10px] text-muted-foreground text-center">
                      Password must be at least 8 characters. Your data is secured with industry-standard encryption.
                    </p>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-[10px] text-muted-foreground mt-4">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
