import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOverview, GetOverviewOutputType } from 'zitejs/api';
import { ArrowRight, BarChart3, Hand, Scale, Zap } from 'lucide-react';
import { PageEmpty, PageError, PageLoading } from './PageState';

type Row = GetOverviewOutputType['processes'][number];
type Mix = Row['current'];

// One color per kind of work, used everywhere on this page.
const AUTOMATED = 'hsl(152 55% 42%)';
const REVIEW = 'hsl(38 92% 52%)';
const MANUAL = 'hsl(220 9% 62%)';

const worked = (m: Mix) => m.automated + m.review + m.manual;
const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

/** A bar split into automated, review and manual. */
function MixBar({ mix, tall }: { mix: Mix; tall?: boolean }) {
  const total = worked(mix);
  if (total === 0) return <div className={`${tall ? 'h-4' : 'h-2.5'} rounded-full bg-muted`} />;
  const part = (n: number, color: string, label: string) =>
    n > 0 && <div title={`${n} ${label}`} style={{ width: `${(n / total) * 100}%`, backgroundColor: color }} />;
  return (
    <div className={`flex gap-0.5 overflow-hidden rounded-full ${tall ? 'h-4' : 'h-2.5'}`}>
      {part(mix.automated, AUTOMATED, 'run on their own')}
      {part(mix.review, REVIEW, 'need a person to decide')}
      {part(mix.manual, MANUAL, 'done by hand')}
    </div>
  );
}

function Tile({ Icon, color, value, label, hint }: {
  Icon: typeof Zap;
  color: string;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22`, color }}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Where the time goes, across the whole business. Every step is either done by
 * an app on its own, a choice a person makes (a human review point), or work a
 * person does by hand. The most manual processes are listed first, since those
 * are where automating would pay off.
 */
export default function Overview() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getOverview({})
      .then((r) => setRows(r.processes))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const t = { automated: 0, review: 0, manual: 0, waiting: 0, versionName: '' };
    for (const r of rows ?? []) {
      t.automated += r.current.automated;
      t.review += r.current.review;
      t.manual += r.current.manual;
      t.waiting += r.current.waiting;
    }
    return t;
  }, [rows]);
  const total = worked(totals);

  const ranked = useMemo(
    () => [...(rows ?? [])].filter((r) => worked(r.current) > 0).sort((a, b) => b.current.manual - a.current.manual || a.name.localeCompare(b.name)),
    [rows],
  );

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Where the time goes</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        Every step in every process, sorted by who does the work today. Hand work is where automating pays off. Review
        points are where a person should stay in the loop.
      </p>

      {failed ? (
        <div className="mt-8">
          <PageError onRetry={load} />
        </div>
      ) : rows === null ? (
        <div className="mt-8">
          <PageLoading blocks={2} height="h-40" />
        </div>
      ) : total === 0 ? (
        <div className="mt-8">
          <PageEmpty
            icon={<BarChart3 className="h-6 w-6" />}
            title="Nothing to measure yet"
            text="Map a process with a few steps and this page shows where the time goes."
          />
        </div>
      ) : (
        <>
          <div className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">
                {total} steps across {ranked.length} process{ranked.length === 1 ? '' : 'es'}
              </p>
              {totals.waiting > 0 && (
                <p className="text-xs text-muted-foreground">{totals.waiting} waiting steps not counted</p>
              )}
            </div>
            <div className="mt-3">
              <MixBar mix={totals} tall />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Tile
              Icon={Zap}
              color={AUTOMATED}
              value={`${pct(totals.automated, total)}%`}
              label="Runs on its own"
              hint={`${totals.automated} steps an app already does`}
            />
            <Tile
              Icon={Scale}
              color={REVIEW}
              value={`${pct(totals.review, total)}%`}
              label="A person decides"
              hint={`${totals.review} review points to keep human`}
            />
            <Tile
              Icon={Hand}
              color={MANUAL}
              value={`${pct(totals.manual, total)}%`}
              label="Done by hand"
              hint={`${totals.manual} steps that could be automated`}
            />
          </div>

          <h2 className="mt-10 text-sm font-semibold">Most manual first</h2>
          <p className="mt-1 text-xs text-muted-foreground">The best places to look for time to win back.</p>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {ranked.map((r) => {
              const now = worked(r.current);
              const future = r.future ? worked(r.future) : 0;
              const gain = r.future && future > 0 ? pct(r.future.automated, future) - pct(r.current.automated, now) : 0;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/process/${r.id}`)}
                    className="group grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto] items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.name}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            r.live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {r.live ? 'Live' : 'Draft'}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {r.current.manual} by hand · {r.current.review} review · {r.current.automated} automated
                      </span>
                    </span>
                    <span className="min-w-0">
                      <MixBar mix={r.current} />
                      {r.future && (
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="min-w-0 flex-1">
                            <MixBar mix={r.future} />
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-emerald-700">
                            Future: {pct(r.future.automated, future)}% automated{gain > 0 ? ` (+${gain})` : ''}
                          </span>
                        </span>
                      )}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {[
              [AUTOMATED, 'Runs on its own'],
              [REVIEW, 'A person decides'],
              [MANUAL, 'Done by hand'],
            ].map(([color, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
