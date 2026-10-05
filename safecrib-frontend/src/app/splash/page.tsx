"use client";

import Image from "next/image";
import { useEffect } from "react";

export default function SplashPage() {
  useEffect(() => {
    const destination = localStorage.getItem("safecrib_access_token") ? "/dashboard" : "/login";
    const timeout = window.setTimeout(() => window.location.replace(destination), 900);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6" aria-label="Loading SafeCrib">
      <Image
        src="/logo(black).png"
        alt="SafeCrib"
        width={220}
        height={80}
        priority
        className="h-auto w-44"
      />
    </main>
  );
}
