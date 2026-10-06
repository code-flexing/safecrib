type SkeletonProps = {
  className?: string;
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  animate?: boolean;
};

const roundedMap = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
} as const;

export function Skeleton({
  className = "",
  rounded = "md",
  animate = true,
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`${animate ? "safecrib-skeleton" : "bg-black/[0.04]"} ${roundedMap[rounded]} ${className}`}
    />
  );
}
