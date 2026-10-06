import AppLayoutShell from "@/components/layout/AppLayoutShell";
import { NetworkMonitor } from "@/components/network/NetworkMonitor";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export { metadata, viewport } from "./metadata";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="safecrib-theme-frame bg-safecrib-white font-sans text-safecrib-black antialiased">
        <ThemeProvider>
          <PWAProvider>
            <Analytics />
            <NetworkMonitor />
            <AppLayoutShell>{children}</AppLayoutShell>
            <InstallPrompt />
          </PWAProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
 