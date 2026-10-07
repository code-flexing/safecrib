type Props = {
  displayName?: string | null | unknown;
  username?: string | null;
  fallback?: string;
  className?: string;
  nameClassName?: string;
  usernameClassName?: string;
  showUsername?: boolean;
};

/**
 * Renders the bold display name followed by the muted @username handle.
 * Falls back to `fallback` (e.g. "SafeCrib member") when no display name is set.
 */
export function NameHandle({
  displayName,
  username,
  fallback = "SafeCrib member",
  className,
  nameClassName = "font-semibold text-safecrib-black",
  usernameClassName = "ml-1.5 font-normal text-black/45",
  showUsername = true,
}: Props) {
  const name = typeof displayName === "string" && displayName.trim() ? displayName : fallback;
  const handle = typeof username === "string" && username.trim() ? username.trim() : null;
  return (
    <span className={className}>
      <span className={nameClassName}>{name}</span>
      {showUsername && handle ? <span className={usernameClassName}>@{handle}</span> : null}
    </span>
  );
}