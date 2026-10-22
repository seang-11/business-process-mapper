import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHandoffs, GetHandoffsOutputType } from 'zitejs/api';
import { ArrowLeftRight, ArrowRight, ChevronDown, Cpu, Users } from 'lucide-react';
import { PageEmpty, PageError, PageLoading } from './PageState';
import ElementIcon from './ElementIcon';

type Row = GetHandoffsOutputType['processes'][number];
type Pair = Row['pairs'][number];

// Same colors as the Overview page: amber for what needs care, green for what an app handles.
const PEOPLE = 'hsl(38 92% 52%)';
const APPS = 'hsl(152 55% 42%)';
const ALL = 'hsl(220 9% 62%)';

const KIND_LABEL: Record<Pair['kind'], string> = {
  people: 'Person to person',
  toApp: 'Person to app',
  fromApp: 'App to person',
  appToApp: 'App to app',
};
const KIND_ORDER: Pair['kind'][] = ['people', 'toApp', 'fromApp', 'appToApp'];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Tile({ Icon, color, value, label, why }: {
  Icon: typeof Users;
  color: string;
  value: number;
  label: string;
  why: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22`, color }}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">Why it matters: </span>
        {why}
      </p>
    </div>
  );
}

function Who({ p }: { p: Pair['from'] }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ElementIcon name={p.name} image={p.image} icon={p.icon} typeIcon={p.typeIcon} color={p.color} size={16} />
      <span className="truncate text-sm font-medium">{p.name}</span>
    </span>
  );
}

/**
 * Where work passes from one person or app to another. Every handoff is a
 * chance for work to sit waiting or get dropped, and the ones between two
 * people are the riskiest, so the processes with the most of those come first.
 */
export default function Handoffs() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    setRows(null);
    getHandoffs({})
      .then((r) => setRows(r.processes))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(
    () =>
      (rows ?? []).reduce(
        (t, r) => ({
          handoffs: t.handoffs + r.handoffs,
          people: t.people + r.personToPerson,
          apps: t.apps + r.withApps,
        }),
        { handoffs: 0, people: 0, apps: 0 },
      ),
    [rows],
  );

  const ranked = useMemo(
    () =>
      [...(rows ?? [])]
        .filter((r) => r.stepCount > 0)
        .sort((a, b) => b.personToPerson - a.personToPerson || b.handoffs - a.handoffs || a.name.localeCompare(b.name)),
    [rows],
  );

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Handoffs</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        A handoff is when work passes from one person or app to another. Long chains of handoffs are where work stalls
        or gets dropped.
      </p>

      <div className="mt-7">
        {failed ? (
          <PageError onRetry={load} />
        ) : rows === null ? (
          <PageLoading blocks={3} />
        ) : ranked.length === 0 ? (
          <PageEmpty
            icon={<ArrowLeftRight className="h-6 w-6" />}
            title="No handoffs to show yet"
            text="Map a process with steps for more than one person or app, and its handoffs show up here."
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Tile
                Icon={ArrowLeftRight}
                color={ALL}
                value={totals.handoffs}
                label="Handoffs in total"
                why="Each one is a moment work can sit waiting for someone."
              />
              <Tile
                Icon={Users}
                color={PEOPLE}
                value={totals.people}
                label="Person to person"
                why="These depend on people noticing, so they are where work gets dropped most."
              />
              <Tile
                Icon={Cpu}
                color={APPS}
                value={totals.apps}
                label="To or from an app"
                why="An app passes work on instantly and never forgets, so these rarely stall."
              />
            </div>

            <h2 className="mt-10 text-sm font-semibold">Most person to person first</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The processes where work changes hands between people the most. Open one to see who passes to whom.
            </p>
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {ranked.map((r) => {
                const open = openId === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.id)}
                      aria-expanded={open}
                      className="grid w-full grid-cols-[minmax(0,1.3fr)_auto_auto_auto] items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-muted/40"
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
                          {plural(r.stepCount, 'step')}
                          {r.longestChain > 0 && ` · up to ${plural(r.longestChain, 'handoff')} in a row`}
                          {r.loopBacks > 0 && ` · ${plural(r.loopBacks, 'loop')} back`}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-lg font-semibold tabular-nums" style={{ color: r.personToPerson ? PEOPLE : undefined }}>
                          {r.personToPerson}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">person to person</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-lg font-semibold tabular-nums" style={{ color: r.withApps ? APPS : undefined }}>
                          {r.withApps}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">with apps</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {open && (
                      <div className="border-t border-border bg-muted/20 px-5 py-4">
                        {r.pairs.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Nothing changes hands here. Every step has the same owner.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {KIND_ORDER.map((kind) => {
                              const pairs = r.pairs.filter((p) => p.kind === kind);
                              if (pairs.length === 0) return null;
                              return (
                                <div key={kind}>
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {KIND_LABEL[kind]}
                                  </p>
                                  <ul className="space-y-1.5">
                                    {pairs.map((p) => (
                                      <li
                                        key={`${p.from.id}-${p.to.id}`}
                                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
                                      >
                                        <Who p={p.from} />
                                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <Who p={p.to} />
                                        {p.count > 1 && (
                                          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                                            x{p.count}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate(`/process/${r.id}`)}
                          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          Open the map <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
