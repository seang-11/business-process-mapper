import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';

/**
 * The three calm states every page uses, so loading, nothing-here-yet and
 * something-went-wrong always look the same.
 */

/** Soft placeholder blocks while a page loads. */
export function PageLoading({ blocks = 3, height = 'h-28' }: { blocks?: number; height?: string }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      {Array.from({ length: blocks }, (_, i) => (
        <Skeleton key={i} className={`${height} rounded-2xl`} />
      ))}
    </div>
  );
}

/** Nothing to show yet: says why, and says what to do about it. */
export function PageEmpty({ icon, title, text, action }: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="mt-4 text-base font-semibold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Something failed: plain words, and a way to try again. */
export function PageError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <AlertCircle className="h-6 w-6" />
      </span>
      <p className="mt-4 text-base font-semibold">That didn't load</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {message ?? 'Something went wrong on our side. Your work is safe.'}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}
