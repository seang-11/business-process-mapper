import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getSharedProcess, GetSharedProcessOutputType } from 'zitejs/api';
import { AlertCircle, FileDown, Network } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import ProcessTimeline from './ProcessTimeline';
import ElementIcon from './ElementIcon';

type Shared = GetSharedProcessOutputType;

const prettyDay = (value: string) => {
  const d = value ? new Date(`${value}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
};

/** Prints cleanly: no buttons, a white page, and the timeline left to flow across pages. */
const PRINT_CSS = `
@media print {
  .share-noprint { display: none !important; }
  body { background: white !important; }
  .share-page { background: white !important; min-height: 0 !important; }
  .share-page * { box-shadow: none !important; }
  .share-page li, .share-page [role="button"] { break-inside: avoid; }
  .share-page [role="button"] { cursor: default; }
}
`;

/**
 * The public, read-only page behind a share link. No sign-in: the secret in the
 * address is the only way in, and it shows the live version of one process.
 */
export default function SharedProcess() {
  const { token = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<Shared | null | 'error'>(null);

  const load = useCallback(() => {
    setData(null);
    getSharedProcess({ token })
      .then(setData)
      .catch(() => setData('error'));
  }, [token]);
  useEffect(load, [load]);

  // "Save as PDF" opens this page with ?print=1, which opens the print dialog once it has loaded.
  const wantsPrint = searchParams.get('print') === '1';
  const ready = data !== null && data !== 'error' && data.available;
  useEffect(() => {
    if (!wantsPrint || !ready) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [wantsPrint, ready]);

  const steps = useMemo(() => (ready ? (data.steps as ProcessStep[]) : []), [ready, data]);
  const connections = useMemo(() => (ready ? (data.connections as ProcessConnection[]) : []), [ready, data]);

  // Who is involved: the people, then every app that runs or is used in a step.
  const { people, apps } = useMemo(() => {
    const p = new Map<string, ElementRef>();
    const a = new Map<string, ElementRef>();
    const add = (e: ElementRef | null | undefined) => {
      if (!e) return;
      if (e.actorClass === 'System') a.set(e.id, e);
      else if (e.actorClass === 'Human') p.set(e.id, e);
    };
    for (const s of steps) {
      add(s.performedBy);
      s.uses.forEach(add);
    }
    return { people: [...p.values()], apps: [...a.values()] };
  }, [steps]);

  return (
    <div className="share-page min-h-screen bg-[hsl(220_20%_98.5%)]">
      <style>{PRINT_CSS}</style>

      <header className="share-noprint border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2.5 px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Network className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Business Process Mapper</span>
          {ready && (
            <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => window.print()}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" /> Save as PDF
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-10 pt-8">
        {data === null ? (
          <div className="space-y-4" role="status" aria-label="Loading">
            <Skeleton className="h-10 w-72 rounded-xl" />
            <Skeleton className="h-6 w-96 max-w-full rounded-xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : data === 'error' ? (
          <Notice
            title="That didn't load"
            text="Something went wrong on our side. Try again in a moment."
            action={<Button variant="outline" onClick={load}>Try again</Button>}
          />
        ) : !data.available ? (
          <Notice
            title="This link isn't available anymore"
            text="It may have been turned off, or the process isn't live yet. Ask whoever sent it for a new link."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{data.processName}</h1>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                Live
              </span>
            </div>
            {data.liveFrom && (
              <p className="mt-1 text-xs text-muted-foreground">{data.versionName} · live since {prettyDay(data.liveFrom)}</p>
            )}
            {data.description && <p className="mt-3 text-base leading-relaxed">{data.description}</p>}

            {(people.length > 0 || apps.length > 0) && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {people.length > 0 && <Involved title="Who is involved" items={people} />}
                {apps.length > 0 && <Involved title="Runs on" items={apps} />}
              </div>
            )}
          </>
        )}
      </main>

      {ready && (
        // The timeline brings its own width and padding. Steps look like buttons, so they are calmed down here.
        <div className="[&_[role=button]]:cursor-default [&_[role=button]]:hover:border-border">
          <ProcessTimeline steps={steps} connections={connections} onOpenStep={() => {}} />
        </div>
      )}

      <footer className="pb-10 text-center text-xs text-muted-foreground">Made with Business Process Mapper</footer>
    </div>
  );
}

function Involved({ title, items }: { title: string; items: ElementRef[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map((e) => (
          <span
            key={e.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium"
          >
            <ElementIcon name={e.name} image={e.image} icon={e.icon} typeIcon={e.typeIcon} color={e.color} size={14} />
            {e.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function Notice({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
      </span>
      <p className="mt-4 text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
