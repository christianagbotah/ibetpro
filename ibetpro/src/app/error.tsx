"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-6">
      <Card className="bg-card border-border max-w-md w-full">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-16 w-16 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">
            Application Error
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            An unexpected error occurred. This has been logged and our team will investigate.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={reset}
              className="bg-primary hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Link href="/">
              <Button variant="outline" className="border-border">
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
