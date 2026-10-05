import Image from "next/image";

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-safecrib-black" aria-label="Loading SafeCrib">
      <Image
        src="/logo(black).png"
        alt="SafeCrib"
        width={220}
        height={80}
        priority
        className="h-auto w-44 dark:hidden"
      />
      <Image
        src="/logo(white).png"
        alt="SafeCrib"
        width={220}
        height={80}
        priority
        className="hidden h-auto w-44 dark:block"
      />
    </main>
  );
}