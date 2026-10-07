"use client";

import { Icon } from "@/components/ui/Icon";

type HelpLink = { label: string; href: string; icon: string };

const helpLinks: HelpLink[] = [
  { label: "Help center", href: "/support", icon: "help-circle" },
  { label: "Contact support", href: "/support", icon: "message-circle" },
  { label: "Terms of Service", href: "/terms", icon: "info" },
  { label: "Privacy Policy", href: "/privacy", icon: "info" },
];

export function HelpSupportContent() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-safecrib-black">Support</h3>
        <p className="mt-1 text-sm text-black/55">Visit the Help Center or contact SafeCrib support.</p>
        <ul className="mt-3 space-y-1">
          {helpLinks.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="flex items-center gap-2 rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium text-safecrib-black hover:border-safecrib-green hover:bg-safecrib-green/[0.03]"
              >
                <Icon name={link.icon as never} className="h-4 w-4 text-black/35" />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-4">
        <p className="text-xs text-black/40">
          Terms of Service and Privacy Policy pages are not yet published. They will appear here when available.
        </p>
      </div>
    </div>
  );
}
