"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PWAInstallBanner } from "@/components/pwa/install-banner";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useState } from "react";

const noShellRoutes = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isNoShell = noShellRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isNoShell) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 bg-card border-border">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMobileMenuToggle={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-background p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      {/* PWA install banner */}
      <PWAInstallBanner />

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  );
}
