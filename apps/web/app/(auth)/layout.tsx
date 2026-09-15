import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — SafeCrib",
  description: "Sign in to your SafeCrib account",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
