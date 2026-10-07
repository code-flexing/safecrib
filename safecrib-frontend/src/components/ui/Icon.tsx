export type IconName = 
  | "home" 
  | "settings" 
  | "page" 
  | "support" 
  | "logout" 
  | "back" 
  | "search" 
  | "image" 
  | "notifications"
  | "map-pin"
  | "bed"
  | "droplet"
  | "heart"
  | "thumbs-up"
  | "zap"
  | "message-circle"
  | "share-2"
  | "eye"
  | "bookmark"
  | "phone"
  | "calendar-plus"
  | "play"
  | "x"
  | "chevron-left"
  | "chevron-right"
  | "more-horizontal"
  | "check-circle"
  | "flag"
  | "download"
  | "copy"
  | "edit-2"
  | "trash-2"
  | "film";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName | string; className?: string }) {
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
      {name === "notifications" && <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>}
      {/* Additional icons for listing cards */}
      {name === "map-pin" && <><path d="M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>}
      {name === "bed" && <><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v8H2" /><path d="M2 14h20M7 8v4M12 8v4" /></>}
      {name === "droplet" && <><path d="M12 2C6.5 9 4 13 4 16a8 8 0 0 0 16 0c0-3-2.5-7-8-14Z" /></>}
      {name === "heart" && <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />}
      {name === "thumbs-up" && <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.2a3 3 0 0 0 3-3.5L21 9h-7ZM18 9a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Z" />}
      {name === "zap" && <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />}
      {name === "message-circle" && <><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.4 8.4 0 0 1-5.8-2.3L3 21l3.3-3.7a8.4 8.4 0 0 1-1.3-4.8 8.4 8.4 0 0 1 8.5-8.5 8.4 8.4 0 0 1 8.5 8.5Z" /></>}
      {name === "share-2" && <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>}
      {name === "eye" && <><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></>}
      {name === "bookmark" && <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />}
      {name === "phone" && <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.8.7A2 2 0 0 1 22 16.9Z" />}
      {name === "calendar-plus" && <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></>}
      {name === "play" && <polygon points="5,3 19,12 5,21" />}
      {name === "x" && <><path d="M18 6 6 18M6 6l12 12" /></>}
      {name === "chevron-left" && <path d="m15 18-6-6 6-6" />}
      {name === "chevron-right" && <path d="m9 18 6-6-6-6" />}
      {name === "more-horizontal" && <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>}
      {name === "check-circle" && <><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="m22 4-10 10-3-3" /></>}
      {name === "flag" && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>}
      {name === "download" && <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>}
      {name === "copy" && <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
      {name === "edit-2" && <><path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>}
      {name === "trash-2" && <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></>}
      {name === "film" && <><rect x="2" y="2" width="20" height="20" rx="2.2" /><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" /></>}
    </svg>
  );
}
