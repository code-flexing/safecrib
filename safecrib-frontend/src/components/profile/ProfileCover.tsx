"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";

const overlayBtn =
  "absolute top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 focus-visible:outline focus-visible:outline-2";

export function ProfileCover({
  coverUrl,
  onMenu,
  accentColor,
}: { coverUrl?: string | null; onMenu: () => void; accentColor?: string | null }) {
  const router = useRouter();
  const goBack = () =>
    window.history.length > 1 ? router.back() : router.push("/");

  return (
    <div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-muted to-background sm:h-48">
      {coverUrl ? (
        <Image src={coverUrl} alt="" fill className="object-cover" />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                accentColor
                  ? `linear-gradient(135deg, ${accentColor} 0%, color-mix(in oklab, ${accentColor} 40%, transparent) 55%, transparent 100%)`
                  : "linear-gradient(135deg, #0C7355 0%, transparent 100%)",
            }}
          />
          <div className="absolute inset-0 opacity-[0.07] bg-[url('/brand-pattern.svg')]" />
        </>
      )}
      <button aria-label="Go back" onClick={goBack} className={`${overlayBtn} left-3`}>
        <Icon name="back" className="h-5 w-5" />
      </button>
      <button aria-label="More options" onClick={onMenu} className={`${overlayBtn} right-3`}>
        <Icon name="more-horizontal" className="h-5 w-5" />
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}