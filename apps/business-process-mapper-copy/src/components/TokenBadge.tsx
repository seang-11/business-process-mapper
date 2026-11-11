import type { Token } from '@/lib/elementTokens';

/** The pill used wherever a party or status value is displayed. */
export function TokenBadge({
  token,
  className = '',
}: {
  token: Token | null;
  className?: string;
}) {
  if (!token) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded border ${token.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
      {token.label}
    </span>
  );
}

/** The dot on its own, for dropdown rows where the label is already there. */
export function TokenDot({ token }: { token: Token | null }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full shrink-0 ${token ? token.dot : 'bg-transparent'}`}
    />
  );
}
