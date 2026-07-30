import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-6">
      <Card className="bg-card border-border max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="text-6xl font-bold text-primary mb-2">404</div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            Page Not Found
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/">
              <Button className="bg-primary hover:bg-primary/90">
                <Home className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <Link href="javascript:history.back()">
              <Button variant="outline" className="border-border">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
