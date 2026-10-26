import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBrain, GetBrainOutputType } from 'zitejs/api';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { flowLayout } from '@/lib/brainFlow';
import { useMe } from '@/lib/me';
import { FlowView, MixBar } from './Brain';
import { PageEmpty, PageError, PageLoading } from './PageState';
import { hueFor } from './RoleAvatar';

type Data = GetBrainOutputType;

/** The company's processes, loaded once for both viewer pages. */
function useBrain() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getBrain({}).then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, failed, load };
}

/**
 * What a viewer sees first, and almost all they see: one short list of the
 * processes that are live, grouped by department. Click one to see its steps.
 */
export function ViewerHome() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { data, failed, load } = useBrain();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const live = data.processes.filter((p) => p.live && p.stepCount > 0 && (!q || p.name.toLowerCase().includes(q)));
    const byDept = new Map<string, typeof live>();
    for (const p of live) {
      const key = p.department || '';
      byDept.set(key, [...(byDept.get(key) ?? []), p]);
    }
    return [...byDept.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [data, query]);

  const first = me?.firstName?.trim();
  return (
    <div className="mx-auto max-w-[760px] px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{first ? `How we work, ${first}` : 'How we work'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick a process to see every step.</p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a process"
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      <div className="mt-6">
        {failed ? (
          <PageError onRetry={load} />
        ) : !data ? (
          <PageLoading blocks={3} height="h-16" />
        ) : groups.length === 0 ? (
          query ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No process matches that.</p>
          ) : (
            <PageEmpty icon={<Search className="h-6 w-6" />} title="Nothing to see yet" text="Processes show up here once they go live." />
          )
        ) : (
          groups.map(([dept, procs]) => (
            <section key={dept || '~'} className="mb-5">
              <p className="mb-1 flex items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dept ? `hsl(${hueFor(dept)} 60% 55%)` : 'hsl(var(--muted-foreground))' }} />
                {dept || 'Other'}
              </p>
              <ul>
                {procs.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/view/${p.id}`)}
                      className="group grid w-full grid-cols-[minmax(0,1fr)_auto_96px_16px] items-center gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card hover:shadow-[0_1px_3px_rgba(16,24,40,0.06)]"
                    >
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {p.stepCount} steps{p.ownerName ? ` · ${p.ownerName}` : ''}
                      </span>
                      <MixBar a={p.automated} r={p.review} m={p.manual} />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * One process, the way the Brain shows it: every step left to right with its
 * arrows, and a slim note when you point at a step. Nothing can be changed.
 */
export function ViewerProcess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, failed, load } = useBrain();
  const p = data?.processes.find((x) => x.id === id && x.live) ?? null;
  const names = useMemo(() => new Map((data?.processes ?? []).map((x) => [x.id, x.name])), [data]);
  const layout = useMemo(() => (p ? flowLayout(p.steps.map((s) => s.id), p.links) : null), [p]);
  const runBy = useMemo(
    () => (data && p ? data.processes.filter((x) => x.runs.some((r) => r.processId === p.id)).map((x) => x.name) : []),
    [data, p],
  );

  return (
    <div className="px-6 py-6">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All processes
      </button>
      {p?.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{p.description}</p>}
      <div className="mt-4">
        {failed ? (
          <PageError onRetry={load} />
        ) : !data ? (
          <PageLoading blocks={1} height="h-64" />
        ) : !p || !layout ? (
          <PageEmpty icon={<Search className="h-6 w-6" />} title="That process isn't available" text="It may not be live yet. Go back to see the ones that are." />
        ) : (
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <div className="overflow-x-auto">
              <div className="relative" style={{ width: Math.max(layout.width, 600), height: layout.height }}>
                <FlowView
                  p={p}
                  rect={{ x: 0, y: 0, w: layout.width, h: layout.height }}
                  layout={layout}
                  lens={null}
                  names={names}
                  runBy={runBy}
                  onJump={(next) => navigate(`/view/${next}`)}
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
