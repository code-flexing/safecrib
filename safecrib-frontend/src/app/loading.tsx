import Image from "next/image";

export default function Loading() {
  return (
    <main className="flex min-h-[40vh] items-center justify-center px-6" role="status" aria-label="Loading SafeCrib">
      <Image
        src="/logo(black).png"
        alt="SafeCrib"
        width={180}
        height={65}
        priority
        className="h-auto w-36"
      />
    </main>
  );
}
