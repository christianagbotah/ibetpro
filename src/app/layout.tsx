import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#10b981",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "iBetPro - AI Betting Platform",
  description: "AI-powered automated betting platform with broker integration. Connect your betting account, set your risk parameters, and let AI place value bets automatically.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "iBetPro",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/icon-192x192.svg",
  },
  openGraph: {
    title: "iBetPro - AI Betting Platform",
    description: "AI-powered automated betting with smart cashout and broker integration",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${inter.variable} font-sans min-h-full flex flex-col bg-background text-foreground overscroll-none`}>
        <AuthProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
