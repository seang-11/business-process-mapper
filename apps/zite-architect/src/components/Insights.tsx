import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInsights, GetInsightsOutputType } from 'zitejs/api';
import { ArrowRight, Clock } from 'lucide-react';
import ElementIcon from './ElementIcon';
import { PageError, PageLoading } from './PageState';

const plural = (n: number, word: string, many?: string) => `${n} ${n === 1 ? word : many ?? `${word}s`}`;
const hrs = (h: number) => `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} hrs`;
const READY_SHOWN = 6;
const ROLES_SHOWN = 6;

/**
 * The whole business at a glance: where people's time goes, how much apps
 * already do, and which manual steps are the next ones to hand to an app.
 * Hours are estimates (minutes per step times runs per month), so the page
 * always says how much of the map has them.
 */
export default function Insights() {
  const navigate = useNavigate();
  const [data, setData] = useState<GetInsightsOutputType | null>(null);
  const [failed, setFailed] = useState(false);
  const [by, setBy] = useState<'process' | 'role'>('process');
  const [allReady, setAllReady] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    setData(null);
    getInsights({}).then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        Where your team's time goes, and what to hand to apps next.
      </p>
      <div className="mt-7">
        {failed ? <PageError onRetry={load} /> : !data ? <PageLoading blocks={3} height="h-40" /> : body(data)}
      </div>
    </div>
  );

  function body(data: GetInsightsOutputType) {
    const totalHours = data.processes.reduce((n, p) => n + (p.hours ?? 0), 0);
    const saved = data.processes.reduce((n, p) => n + (p.hours !== null && p.futureHours !== null ? Math.max(0, p.hours - p.futureHours) : 0), 0);
    const hasHours = totalHours > 0;
    const share = data.countedSteps ? Math.round((data.automatedSteps / data.countedSteps) * 100) : 0;

    const rows =
      by === 'process'
        ? data.processes.map((p) => ({
            id: p.id,
            name: p.name,
            hours: p.hours,
            saved: p.hours !== null && p.futureHours !== null ? Math.max(0, p.hours - p.futureHours) : 0,
            onClick: () => navigate(`/process/${p.id}`),
          }))
        : [
            ...data.roles.slice(0, ROLES_SHOWN).map((r) => ({ id: r.id, name: r.name, hours: r.hours as number | null, saved: r.saved, onClick: () => navigate(`/roles/${r.id}`) })),
            ...(data.roles.length > ROLES_SHOWN
              ? [{
                  id: 'rest',
                  name: 'Everyone else',
                  hours: data.roles.slice(ROLES_SHOWN).reduce((n, r) => n + r.hours, 0) as number | null,
                  saved: data.roles.slice(ROLES_SHOWN).reduce((n, r) => n + r.saved, 0),
                  onClick: undefined as undefined | (() => void),
                }]
              : []),
          ];
    const max = Math.max(1, ...rows.map((r) => r.hours ?? 0));
    const ready = allReady ? data.ready : data.ready.slice(0, READY_SHOWN);

    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="People time per month" value={hasHours ? hrs(totalHours) : '—'} note={hasHours ? undefined : 'Add time estimates to see this'} />
          <Stat label="Steps done by apps" value={`${share}%`} note={`${data.automatedSteps} of ${data.countedSteps} steps`} />
          <Stat
            label="Future versions save"
            value={saved > 0 ? `${hrs(saved)}/mo` : '—'}
            good={saved > 0}
            note={data.futureVersions ? `${plural(data.futureVersions, 'version')} not live yet` : 'No versions in the works'}
          />
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight">Where the hours go</h2>
            <div className="flex rounded-lg border border-border p-0.5 text-xs font-medium">
              {(['process', 'role'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBy(k)}
                  className={`rounded-md px-3 py-1 transition-colors ${by === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  By {k}
                </button>
              ))}
            </div>
          </div>
          {!hasHours ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-muted/50 p-4 text-sm">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">No time estimates yet</p>
                <p className="mt-1 text-muted-foreground">
                  Give a process its runs per month (edit the process), and its people steps their minutes per run (edit a step).
                  Rough guesses are fine: the point is to see where the time goes.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> People hours now</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-300" /> Saved by the future version</span>
              </p>
              <div className="mt-3">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!r.onClick}
                    onClick={r.onClick}
                    className="grid w-full grid-cols-[minmax(0,200px)_minmax(0,1fr)_72px] items-center gap-4 rounded-lg px-2 py-2 text-left text-sm enabled:hover:bg-muted/50"
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="relative h-2.5 overflow-hidden rounded-full bg-muted">
                      {r.hours !== null && (
                        <>
                          <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(r.hours / max) * 100}%` }} />
                          {r.saved > 0 && (
                            <span
                              className="absolute inset-y-0 bg-emerald-300"
                              style={{ left: `${((r.hours - r.saved) / max) * 100}%`, width: `${(r.saved / max) * 100}%` }}
                            />
                          )}
                        </>
                      )}
                    </span>
                    <span className="text-right text-muted-foreground">
                      {r.hours === null ? <span className="text-xs">No estimate</span> : hrs(r.hours)}
                      {r.saved > 0 && <span className="block text-[11px] text-emerald-700">−{hrs(r.saved)}</span>}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Based on {data.processesWithRuns} of {data.processCount} processes with runs per month, and {data.peopleStepsWithMinutes} of{' '}
                {data.peopleSteps} people steps with minutes.
              </p>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">Ready to automate</h2>
            <span className="text-xs text-muted-foreground">{plural(data.ready.length, 'manual step')} that move work between apps</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasHours ? 'Ranked by hours per month.' : 'Ranked by how many apps each step touches. Add time estimates to rank by hours.'}
          </p>
          {data.ready.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No manual steps move work between apps right now.</p>
          ) : (
            <ol className="mt-3">
              {ready.map((r, i) => (
                <li key={r.stepId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/process/${r.processId}`)}
                    className="group grid w-full grid-cols-[24px_minmax(0,1fr)_80px] items-start gap-3 border-t border-border px-1 py-3.5 text-left hover:bg-muted/30"
                  >
                    <span className="pt-0.5 text-sm text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {r.who} · {r.processName}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-1">
                        {r.apps.map((a, j) => (
                          <span key={a.id} className="flex items-center gap-1">
                            {j > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={11} />
                              {a.name}
                            </span>
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="text-right">
                      {r.hours !== null ? (
                        <>
                          <span className="block text-sm font-medium">{hrs(r.hours)}</span>
                          <span className="block text-[11px] text-muted-foreground">per month</span>
                        </>
                      ) : r.minutes !== null ? (
                        <span className="block text-xs text-muted-foreground">{r.minutes} min a run</span>
                      ) : (
                        <span className="block text-xs text-muted-foreground">{plural(r.apps.length, 'app')}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {data.ready.length > READY_SHOWN && (
            <button
              type="button"
              onClick={() => setAllReady((v) => !v)}
              className="mt-1 w-full border-t border-border pt-3 text-left text-sm font-medium text-primary"
            >
              {allReady ? 'Show fewer' : `Show all ${data.ready.length}`}
            </button>
          )}
        </section>
      </div>
    );
  }
}

function Stat({ label, value, note, good }: { label: string; value: string; note?: string; good?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${good ? 'text-emerald-700' : ''}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
