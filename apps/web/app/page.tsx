import Navbar from "@/components/marketing/Navbar";
import LandingHero from "@/components/marketing/LandingHero";

// Redirect for authenticated users is handled by middleware via the
// safecrib_access_token cookie — no server-side session check needed here.
export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="pt-24 px-4 md:px-8">
        <LandingHero />
      </div>
    </div>
  );
}
