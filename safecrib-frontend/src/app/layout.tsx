import type { Metadata, Viewport } from "next";
import { NetworkMonitor } from "@/components/network/NetworkMonitor";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "SafeCrib | Campus living, with more certainty",
  description:
    "Explore student homes with clearer details, reviewed providers, and campus essentials close by.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c7355",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="safecrib-theme-frame bg-safecrib-white font-sans text-safecrib-black antialiased">
        <ThemeProvider>
          <PWAProvider>
            <Analytics />
            <NetworkMonitor />
            {children}
            <InstallPrompt />
          </PWAProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
