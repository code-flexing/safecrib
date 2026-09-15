import { Hero } from "@/components/landing/Hero";
import { TrustProofStrip } from "@/components/landing/TrustProofStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { AgentCTA } from "@/components/landing/AgentCTA";

export const metadata = {
  title: "SafeCrib — Trusted Student Housing",
  description:
    "Find verified student accommodation. Every listing manually reviewed — no scams, no double-booked rooms, protected deposits.",
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <TrustProofStrip />
      <HowItWorks />
      <AgentCTA />
    </>
  );
}
