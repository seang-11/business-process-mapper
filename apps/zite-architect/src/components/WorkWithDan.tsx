import { useEffect, useRef, useState } from 'react';
import { HelpCircle, X, ArrowUpRight } from 'lucide-react';
import { Button } from '@project/components/ui/button';

/**
 * A quiet prompt in the corner, on every screen.
 *
 * This app gets duplicated into other people's workspaces, so the widget
 * travels with each copy. That is the point: it is the one thing in a
 * duplicated app that still points back to Dan.
 *
 * Closed by default. It is an offer, not an interruption, and the app is a
 * working tool people came here to use.
 */

// utm_source names the app, so traffic from duplicated copies is attributable
// without touching the copies themselves.
const SERVICES_URL =
  'https://www.featureful.com/services?utm_source=business-process-mapper&utm_medium=app&utm_campaign=work-with-dan';

export default function WorkWithDan() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape and outside clicks close it. A corner popover that traps you is
  // worse than no popover.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[19rem] rounded-xl border border-border bg-card p-5 shadow-xl">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="float-right -mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="pr-6 text-sm font-semibold leading-snug text-foreground">
            Need a hand building an automated operating system for your business?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Work with Dan Leeman to make it happen.
          </p>

          <Button asChild size="sm" className="mt-4 w-full gap-1.5">
            <a href={SERVICES_URL} target="_blank" rel="noopener noreferrer">
              Learn More
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Need a hand building an automated operating system for your business?"
        aria-expanded={open}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
