export type IconName = "home" | "settings" | "page" | "support" | "logout" | "back" | "search" | "image";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {name === "home" && <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>}
      {name === "settings" && <><path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z" /><path d="m19.4 13.5 1.3 1-.9 1.6-1.6-.4a7.8 7.8 0 0 1-1.5 1l-.3 1.7h-1.9l-.6-1.5a7.7 7.7 0 0 1-1.8 0l-.9 1.3-1.7-.7.2-1.7a7.7 7.7 0 0 1-1.3-1.3l-1.7.2-.7-1.7 1.3-.9a7.7 7.7 0 0 1 0-1.8l-1.3-.9.7-1.7 1.7.2a7.7 7.7 0 0 1 1.3-1.3l-.2-1.7 1.7-.7.9 1.3a7.7 7.7 0 0 1 1.8 0l.9-1.3 1.7.7-.2 1.7a7.7 7.7 0 0 1 1.3 1.3l1.7-.2.7 1.7-1.3.9a7.7 7.7 0 0 1 0 1.8Z" /></>}
      {name === "page" && <><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v6h5M9 13h7M9 17h7" /></>}
      {name === "support" && <><path d="M4 13v-2a8 8 0 0 1 16 0v2" /><path d="M4 12H3v5h4v-5H4Zm16 0h1v5h-4v-5h3ZM17 20h-5" /></>}
      {name === "logout" && <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>}
      {name === "back" && <path d="m14.5 5-7 7 7 7M8 12h13" />}
      {name === "search" && <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 5 5" /></>}
      {name === "image" && <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>}
    </svg>
  );
}
