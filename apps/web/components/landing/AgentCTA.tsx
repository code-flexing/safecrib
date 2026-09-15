import Link from "next/link";

/**
 * AgentCTA — distinct secondary section for agents/landlords.
 * Different audience, different job — not squeezed into student-facing copy.
 */
export function AgentCTA() {
  return (
    <section className="section-pad border-b border-[#E5E5E5] bg-ink">
      <div className="content-max">
        <div className="max-w-xl">
          <p className="text-[rgba(255,255,255,0.4)] text-sm font-body mb-6 tracking-wide">
            For agents & landlords
          </p>

          <h2 className="font-display text-display-xl text-paper mb-6">
            List once.
            <br />
            Rent with confidence.
          </h2>

          <p className="text-[rgba(255,255,255,0.6)] text-base font-body mb-10 leading-relaxed max-w-sm">
            SafeCrib&apos;s pHash system flags duplicate photos across every
            listing, so your property isn&apos;t used by someone else to run a
            scam. Verification protects your reputation too.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/auth/register?role=AGENT" className="btn-primary-dark inline-flex px-8 py-3">
              List your property
            </Link>
            <Link href="/auth/login" className="btn-secondary-dark inline-flex px-8 py-3">
              Sign in
            </Link>
          </div>

          <ul className="mt-10 space-y-2">
            {[
              "Perceptual image hashing — stolen photos detected before you publish",
              "Booking state machine prevents double-bookings at the DB level",
              "Trust score visible to students — verified agents get more enquiries",
            ].map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-[rgba(255,255,255,0.5)] font-body">
                <span className="w-1 h-1 rounded-full bg-[rgba(255,255,255,0.3)] mt-2 shrink-0" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
