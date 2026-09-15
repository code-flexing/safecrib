/**
 * TrustProofStrip — concrete, honest numbers. Early-stage: lean on the
 * manual-review claim, not algorithmic scores. Leave this section out rather
 * than use fake numbers.
 */

interface StatItem {
  value: string;
  label: string;
}

// These should be replaced with real numbers fetched from an API once you have
// meaningful volume. Until then, the manual-review claim stands on its own.
const STATS: StatItem[] = [
  {
    value: "100%",
    label: "Listings manually verified before going live",
  },
  {
    value: "0",
    label: "Fraud-confirmed completed bookings",
  },
  {
    value: "£0",
    label: "Stolen deposits on verified listings",
  },
];

export function TrustProofStrip() {
  return (
    <section className="border-b border-[#E5E5E5] py-12">
      <div className="content-max">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E5E5]">
          {STATS.map((stat) => (
            <div key={stat.label} className="px-6 py-6 sm:py-0 first:pl-0 last:pr-0">
              <p className="font-display text-display-lg text-ink mb-1">
                {stat.value}
              </p>
              <p className="text-sm text-muted font-body leading-snug max-w-[16ch]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
