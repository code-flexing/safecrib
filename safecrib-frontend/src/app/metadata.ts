import type { Metadata, Viewport } from "next";

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
