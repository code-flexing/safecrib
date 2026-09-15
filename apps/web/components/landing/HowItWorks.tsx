/**
 * HowItWorks — genuine 3-step sequence. Content is sequential so a numbered
 * list is earned here.
 */

const STEPS = [
  {
    n: "01",
    title: "Search verified listings",
    description:
      "Every listing is reviewed by a real person before students can see it. If a room is on SafeCrib, it exists and the agent is who they say they are.",
  },
  {
    n: "02",
    title: "Hold with a protected deposit",
    description:
      "Placing a hold locks the room for 24 hours so no one else can book it under you. Your deposit is held, not transferred — the backend prevents double-sells at the database level.",
  },
  {
    n: "03",
    title: "Move in",
    description:
      "Once confirmed, you get the full booking record. If anything goes wrong, raise a dispute from your dashboard — the resolution process is built in, not bolted on.",
  },
];

export function HowItWorks() {
  return (
    <section className="section-pad border-b border-[#E5E5E5]">
      <div className="content-max">
        <div className="mb-12">
          <h2 className="font-display text-display-lg text-ink mb-4">
            How it works
          </h2>
          <p className="text-muted text-base max-w-md font-body">
            Three steps — none of them involve wiring money to a stranger you
            found on a Facebook group.
          </p>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-[#E5E5E5]">
          {STEPS.map((step) => (
            <li key={step.n} className="px-0 md:px-8 py-8 md:py-0 first:pl-0 last:pr-0">
              <p className="font-display text-[2.5rem] text-[#E5E5E5] leading-none mb-6 select-none" aria-hidden>
                {step.n}
              </p>
              <h3 className="font-display text-display-md text-ink mb-3">
                {step.title}
              </h3>
              <p className="text-muted text-sm font-body leading-relaxed">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
