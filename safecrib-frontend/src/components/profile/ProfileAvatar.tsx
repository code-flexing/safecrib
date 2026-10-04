"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const backgrounds = ["#DCEFE7", "#F5E3D7", "#E1E8FA", "#F4EAC6", "#F1DDE9", "#D6E9EE"];
const skinTones = ["#F2C7A5", "#C9875E", "#E3AA82", "#8B553D", "#D99A73", "#F0D0B3"];
const hairColors = ["#32251F", "#49311F", "#17191F", "#8A542B", "#563846", "#242C38"];
const shirtColors = ["#187A5B", "#C45147", "#315D9A", "#B27625", "#714B83", "#187D83"];

function variantIndex(seed: string, length: number, offset = 0) {
  let hash = 2166136261 ^ offset;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) % length;
}

type ProfileAvatarProps = {
  src?: string | null;
  seed?: string | null;
  alt: string;
  size?: "small" | "medium" | "large";
  className?: string;
};

export function ProfileAvatar({
  src,
  seed,
  alt,
  size = "medium",
  className = "",
}: ProfileAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const avatarSeed = seed?.trim() || alt;

  useEffect(() => {
    if (src) setFailedSource(null);
  }, [src]);
  const index = variantIndex(avatarSeed, backgrounds.length);
  const hairStyle = variantIndex(avatarSeed, 4, 41);
  const sizeClass = size === "small" ? "h-12 w-12" : size === "large" ? "h-32 w-32" : "h-16 w-16";
  const imageClass = `${sizeClass} shrink-0 overflow-hidden rounded-full border border-black/10 ${className}`;

  if (src && failedSource !== src) {
    return <Image src={src} alt={alt} width={128} height={128} unoptimized onError={() => setFailedSource(src)} className={`${imageClass} object-cover`} />;
  }

  return (
    <svg
      role="img"
      aria-label={alt}
      viewBox="0 0 96 96"
      className={imageClass}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="48" cy="48" r="48" fill={backgrounds[index]} />
      <path d="M12 96c3-20 15-30 36-30s33 10 36 30" fill={shirtColors[variantIndex(avatarSeed, shirtColors.length, 13)]} />
      <path d="M40 60h16v17H40z" fill={skinTones[variantIndex(avatarSeed, skinTones.length, 7)]} />
      <ellipse cx="48" cy="43" rx="22" ry="26" fill={skinTones[variantIndex(avatarSeed, skinTones.length, 7)]} />
      <path
        d={[
          "M25 42C22 24 34 13 49 14c16 1 24 12 22 29-4-5-6-11-6-17-8 5-18 8-34 7-1 4-3 7-6 9Z",
          "M26 42C19 27 27 14 43 12c18-2 29 9 28 27-5-2-8-8-10-13-8 8-20 11-35 10Z",
          "M25 43c-4-18 6-30 23-30s27 12 23 30c-4-3-6-9-7-14-8 5-20 6-33 5-1 3-3 6-6 9Z",
          "M25 45c-2-19 8-31 24-31 16 0 25 12 22 31-3-4-5-9-6-15-4 8-12 12-23 12-7 0-12 1-17 3Z",
        ][hairStyle]}
        fill={hairColors[variantIndex(avatarSeed, hairColors.length, 23)]}
      />
      <path d="M37 44h3m16 0h3" stroke="#342721" strokeWidth="3" strokeLinecap="round" />
      <path d="M43 55c3 3 7 3 10 0" fill="none" stroke="#9E584F" strokeWidth="2" strokeLinecap="round" />
      <circle cx="26" cy="48" r="3" fill={skinTones[variantIndex(avatarSeed, skinTones.length, 7)]} />
      <circle cx="70" cy="48" r="3" fill={skinTones[variantIndex(avatarSeed, skinTones.length, 7)]} />
    </svg>
  );
}